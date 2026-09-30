-- CRM — parte 2: renovaciones automáticas y vista de alertas. Requiere la 27.
--
-- 1) Fecha de vencimiento del contrato de mantenimiento, en `proyectos` (decidido con
--    Jhojan 2026-09-29). Al renovar, se actualiza a la nueva fecha y el ciclo se repite.
-- 2) fn_crear_renovaciones_pendientes(): crea la oportunidad de renovación 90 días antes
--    del vencimiento. La llama la app al abrir el tablero del CRM (no hace falta pg_cron):
--    es idempotente, así que llamarla muchas veces no duplica nada.
-- 3) v_oportunidades_alertas: días en la etapa actual contra los umbrales de
--    etapas_config, para reutilizar la regla fuera de la pantalla (avisos, análisis).
--
-- Idempotente.

alter table proyectos
  add column if not exists fecha_vencimiento_contrato date;

create index if not exists idx_proyectos_vencimiento_contrato
  on proyectos (fecha_vencimiento_contrato)
  where fecha_vencimiento_contrato is not null;

-- security definer: tiene que poder crear la renovación aunque quien abre el tablero
-- solo tenga nivel de consulta. Solo inserta renovaciones, nunca modifica ni borra.
create or replace function fn_crear_renovaciones_pendientes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creadas int;
begin
  insert into oportunidades (
    tipo_pipeline, nombre, cliente_id, etapa_id, proyecto_id,
    fecha_estimada_decision, responsable_id, created_by
  )
  select
    'renovacion',
    'Renovación mantenimiento — ' || p.nombre,
    p.cliente_id,
    'renovacion_proxima',
    p.id,
    p.fecha_vencimiento_contrato,
    null,
    null
  from proyectos p
  where p.fecha_vencimiento_contrato is not null
    and p.fecha_vencimiento_contrato <= current_date + 90
    and p.fecha_vencimiento_contrato >= current_date - 30
    -- Una sola renovación por vencimiento: si ya hay una creada en la ventana de este
    -- vencimiento (abierta o cerrada), no se crea otra. Al renovar y mover la fecha un
    -- año adelante, la ventana nueva queda libre y el ciclo arranca de nuevo.
    and not exists (
      select 1 from oportunidades o
      where o.proyecto_id = p.id
        and o.tipo_pipeline = 'renovacion'
        and o.created_at >= p.fecha_vencimiento_contrato - 180
    );

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$$;

revoke all on function fn_crear_renovaciones_pendientes() from public, anon;
grant execute on function fn_crear_renovaciones_pendientes() to authenticated;

-- security_invoker: respeta la RLS de quien consulta (ver 20260924000016).
drop view if exists v_oportunidades_alertas;
create view v_oportunidades_alertas
with (security_invoker = true)
as
select
  o.id as oportunidad_id,
  o.tipo_pipeline,
  o.nombre,
  o.cliente_id,
  o.etapa_id,
  o.estado,
  h.fecha_entrada as en_etapa_desde,
  (current_date - h.fecha_entrada::date) as dias_en_etapa,
  e.dias_alerta,
  e.dias_estancada,
  case
    when o.estado <> 'activa' then null
    when e.dias_estancada is not null and current_date - h.fecha_entrada::date >= e.dias_estancada then 'estancada'
    when e.dias_alerta is not null and current_date - h.fecha_entrada::date >= e.dias_alerta then 'alerta'
    else 'al_dia'
  end as nivel,
  (
    select min(c.fecha_programada) from oportunidad_contactos c
    where c.oportunidad_id = o.id and c.fecha_realizada is null
  ) as proximo_seguimiento,
  o.fecha_reactivacion
from oportunidades o
join etapas_config e on e.id = o.etapa_id
left join oportunidad_etapas_historial h
  on h.oportunidad_id = o.id and h.fecha_salida is null
where o.estado <> 'cerrada';

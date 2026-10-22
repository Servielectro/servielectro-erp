-- Módulo Proyectos (2026-10-29): crear proyectos a mano, para que a los técnicos, a RRHH y a
-- Operativo les aparezca el nombre del proyecto. Va antes que RRHH (64): sin proyectos, los
-- gastos no se pueden cargar a nada (hoy hay 0 proyectos en la base).
--
-- Jhojan: "por el momento vamos a poder crear el proyecto y los datos van a mano, para
-- crearlo y que a los técnicos y demás les aparezca el nombre del proyecto".
--
-- Decisiones:
--   - Módulo propio "proyectos", no dentro de Administrativo ni de Comercial: Financiero se
--     cuelga de acá, y hace falta un permiso propio para crear proyectos sin abrir Comercial.
--   - proyectos.cotizacion_aprobada_id deja de ser obligatoria. Un proyecto puede nacer a mano
--     y enlazarse a su cotización después. Si se enlaza, la cotización tiene que estar
--     APROBADA (igual que antes) y enlazarla pide Comercial "trabajar", porque es dato comercial.
--   - proyectos.cliente_id también deja de ser obligatorio, por la misma razón: el proyecto a
--     mano puede no tener el cliente creado todavía. Al enlazar la cotización, si el proyecto
--     no tiene cliente toma el de la cotización; si tiene otro, se rechaza.
--   - Código automático PRY-AAAA-NNN si se deja vacío (se puede escribir uno a mano).
--   - Los nombres de los proyectos (id, código, nombre, estado; nada de cliente, cotización ni
--     contrato) los lee quien tenga Proyectos, Comercial, Operativo "trabajar" o RRHH
--     "trabajar", con fn_proyectos_nombres(). La tabla sigue cerrada para ellos.
--   - El técnico ve solo los proyectos donde trabaja (fn_proyectos_del_tecnico).
--   - visitas.proyecto_id nuevo. Es clasificación, no evidencia: Operativo lo puede poner
--     también en una visita firmada (excepción en fn_candado_visita).
--
-- Lo que asume que hay cotización, revisado:
--   - v_desviacion_presupuesto cruza con los ítems de la cotización: un proyecto a mano no
--     aparece ahí. Es lo correcto: no tiene presupuesto contra qué comparar.
--   - v_flujo_caja y v_ejecucion_sin_presupuesto no usan la cotización.
--   - fn_crear_renovaciones_pendientes (CRM) copia p.cliente_id en oportunidades, que lo exige:
--     ahora salta los proyectos sin cliente en vez de fallar entera.
--   - La app no lee proyectos.cotizacion_aprobada_id en ningún lado.
--
-- Verificación: supabase/verificaciones/20261029000063_verificar.sql
-- Rollback:     supabase/rollbacks/20261029000063_modulo_proyectos_down.sql
-- Idempotente.

-- ============================================================ 1) módulo
insert into public.modulos (id, nombre, orden)
values ('proyectos', 'Proyectos', 11)
on conflict (id) do nothing;

insert into public.permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'proyectos', 'responsable', true
from public.roles r
where r.nombre = 'Administrador'
on conflict (rol_id, modulo_id) do nothing;

-- ============================================================ 2) proyectos a mano
alter table public.proyectos alter column cotizacion_aprobada_id drop not null;
alter table public.proyectos alter column cliente_id drop not null;
alter table public.proyectos add column if not exists descripcion text;
alter table public.proyectos add column if not exists creado_por uuid references public.perfiles (id) default auth.uid();

-- Antes: solo al crear, y siempre con cotización. Ahora: la cotización es opcional, y se
-- valida también cuando se enlaza después.
create or replace function public.fn_validar_proyecto_desde_cotizacion_aprobada()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_estado estado_cotizacion;
  v_cliente uuid;
  v_anio text := extract(year from (now() at time zone 'America/Bogota'))::text;
  v_siguiente int;
begin
  if tg_op = 'INSERT' and length(trim(coalesce(new.codigo, ''))) = 0 then
    select coalesce(max(substring(codigo from '^PRY-' || v_anio || '-(\d+)$')::int), 0) + 1 into v_siguiente
    from proyectos where codigo ~ ('^PRY-' || v_anio || '-\d+$');
    new.codigo := 'PRY-' || v_anio || '-' || lpad(v_siguiente::text, 3, '0');
  end if;

  if new.cotizacion_aprobada_id is null
     or (tg_op = 'UPDATE' and (new.cotizacion_aprobada_id, new.cliente_id)
                              is not distinct from (old.cotizacion_aprobada_id, old.cliente_id)) then
    return new;
  end if;

  if current_user not in ('postgres', 'supabase_admin') and not fn_tiene_permiso('comercial', 'trabajar') then
    raise exception 'Enlazar la cotización al proyecto, o cambiarle el cliente después, requiere permiso de Comercial.';
  end if;
  select estado, cliente_id into v_estado, v_cliente from cotizaciones where id = new.cotizacion_aprobada_id;
  if v_estado is distinct from 'APROBADA' then
    raise exception 'Solo se puede enlazar una cotización en estado APROBADA';
  end if;
  if new.cliente_id is null then
    new.cliente_id := v_cliente;
  elsif new.cliente_id is distinct from v_cliente then
    raise exception 'La cotización es de otro cliente.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proyectos_validar_cotizacion on public.proyectos;
create trigger trg_proyectos_validar_cotizacion
  before insert or update of cotizacion_aprobada_id, cliente_id, codigo on public.proyectos
  for each row execute function public.fn_validar_proyecto_desde_cotizacion_aprobada();
revoke all on function public.fn_validar_proyecto_desde_cotizacion_aprobada() from public, anon, authenticated;

-- ============================================================ 3) RLS: Comercial o Proyectos
-- Mismos niveles de la tanda 4 (42), sumando el módulo nuevo. proyecto_ejecucion_items no se
-- toca: es costo real, se abre con Financiero.
drop policy if exists proyectos_select on public.proyectos;
create policy proyectos_select on public.proyectos for select to authenticated
  using (fn_tiene_permiso('comercial', 'consultar') or fn_tiene_permiso('proyectos', 'consultar'));
drop policy if exists proyectos_insert on public.proyectos;
create policy proyectos_insert on public.proyectos for insert to authenticated
  with check (fn_tiene_permiso('comercial', 'trabajar') or fn_tiene_permiso('proyectos', 'trabajar'));
drop policy if exists proyectos_update on public.proyectos;
create policy proyectos_update on public.proyectos for update to authenticated
  using (fn_tiene_permiso('comercial', 'trabajar') or fn_tiene_permiso('proyectos', 'trabajar'))
  with check (fn_tiene_permiso('comercial', 'trabajar') or fn_tiene_permiso('proyectos', 'trabajar'));
drop policy if exists proyectos_delete on public.proyectos;
create policy proyectos_delete on public.proyectos for delete to authenticated
  using (fn_tiene_permiso('comercial', 'responsable') or fn_tiene_permiso('proyectos', 'responsable'));

-- ============================================================ 4) nombres de proyectos
-- Solo id, código, nombre y estado. Para elegir el proyecto de un gasto (RRHH), de una
-- visita (Operativo) o mostrarlo. Nada de cliente, cotización ni contrato.
-- RRHH y Operativo con nivel explícito ("trabajar"), no "cualquier nivel".
create or replace function public.fn_proyectos_nombres()
returns table (id uuid, codigo text, nombre text, estado text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.codigo, p.nombre, p.estado::text
  from proyectos p
  where fn_tiene_permiso('proyectos', 'consultar')
     or fn_tiene_permiso('comercial', 'consultar')
     or fn_tiene_permiso('operativo', 'trabajar')
     or fn_tiene_permiso('rrhh', 'trabajar')
  order by p.nombre;
$$;

-- ============================================================ 5) visitas y proyectos del técnico
alter table public.visitas add column if not exists proyecto_id uuid references public.proyectos (id);
create index if not exists idx_visitas_proyecto on public.visitas (proyecto_id);

-- Solo id, código y nombre, y solo donde el técnico trabaja. No abre Comercial.
create or replace function public.fn_proyectos_del_tecnico()
returns table (id uuid, codigo text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.codigo, p.nombre
  from proyectos p
  where p.estado = 'EN_EJECUCION'
    and (
      exists (select 1 from visitas v
              where v.proyecto_id = p.id and v.tecnico_id = auth.uid() and v.estado <> 'cancelada')
      or exists (select 1 from tareas t join tarea_asignados a on a.tarea_id = t.id
                 where t.proyecto_id = p.id and a.perfil_id = auth.uid() and not t.archivada)
    )
  order by p.nombre;
$$;

-- El candado de la visita firmada (migración 60) deja pasar proyecto_id: es clasificación
-- para Financiero, no evidencia. Lo demás, igual que en la 60.
create or replace function public.fn_candado_visita()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Por jsonb: visitas no tiene columna visita_id y plpgsql fallaría al resolver old.visita_id.
  v_visita uuid := case when tg_table_name = 'visitas' then old.id
                        else (to_jsonb(old) ->> 'visita_id')::uuid end;
begin
  if current_user in ('postgres', 'supabase_admin') or not fn_visita_firmada(v_visita) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'La visita ya está firmada por el cliente: no se puede borrar. Agrega una nota posterior.';
  end if;

  if tg_table_name = 'visitas' then
    -- Nada fuera del estado cambia, y el estado solo avanza: firmada → cerrada, con
    -- Operativo. Quedarse igual (un update sin cambios) no es error. Migración 60: el cierre
    -- escribe cerrada_en/cerrada_por/cierre_nota, que controla fn_visita_cierre.
    -- Migración 63: proyecto_id tampoco es evidencia (lo cambia solo Operativo, ver
    -- fn_visitas_solo_estado_tecnico).
    if (to_jsonb(new) - array['estado', 'updated_at', 'cerrada_en', 'cerrada_por', 'cierre_nota', 'proyecto_id'])
       is distinct from (to_jsonb(old) - array['estado', 'updated_at', 'cerrada_en', 'cerrada_por', 'cierre_nota', 'proyecto_id']) then
      raise exception 'La visita ya está firmada por el cliente: no se edita. Agrega una nota posterior.';
    end if;
    if new.estado is distinct from old.estado then
      if not (old.estado = 'firmada' and new.estado = 'cerrada') then
        raise exception 'Una visita firmada no vuelve atrás: de "%" no puede pasar a "%".', old.estado, new.estado;
      end if;
      if not fn_tiene_permiso('operativo', 'trabajar') then
        raise exception 'Cerrar una visita firmada requiere permiso de Operativo.';
      end if;
    end if;
    return new;
  end if;

  -- Jornadas, fotos y sugerencias: el contenido de evidencia no cambia. Un update que deja
  -- el contenido igual (reintento) pasa; lo demás de cada tabla (traslado a Drive de la
  -- foto, recorrido de la sugerencia) sí puede cambiar.
  if fn_contenido_evidencia(tg_table_name, to_jsonb(new)) is distinct from fn_contenido_evidencia(tg_table_name, to_jsonb(old)) then
    -- Migración 58: la única excepción, marcar la salida una vez con la visita "firmada".
    if tg_table_name = 'visita_jornadas'
       and (select estado from visitas where id = v_visita) = 'firmada'
       and fn_es_salida_tras_firma(to_jsonb(old), to_jsonb(new)) then
      return new;
    end if;
    raise exception 'La visita ya está firmada por el cliente: ese registro no se puede cambiar. Agrega una nota posterior.';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_candado_visita() from public, anon, authenticated;

-- ============================================================ 6) renovaciones: saltar proyectos sin cliente
-- Igual que en la tanda 2 (38), con "p.cliente_id is not null": un proyecto a mano sin
-- cliente no puede generar una oportunidad (oportunidades.cliente_id es obligatorio).
create or replace function public.fn_crear_renovaciones_pendientes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creadas int;
begin
  -- Salta la RLS por diseño (crea la renovación aunque quien abre el tablero solo
  -- consulte), pero ya no la puede ejecutar cualquiera: sin comercial/trabajar no hace nada.
  if not fn_tiene_permiso('comercial', 'trabajar') then
    return 0;
  end if;

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
    and p.cliente_id is not null
    and p.fecha_vencimiento_contrato <= current_date + 90
    and p.fecha_vencimiento_contrato >= current_date - 30
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

-- ============================================================ 7) privilegios
do $$
declare
  f text;
begin
  foreach f in array array['fn_proyectos_nombres()', 'fn_proyectos_del_tecnico()', 'fn_crear_renovaciones_pendientes()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

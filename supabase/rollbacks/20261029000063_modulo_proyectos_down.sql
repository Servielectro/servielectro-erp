-- Rollback de 20261029000063 (módulo Proyectos). Correr DESPUÉS del rollback de la 64.
-- OJO: vuelve obligatorias la cotización y el cliente del proyecto. Si ya hay proyectos creados
-- a mano sin alguno de los dos, se detiene sin cambiar nada: hay que enlazarlos o borrarlos
-- antes. Quita visitas.proyecto_id con lo asignado.

do $$
begin
  if exists (select 1 from public.proyectos where cotizacion_aprobada_id is null or cliente_id is null) then
    raise exception 'Hay proyectos sin cotización o sin cliente: enlázalos o bórralos antes de deshacer la 63.';
  end if;
end $$;

drop function if exists public.fn_proyectos_nombres();
drop function if exists public.fn_proyectos_del_tecnico();

-- El candado vuelve a la versión de la 60 (sin la excepción de proyecto_id) antes de quitar
-- la columna.
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
    if (to_jsonb(new) - array['estado', 'updated_at', 'cerrada_en', 'cerrada_por', 'cierre_nota'])
       is distinct from (to_jsonb(old) - array['estado', 'updated_at', 'cerrada_en', 'cerrada_por', 'cierre_nota']) then
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

  if fn_contenido_evidencia(tg_table_name, to_jsonb(new)) is distinct from fn_contenido_evidencia(tg_table_name, to_jsonb(old)) then
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

drop index if exists public.idx_visitas_proyecto;
alter table public.visitas drop column if exists proyecto_id;

-- Renovaciones: como en la tanda 2 (38).
create or replace function public.fn_crear_renovaciones_pendientes()
returns int
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_creadas int;
begin
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
$f$;
revoke all on function public.fn_crear_renovaciones_pendientes() from public, anon;
grant execute on function public.fn_crear_renovaciones_pendientes() to authenticated;

-- RLS: solo Comercial, como en la tanda 4 (42).
drop policy if exists proyectos_select on public.proyectos;
create policy proyectos_select on public.proyectos for select to authenticated
  using (fn_tiene_permiso('comercial', 'consultar'));
drop policy if exists proyectos_insert on public.proyectos;
create policy proyectos_insert on public.proyectos for insert to authenticated
  with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists proyectos_update on public.proyectos;
create policy proyectos_update on public.proyectos for update to authenticated
  using (fn_tiene_permiso('comercial', 'trabajar')) with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists proyectos_delete on public.proyectos;
create policy proyectos_delete on public.proyectos for delete to authenticated
  using (fn_tiene_permiso('comercial', 'responsable'));

-- Validación: como en la 5 (solo al crear, cotización obligatoria).
create or replace function public.fn_validar_proyecto_desde_cotizacion_aprobada()
returns trigger
language plpgsql
as $f$
declare
  v_estado estado_cotizacion;
begin
  select estado into v_estado from cotizaciones where id = new.cotizacion_aprobada_id;
  if v_estado is distinct from 'APROBADA' then
    raise exception 'Solo se puede crear un proyecto desde una cotización en estado APROBADA';
  end if;
  return new;
end;
$f$;
drop trigger if exists trg_proyectos_validar_cotizacion on public.proyectos;
create trigger trg_proyectos_validar_cotizacion
  before insert on public.proyectos
  for each row execute function public.fn_validar_proyecto_desde_cotizacion_aprobada();

alter table public.proyectos drop column if exists creado_por;
alter table public.proyectos drop column if exists descripcion;
alter table public.proyectos alter column cliente_id set not null;
alter table public.proyectos alter column cotizacion_aprobada_id set not null;

delete from public.permisos_rol where modulo_id = 'proyectos';
delete from public.modulos where id = 'proyectos';

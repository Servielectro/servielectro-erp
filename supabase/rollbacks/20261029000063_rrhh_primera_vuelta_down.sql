-- Rollback de 20261029000063. OJO: borra gastos, facturas registradas, permisos, abonos y
-- certificados emitidos, y la columna visitas.proyecto_id con lo que se haya asignado.
-- Exportarlos antes si ya hay datos reales.
-- No borra el bucket rrhh-soportes ni sus archivos: el almacenamiento se vacía solo por la
-- API de Storage (con la clave de servicio), nunca por SQL. Sin las políticas de abajo, nadie
-- con sesión lo puede leer ni escribir.

drop policy if exists rrhh_soportes_select on storage.objects;
drop policy if exists rrhh_soportes_insert on storage.objects;

drop table if exists public.certificados_emitidos;
drop function if exists public.fn_certificados_inmutable();
drop table if exists public.abonos;
drop function if exists public.fn_abonos_reglas();
drop table if exists public.permisos_laborales;
drop function if exists public.fn_permisos_reglas();
drop function if exists public.fn_permiso_fecha_bloqueada(text, date);
drop table if exists public.gasto_soportes;
drop table if exists public.gastos;
drop function if exists public.fn_gastos_reglas();

drop function if exists public.fn_rrhh_soporte_visible(text);
drop function if exists public.fn_rrhh_soporte_subible(text);
drop function if exists public.fn_rrhh_id_de_ruta(text);
drop function if exists public.fn_personas_rrhh();
drop function if exists public.fn_proyectos_para_rrhh();
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

drop table if exists public.rrhh_reglas;
drop function if exists public.fn_es_aprobador_rrhh(text);
drop table if exists public.rrhh_aprobadores;
drop function if exists public.fn_rrhh_ve_todo();

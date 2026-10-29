-- Deshace 20261130000111: fn_sst_equipo_vigente vuelve a la versión de la 109.
create or replace function public.fn_sst_equipo_vigente(p_equipo_id uuid, p_fecha date)
returns boolean language sql stable security definer set search_path = public as $$
  select e.estado = 'activo'
     and (e.fecha_retiro is null or e.fecha_retiro > p_fecha)
     and (e.vida_util_meses is null or e.fecha_ingreso_servicio is null
          or e.fecha_ingreso_servicio + (e.vida_util_meses || ' months')::interval > p_fecha)
     and exists (
       select 1 from sst_equipo_inspecciones i
       where i.equipo_id = e.id and i.fecha <= p_fecha and i.resultado <> 'no_apto'
         and i.fecha + (e.periodicidad_inspeccion_meses || ' months')::interval > p_fecha)
  from sst_equipos e where e.id = p_equipo_id;
$$;

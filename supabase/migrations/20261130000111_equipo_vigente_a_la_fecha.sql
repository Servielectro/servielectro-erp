-- fn_sst_equipo_vigente: dos casos donde no respondía "¿servía ESE día?" (2026-10-30). Encontrados al
-- pasar a archivo las pruebas de la 109.
--
--   1. Un "no apto" POSTERIOR no quitaba la vigencia: la 109 busca CUALQUIER inspección no-no_apto
--      dentro de la periodicidad. Con una apta el 01/10 y una no apta el 15/10, el 20/10 el equipo
--      salía vigente. Ahora cuenta la ÚLTIMA inspección hasta esa fecha: si fue "no apto", no sirve.
--   2. Retirar un equipo HOY invalidaba el pasado: la 109 exige estado = 'activo', que es el estado
--      de hoy. Un arnés retirado hoy (con su fecha de retiro) dejaba sin vigencia los permisos del
--      mes pasado. Ahora un retirado cuenta como activo antes de su fecha de retiro.
--      ('fuera_de_servicio' no trae fecha: sigue contando como no apto desde ya.)
--
-- Misma firma y mismos permisos. Idempotente.
-- Verificación: supabase/verificaciones/20261130000111_verificar.sql
-- Rollback:     supabase/rollbacks/20261130000111_equipo_vigente_a_la_fecha_down.sql

create or replace function public.fn_sst_equipo_vigente(p_equipo_id uuid, p_fecha date)
returns boolean language sql stable security definer set search_path = public as $$
  select (e.estado = 'activo' or (e.estado = 'retirado' and e.fecha_retiro > p_fecha))
     and (e.fecha_retiro is null or e.fecha_retiro > p_fecha)
     and (e.vida_util_meses is null or e.fecha_ingreso_servicio is null
          or e.fecha_ingreso_servicio + (e.vida_util_meses || ' months')::interval > p_fecha)
     and coalesce((
       select u.resultado <> 'no_apto' and u.fecha + (e.periodicidad_inspeccion_meses || ' months')::interval > p_fecha
       from sst_equipo_inspecciones u
       where u.equipo_id = e.id and u.fecha <= p_fecha
       order by u.fecha desc
       limit 1), false)
  from sst_equipos e where e.id = p_equipo_id;
$$;

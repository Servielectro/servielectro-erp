-- Verificación de la migración 43 (fechas en hora de Bogotá). SOLO LECTURA. Correr en
-- una pestaña NUEVA del SQL Editor (la zona horaria de la base aplica a sesiones nuevas).
-- Resultado esperado: todas las filas en "OK".

with chequeos(prueba, esperado, obtenido) as (
  select 'Zona horaria configurada en la base', 'TimeZone=America/Bogota',
         coalesce((select string_agg(c, ' ') from pg_db_role_setting s
                   join pg_database d on d.oid = s.setdatabase,
                   unnest(s.setconfig) c
                   where d.datname = current_database() and s.setrole = 0
                     and c ilike 'timezone=%'), '—')
  union all
  select 'Zona horaria de esta sesión (pestaña nueva)', 'America/Bogota', current_setting('TimeZone')
  union all
  select 'current_date = fecha de Bogotá', 'true',
         (current_date = (now() at time zone 'America/Bogota')::date)::text
  union all
  select 'Default ' || table_name || '.' || column_name, 'usa America/Bogota',
         case when column_default ilike '%America/Bogota%' then 'usa America/Bogota' else column_default end
  from information_schema.columns
  where table_schema = 'public'
    and (table_name, column_name) in (('cotizaciones', 'fecha_emision'),
                                      ('items_precios_historico', 'vigente_desde'),
                                      ('proyecto_ejecucion_items', 'fecha'))
  union all
  select p.proname || ' sin current_date en la fecha de negocio', 'true',
         (p.prosrc ilike '%America/Bogota%'
          and p.prosrc !~* 'extract\s*\(\s*year\s+from\s+current_date'
          and p.prosrc !~* 'coalesce\s*\(\s*p_fecha\s*,\s*current_date')::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname in ('fn_guardar_cotizacion_completa', 'fn_crear_item_catalogo')
  union all
  select p.proname || ' sigue con su security definer', 'false (como antes)', p.prosecdef::text || ' (como antes)'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname in ('fn_guardar_cotizacion_completa', 'fn_crear_item_catalogo')
  union all
  -- Simulación de las 9 p. m. de Bogotá del 31 de diciembre (2 a. m. UTC del 1 de enero):
  -- el año del consecutivo tiene que ser el de Bogotá.
  select 'Año a las 9 p. m. del 31/12 en Bogotá', '2026',
         extract(year from ('2027-01-01 02:00:00+00'::timestamptz at time zone 'America/Bogota'))::text
)
select prueba, esperado, obtenido,
       case when esperado = obtenido then 'OK' else 'REVISAR' end as estado
from chequeos;

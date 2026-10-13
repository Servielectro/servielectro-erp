-- ESTADO REAL de todo lo que usa la fecha/hora del servidor. SOLO LECTURA: no cambia
-- nada. Correr completo en el SQL Editor y pasar el resultado. Devuelve UNA tabla
-- seccion / objeto / detalle.
--
-- Sirve para decidir cómo pasar las fechas de negocio a la hora de Bogotá (función
-- fn_hoy_bogota() o zona horaria de la base) sabiendo qué hay de verdad en la base,
-- no en los archivos.

-- 01) Zona horaria de la base y de esta sesión, y las dos fechas de "hoy"
select '01 zona' as seccion, 'timezone de la sesión' as objeto, current_setting('TimeZone') as detalle
union all
select '01 zona', 'timezone configurado en la base',
       coalesce((select array_to_string(s.setconfig, ' ')
                 from pg_db_role_setting s join pg_database d on d.oid = s.setdatabase
                 where d.datname = current_database() and s.setrole = 0), '— (sin configurar: UTC)')
union all
select '01 zona', 'timezone configurado por rol',
       coalesce((select string_agg(r.rolname || ': ' || array_to_string(s.setconfig, ' '), ' | ')
                 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
                 where array_to_string(s.setconfig, ' ') ilike '%timezone%'), '—')
union all
select '01 zona', 'current_date / fecha Bogotá',
       current_date::text || ' / ' || (now() at time zone 'America/Bogota')::date::text

union all
-- 02) Columnas de fecha cuyo valor por defecto usa la fecha/hora del servidor
select '02 default', c.table_name || '.' || c.column_name,
       c.data_type || ' default ' || c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.column_default ~* 'current_date|now\(\)|current_timestamp|localtimestamp'
  and c.column_name not in ('created_at', 'updated_at')

union all
-- 03) Vistas que usan la fecha del servidor, con su definición completa
select '03 vista', c.relname::text, pg_get_viewdef(c.oid, true)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind in ('v', 'm')
  and pg_get_viewdef(c.oid, true) ~* 'current_date|now\(\)|current_timestamp|localtimestamp|time zone'

union all
-- 04) Vistas de precio (aunque no usen la fecha): para ver cómo tratan una fecha futura
select '04 vista precio', c.relname::text, pg_get_viewdef(c.oid, true)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind in ('v', 'm') and c.relname in ('v_items_precio_actual', 'v_items_catalogo_con_precio')

union all
-- 05) Funciones que usan la fecha del servidor: SOLO las líneas que la mencionan
--     (la definición completa es enorme)
select '05 funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       (select string_agg(trim(linea), E'\n')
        from regexp_split_to_table(p.prosrc, E'\n') linea
        where linea ~* 'current_date|now\(\)|current_timestamp|localtimestamp|clock_timestamp|time zone')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prokind = 'f'
  and p.prosrc ~* 'current_date|now\(\)|current_timestamp|localtimestamp|clock_timestamp|time zone'

union all
-- 06) Precios con fecha futura según Bogotá (después de tu corrección debería dar 0)
select '06 precios futuros', 'items_precios_historico',
       count(*)::text || ' con vigente_desde > hoy en Bogotá'
from items_precios_historico
where vigente_desde > (now() at time zone 'America/Bogota')::date

union all
-- 07) Cotizaciones con fecha de emisión que no coincide con el día en Bogotá en que se
--     crearon (las guardadas de noche): cuántas y cuáles
select '07 emision corrida', coalesce(codigo, id::text),
       'fecha_emision=' || fecha_emision || ' creada (Bogotá)=' || (created_at at time zone 'America/Bogota')::date
from cotizaciones
where fecha_emision <> (created_at at time zone 'America/Bogota')::date

order by 1, 2;

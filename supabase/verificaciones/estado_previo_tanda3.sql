-- ESTADO REAL antes de escribir la Fase 2B, TANDA 3 (migración 41). SOLO LECTURA: no
-- cambia nada. Correr completo en el SQL Editor de Supabase y pasar el resultado
-- (exportar a CSV o copiar la tabla). Devuelve UNA sola tabla con columnas
-- seccion / objeto / detalle, porque el editor muestra solo el último resultado.
--
-- Tablas de la tanda 3:
--   cotizaciones, cotizacion_items, cotizacion_polizas, cotizacion_valores_agregados,
--   cotizacion_consecutivos, hitos_cobro, items_catalogo, items_precios_historico

with tablas(t) as (
  values ('cotizaciones'), ('cotizacion_items'), ('cotizacion_polizas'),
         ('cotizacion_valores_agregados'), ('cotizacion_consecutivos'), ('hitos_cobro'),
         ('items_catalogo'), ('items_precios_historico')
),
patron as (
  select 'cotizacion|items_catalogo|items_precios_historico|hitos_cobro' as re
)

-- 1) Que existan, si tienen RLS activo/forzado, dueño y cantidad de filas
select '1 tabla' as seccion, c.relname::text as objeto,
       'rls=' || c.relrowsecurity || ' forzado=' || c.relforcerowsecurity
       || ' dueño=' || pg_get_userbyid(c.relowner)
       || ' filas_aprox=' || c.reltuples::bigint as detalle
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname in (select t from tablas) and c.relkind = 'r'

union all
-- 2) Todas las políticas actuales de esas tablas (nombre real, comando, roles, condiciones)
select '2 politica', tablename || '.' || policyname,
       'cmd=' || cmd || ' roles=' || array_to_string(roles, ',')
       || ' | using: ' || coalesce(qual, '—') || ' | check: ' || coalesce(with_check, '—')
from pg_policies
where schemaname = 'public' and tablename in (select t from tablas)

union all
-- 3) Privilegios de anon y authenticated sobre esas tablas
select '3 grant', table_name || ' → ' || grantee,
       string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name in (select t from tablas)
  and grantee in ('anon', 'authenticated')
group by table_name, grantee

union all
-- 4) Vistas que leen de esas tablas, y si son security_invoker
select distinct '4 vista', v.relname::text,
       'security_invoker=' || coalesce(
         (select option_value from pg_options_to_table(v.reloptions) where option_name = 'security_invoker'),
         'NO (salta la RLS)')
       || ' | lee: ' || dep.relname
from pg_rewrite r
join pg_class v on v.oid = r.ev_class and v.relkind in ('v', 'm')
join pg_namespace vn on vn.oid = v.relnamespace and vn.nspname = 'public'
join pg_depend d on d.objid = r.oid and d.deptype = 'n'
join pg_class dep on dep.oid = d.refobjid
where dep.relname in (select t from tablas) and v.relname <> dep.relname

union all
-- 5) Triggers sobre esas tablas
select '5 trigger', c.relname || '.' || t.tgname,
       'funcion=' || p.proname || ' habilitado=' || t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and c.relname in (select t from tablas)

union all
-- 6) Funciones de public que mencionan esas tablas: si saltan la RLS (security definer)
--    y su definición COMPLETA tal como está en la base (no la de los archivos)
select '6 funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'security_definer=' || p.prosecdef || E'\n' || pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prokind = 'f' and p.prosrc ~ (select re from patron)

union all
-- 7) Columnas de cotizacion_consecutivos (no tiene pantalla; confirmar cómo se usa)
select '7 columna', table_name || '.' || column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'cotizacion_consecutivos'

order by 1, 2;

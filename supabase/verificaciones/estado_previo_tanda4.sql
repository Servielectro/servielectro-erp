-- ESTADO REAL antes de escribir la Fase 2B, TANDA 4 (migración 42). SOLO LECTURA: no
-- cambia nada. Correr completo en el SQL Editor de Supabase y pasar el resultado
-- (exportar a CSV o copiar la tabla). Devuelve UNA sola tabla con columnas
-- seccion / objeto / detalle, porque el editor muestra solo el último resultado.
--
-- Alcance de la tanda 4:
--   - tablas proyectos, proyecto_ejecucion_items
--   - borrar vigia_conexion (confirmar que nada depende de ella)
--   - buckets respaldos y documentos-clientes (y el resto, para ver el panorama)
--   - anon: qué le queda en TODO el esquema public (tablas, vistas, secuencias, funciones)

with tablas(t) as (
  values ('proyectos'), ('proyecto_ejecucion_items'), ('vigia_conexion')
),
patron as (
  select 'proyecto|vigia_conexion|respaldos' as re
)

-- 1) Que existan, RLS activo/forzado, dueño y filas
select '01 tabla' as seccion, c.relname::text as objeto,
       'rls=' || c.relrowsecurity || ' forzado=' || c.relforcerowsecurity
       || ' dueño=' || pg_get_userbyid(c.relowner)
       || ' filas_aprox=' || c.reltuples::bigint as detalle
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname in (select t from tablas) and c.relkind = 'r'

union all
-- 2) Todas las políticas de esas tablas
select '02 politica', tablename || '.' || policyname,
       'cmd=' || cmd || ' roles=' || array_to_string(roles, ',')
       || ' | using: ' || coalesce(qual, '—') || ' | check: ' || coalesce(with_check, '—')
from pg_policies
where schemaname = 'public' and tablename in (select t from tablas)

union all
-- 3) Privilegios de anon y authenticated sobre esas tablas
select '03 grant', table_name || ' → ' || grantee,
       string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name in (select t from tablas)
  and grantee in ('anon', 'authenticated')
group by table_name, grantee

union all
-- 4) Vistas que leen de esas tablas, y si son security_invoker
select distinct '04 vista', v.relname::text,
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
select '05 trigger', c.relname || '.' || t.tgname,
       'funcion=' || p.proname || ' habilitado=' || t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and c.relname in (select t from tablas)

union all
-- 6) Funciones de public que mencionan proyectos / vigia_conexion / respaldos:
--    si son security definer y su definición COMPLETA tal como está en la base
select '06 funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'security_definer=' || p.prosecdef || E'\n' || pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prokind = 'f' and p.prosrc ~ (select re from patron)

union all
-- 7) Llaves foráneas que apuntan a vigia_conexion o salen de ella (impiden el drop)
select '07 fk', conrelid::regclass::text || ' → ' || confrelid::regclass::text, conname::text
from pg_constraint
where contype = 'f'
  and (conrelid = to_regclass('public.vigia_conexion') or confrelid = to_regclass('public.vigia_conexion'))

union all
-- 8) Tareas programadas (pg_cron) que mencionen vigia_conexion, si pg_cron existe
select '08 cron', 'cron.job',
       coalesce(
         (xpath('/row/c/text()', query_to_xml(
           case when to_regclass('cron.job') is not null
             then $q$select coalesce(string_agg(jobid || ' ' || coalesce(jobname, '') || ' activo=' || active || ': ' || command, ' || '), 'ninguna') as c from cron.job where command ilike '%vigia%'$q$
             else $q$select 'pg_cron no instalado' as c$q$
           end, false, true, '')))[1]::text,
         'ninguna')

union all
-- 9) Buckets de Storage: si son públicos (público = se descarga sin sesión con la URL)
select '09 bucket', id::text,
       'public=' || public || ' limite=' || coalesce(file_size_limit::text, '—')
       || ' tipos=' || coalesce(array_to_string(allowed_mime_types, ','), '—')
from storage.buckets

union all
-- 10) TODAS las políticas de storage.objects (nombre real, comando, roles, condiciones)
select '10 storage', policyname::text,
       'cmd=' || cmd || ' roles=' || array_to_string(roles, ',')
       || ' | using: ' || coalesce(qual, '—') || ' | check: ' || coalesce(with_check, '—')
from pg_policies
where schemaname = 'storage' and tablename = 'objects'

union all
-- 11) Lo que le queda a anon en TODO el esquema public: tablas y vistas
select '11 anon tabla', table_name::text, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
group by table_name

union all
-- 12) Secuencias de public sobre las que anon tiene algún privilegio
select '12 anon secuencia', c.relname::text,
       'usage=' || has_sequence_privilege('anon', c.oid, 'USAGE')
       || ' select=' || has_sequence_privilege('anon', c.oid, 'SELECT')
       || ' update=' || has_sequence_privilege('anon', c.oid, 'UPDATE')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'S'
  and (has_sequence_privilege('anon', c.oid, 'USAGE')
       or has_sequence_privilege('anon', c.oid, 'SELECT')
       or has_sequence_privilege('anon', c.oid, 'UPDATE'))

union all
-- 13) Funciones de public que anon puede ejecutar (las security definer saltan la RLS)
select '13 anon funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'security_definer=' || p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')

union all
-- 14) Privilegios por defecto: lo que recibirán anon/authenticated en tablas FUTURAS
select '14 default acl', pg_get_userbyid(d.defaclrole) || ' / ' || d.defaclobjtype,
       array_to_string(d.defaclacl, ' ')
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'

union all
-- 15) Tablas de public SIN RLS activo (cualquiera con privilegio las lee entera)
select '15 sin rls', c.relname::text, 'dueño=' || pg_get_userbyid(c.relowner)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r' and not c.relrowsecurity

union all
-- 16) Tablas de public que todavía tienen alguna política using(true) o check(true)
select '16 politica abierta', tablename || '.' || policyname,
       'cmd=' || cmd || ' roles=' || array_to_string(roles, ',')
from pg_policies
where schemaname = 'public'
  and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true')

order by 1, 2;

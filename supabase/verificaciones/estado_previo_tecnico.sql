-- ESTADO REAL antes de escribir el módulo Técnico. SOLO LECTURA: no cambia nada.
-- Correr completo en el SQL Editor y pasar el resultado. Devuelve UNA tabla
-- seccion / objeto / detalle.

-- 01) Módulos que existen hoy
select '01 modulo' as seccion, m.id::text as objeto, to_jsonb(m)::text as detalle
from modulos m

union all
-- 02) Roles y cuántos usuarios tiene cada uno
select '02 rol', r.nombre::text,
       'id=' || r.id || ' usuarios=' || (select count(*) from perfiles p where p.rol_id = r.id)
from roles r

union all
-- 03) Permisos por rol (para ubicar el rol Técnico sin romper los demás)
select '03 permiso', r.nombre || ' → ' || pr.modulo_id,
       'nivel=' || pr.nivel || ' sensibles=' || pr.ve_datos_sensibles
from permisos_rol pr join roles r on r.id = pr.rol_id

union all
-- 04) Valores del enum de niveles
select '04 nivel', e.enumlabel::text, 'orden=' || e.enumsortorder
from pg_enum e join pg_type t on t.oid = e.enumtypid
where t.typname = 'nivel_permiso'

union all
-- 05) Funciones de permisos: si son security definer (decide cómo escribir la RLS por
--     técnico asignado) y su definición
select '05 funcion', p.proname::text,
       'security_definer=' || p.prosecdef || E'\n' || p.prosrc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_tiene_permiso', 'fn_ve_datos_sensibles', 'fn_mis_permisos')

union all
-- 06) Columnas de perfiles (¿hay cédula, teléfono? la firma del técnico los necesita)
select '06 perfiles', column_name::text, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'perfiles'

union all
-- 07) Espacio usado: base y cada bucket (el plan gratuito da 1 GB de Storage)
select '07 espacio', 'base de datos', pg_size_pretty(pg_database_size(current_database()))
union all
select '07 espacio', 'bucket ' || b.id,
       count(o.id) || ' archivos, '
       || pg_size_pretty(coalesce(sum((o.metadata ->> 'size')::bigint), 0))
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.id

union all
-- 08) ¿Ya hay algo con nombre de técnico/visita/tarea? (para no chocar)
select '08 existente', c.relname::text, case c.relkind when 'r' then 'tabla' when 'v' then 'vista' else c.relkind::text end
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname ~* 'tecnic|visita|tarea|bitacora|firma|orden_servicio'

union all
-- 09) Columnas de clientes que sirven para la visita (dirección, GPS de la sede)
select '09 clientes', column_name::text, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'clientes'
  and column_name ~* 'direcc|lat|lng|lon|ubic|telefono|contacto|ciudad'

union all
-- 10) Duración de la sesión (offline: cuánto vale el token sin conexión)
select '10 sesion', 'jwt_exp (base)',
       coalesce((select string_agg(c, ' ') from pg_db_role_setting s
                 join pg_database d on d.oid = s.setdatabase, unnest(s.setconfig) c
                 where d.datname = current_database() and c ilike '%jwt_exp%'), '—')

order by 1, 2;

-- ESTADO REAL antes de escribir la migración del tablero de tareas. SOLO LECTURA: no
-- cambia nada. Correr completo en el SQL Editor y pasar el resultado. Devuelve UNA tabla
-- seccion / objeto / detalle.

-- 01) proyectos: columnas (las tareas cuelgan de un proyecto o de una visita)
select '01 proyectos col' as seccion, column_name::text as objeto,
       data_type || case when is_nullable = 'NO' then ' not null' else '' end
       || coalesce(' default ' || column_default, '') as detalle
from information_schema.columns
where table_schema = 'public' and table_name = 'proyectos'

union all
-- 02) proyectos: filas, RLS y políticas reales
select '02 proyectos', 'filas / rls',
       (select count(*) from proyectos)::text || ' filas · rls=' ||
       (select relrowsecurity::text from pg_class where oid = 'public.proyectos'::regclass)
union all
select '02 proyectos', 'politica ' || policyname,
       'cmd=' || cmd || ' | using: ' || coalesce(qual, '—') || ' | check: ' || coalesce(with_check, '—')
from pg_policies where schemaname = 'public' and tablename = 'proyectos'

union all
-- 03) roles: columnas y filas (para crear "Coordinador" sin chocar)
select '03 roles col', column_name::text, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'roles'
union all
select '03 roles fila', r.nombre::text, to_jsonb(r)::text from roles r

union all
-- 04) permisos_rol: columnas, restricciones (clave única) y filas por rol
select '04 permisos_rol col', column_name::text, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'permisos_rol'
union all
select '04 permisos_rol restriccion', conname::text, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.permisos_rol'::regclass
union all
select '04 permisos_rol fila', r.nombre || ' → ' || pr.modulo_id,
       'nivel=' || pr.nivel || ' sensibles=' || pr.ve_datos_sensibles
from permisos_rol pr join roles r on r.id = pr.rol_id

union all
-- 05) ¿ya existe algo con nombre de tarea/agenda? (para no chocar)
select '05 existente', c.relname::text,
       case c.relkind when 'r' then 'tabla' when 'v' then 'vista' else c.relkind::text end
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname ~* 'tarea|agenda|subtarea|dependenc'
union all
select '05 existente funcion', p.proname::text, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname ~* 'tarea|agenda'

union all
-- 06) Privilegios por defecto vigentes (tablas nuevas sin anon desde la 42)
select '06 default acl', pg_get_userbyid(d.defaclrole) || ' / ' || d.defaclobjtype,
       array_to_string(d.defaclacl, ' ')
from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'

order by 1, 2;

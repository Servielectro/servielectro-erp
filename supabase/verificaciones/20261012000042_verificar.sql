-- Verificación de la migración 42 (Fase 2B, tanda 4). Correr DESPUÉS de la migración,
-- en el SQL Editor de Supabase, todo junto. NO deja cambios: cada escritura como usuario
-- se deshace sola y la tabla de resultados es temporal.
--
-- Simula: A) Jhojan (696d9431-5c4d-4043-aee4-3e4597094f26) → ve proyectos, crea un
--            proyecto desde una cotización APROBADA real (el trigger lee cotizaciones),
--            ve y sube respaldos
--         B) usuario sin perfil ni rol → ve 0, no crea proyectos, no ve ni sube respaldos
-- Y revisa: respaldos sin políticas de update/delete; anon sin nada en public (tablas,
-- vistas, secuencias, privilegios por defecto); vigia_conexion borrada; ninguna política
-- using(true) fuera de modulos/roles/permisos_rol.
--
-- Al final informa (sin OK/REVISAR) si fn_tiene_permiso, fn_ve_datos_sensibles y
-- fn_mis_permisos son security definer EN LA BASE: es el dato para decidir si se puede
-- cerrar permisos_rol_select sin bloquear el sistema.
--
-- Resultado esperado: todas las filas en "OK" (las de "info" son solo informativas).

begin;

create temporary table verificacion (prueba text, esperado text, obtenido text) on commit drop;
grant all on verificacion to authenticated;

create or replace function pg_temp.probar_escritura(p_sql text)
returns text language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm = '__deshacer__' then return 'permitido'; end if;
    return 'rechazado';
  end;
end $$;

-- Igual que probar_escritura, pero si falla devuelve el mensaje (para ver POR QUÉ falla).
create or replace function pg_temp.intentar(p_sql text)
returns text language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm = '__deshacer__' then return 'permitido'; end if;
    return 'ERROR: ' || sqlerrm;
  end;
end $$;

create or replace function pg_temp.valor(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql into v;
    return v;
  exception when others then
    return 'ERROR: ' || sqlerrm;
  end;
end $$;

-- Una cotización APROBADA real para probar la creación de proyecto (se busca como admin;
-- el insert de prueba se deshace). Si no hay ninguna, esa prueba sale "omitida".
create temporary table aprobada on commit drop as
select id, cliente_id from cotizaciones where estado = 'APROBADA' limit 1;
grant all on aprobada to authenticated;

create or replace function pg_temp.sql_crear_proyecto()
returns text language sql as $$
  select format(
    $f$insert into proyectos (codigo, nombre, cliente_id, cotizacion_aprobada_id) values ('__prueba_rls_42__', '__prueba_rls_42__', %L, %L)$f$,
    cliente_id, id)
  from aprobada
$$;

-- ============================================================ A) Jhojan
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"696d9431-5c4d-4043-aee4-3e4597094f26","role":"authenticated"}', true);

insert into verificacion
select 'Jhojan ve datos sensibles en comercial', 'true', fn_ve_datos_sensibles('comercial')::text
union all select 'Jhojan lee proyectos (sin error)', '>= 0', pg_temp.valor('select count(*) from proyectos')
union all select 'Jhojan lee proyecto_ejecucion_items (sin error)', '>= 0', pg_temp.valor('select count(*) from proyecto_ejecucion_items')
union all select 'Jhojan lee v_presupuesto_vs_ejecucion (sin error)', '>= 0', pg_temp.valor('select count(*) from v_presupuesto_vs_ejecucion')
union all select 'Jhojan crea proyecto desde cotización APROBADA',
  case when exists (select 1 from aprobada) then 'permitido' else 'omitida' end,
  case when exists (select 1 from aprobada) then pg_temp.intentar(pg_temp.sql_crear_proyecto()) else 'omitida' end
union all select 'Jhojan lee respaldos (sin error)', '>= 0',
  pg_temp.valor($q$select count(*) from storage.objects where bucket_id = 'respaldos'$q$)
union all select 'Jhojan sube un respaldo', 'permitido',
  pg_temp.intentar($q$insert into storage.objects (bucket_id, name) values ('respaldos', '__prueba_rls_42__.json')$q$);

-- ============================================================ B) usuario sin rol
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);

insert into verificacion
select 'Sin rol lee proyectos', '0', count(*)::text from proyectos
union all select 'Sin rol lee proyecto_ejecucion_items', '0', count(*)::text from proyecto_ejecucion_items
union all select 'Sin rol lee respaldos', '0',
  (select count(*) from storage.objects where bucket_id = 'respaldos')::text
union all select 'Sin rol crea proyecto',
  case when exists (select 1 from aprobada) then 'rechazado' else 'omitida' end,
  case when exists (select 1 from aprobada) then pg_temp.probar_escritura(pg_temp.sql_crear_proyecto()) else 'omitida' end
union all select 'Sin rol sube un respaldo', 'rechazado',
  pg_temp.probar_escritura($q$insert into storage.objects (bucket_id, name) values ('respaldos', '__prueba_rls_42_b__.json')$q$);

-- ============================================================ políticas y privilegios
reset role;
insert into verificacion
select 'Políticas en proyectos y ejecución (4 por tabla)', '8', count(*)::text
from pg_policies
where schemaname = 'public' and tablename in ('proyectos', 'proyecto_ejecucion_items')
union all
select 'Políticas de respaldos (solo select e insert)', 'INSERT,SELECT',
  coalesce(string_agg(cmd, ',' order by cmd), '—')
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%respaldos%'
union all
select 'Políticas de respaldos sin fn_ve_datos_sensibles', '0', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%respaldos%'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) not ilike '%fn_ve_datos_sensibles%'
union all
select 'Políticas using(true) fuera de modulos/roles/permisos_rol', '0', count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename not in ('modulos', 'roles', 'permisos_rol')
  and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true')
union all
select 'Privilegios de anon en tablas y vistas de public', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
union all
select 'Secuencias de public que anon puede usar', '0', count(*)::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'S'
  and (has_sequence_privilege('anon', c.oid, 'USAGE') or has_sequence_privilege('anon', c.oid, 'SELECT')
       or has_sequence_privilege('anon', c.oid, 'UPDATE'))
union all
select 'Privilegios por defecto de postgres que dan algo a anon (tablas/secuencias)', '0', count(*)::text
from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'
where d.defaclrole = 'postgres'::regrole and d.defaclobjtype in ('r', 'S')
  and array_to_string(d.defaclacl, ' ') ~ '(^| )anon='
union all
select 'vigia_conexion borrada', 'true', (to_regclass('public.vigia_conexion') is null)::text
union all
select 'info: ' || p.proname || ' security definer', 'info', p.prosecdef::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_tiene_permiso', 'fn_ve_datos_sensibles', 'fn_mis_permisos');

-- ============================================================ resultado (última instrucción)
select prueba, esperado, obtenido,
  case
    when esperado = 'info' then 'info'
    when esperado = '> 0' and obtenido ~ '^[0-9]+$' and obtenido::int > 0 then 'OK'
    when esperado = '>= 0' and obtenido ~ '^[0-9]+$' then 'OK'
    when esperado = obtenido then 'OK'
    else 'REVISAR'
  end as estado
from verificacion;

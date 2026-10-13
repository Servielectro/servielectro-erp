-- Verificación de la migración 41 (Fase 2B, tanda 3). Correr DESPUÉS de la migración,
-- en el SQL Editor de Supabase, todo junto. NO deja cambios:
--   - no inserta datos de prueba: cada escritura como usuario se deshace sola (incluida
--     la que avanza el contador de códigos, que se prueba con el año 2099);
--   - la tabla de resultados es temporal.
--
-- Simula: A) Jhojan (696d9431-5c4d-4043-aee4-3e4597094f26) → ve y escribe todo, y
--            puede sacar el código de una cotización nueva (cotizacion_consecutivos)
--         B) usuario sin perfil ni rol                      → ve 0 y no escribe nada
-- Y revisa: ninguna política using (true) en las 8 tablas; anon sin ningún privilegio;
-- authenticated sin TRUNCATE.
--
-- Resultado esperado: todas las filas en estado "OK".

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

create or replace function pg_temp.filas(p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm = '__deshacer__' then return n; end if;
    return -1;
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

-- ============================================================ A) Jhojan
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"696d9431-5c4d-4043-aee4-3e4597094f26","role":"authenticated"}', true);

insert into verificacion
select 'Jhojan lee items_catalogo', '> 0', count(*)::text from items_catalogo
union all select 'Jhojan lee cotizaciones (sin error)', '>= 0', pg_temp.valor('select count(*) from cotizaciones')
union all select 'Jhojan lee cotizacion_items (sin error)', '>= 0', pg_temp.valor('select count(*) from cotizacion_items')
union all select 'Jhojan lee cotizacion_polizas (sin error)', '>= 0', pg_temp.valor('select count(*) from cotizacion_polizas')
union all select 'Jhojan lee cotizacion_valores_agregados (sin error)', '>= 0', pg_temp.valor('select count(*) from cotizacion_valores_agregados')
union all select 'Jhojan lee cotizacion_consecutivos (sin error)', '>= 0', pg_temp.valor('select count(*) from cotizacion_consecutivos')
union all select 'Jhojan lee hitos_cobro (sin error)', '>= 0', pg_temp.valor('select count(*) from hitos_cobro')
union all select 'Jhojan lee items_precios_historico (sin error)', '>= 0', pg_temp.valor('select count(*) from items_precios_historico')
union all select 'Jhojan edita el catálogo (filas = todo el catálogo)', '> 0',
  pg_temp.filas('update items_catalogo set descripcion = descripcion')::text
union all select 'Jhojan saca código de cotización nueva (consecutivos)', 'permitido',
  pg_temp.probar_escritura('select fn_siguiente_codigo_cotizacion(2099::smallint)')
union all select 'Jhojan crea contador de año (insert consecutivos)', 'permitido',
  pg_temp.probar_escritura('insert into cotizacion_consecutivos (anio, ultimo_numero) values (2098, 0)');

-- ============================================================ B) usuario sin rol
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);

insert into verificacion
select 'Sin rol lee items_catalogo', '0', count(*)::text from items_catalogo
union all select 'Sin rol lee cotizaciones', '0', count(*)::text from cotizaciones
union all select 'Sin rol lee cotizacion_items', '0', count(*)::text from cotizacion_items
union all select 'Sin rol lee cotizacion_polizas', '0', count(*)::text from cotizacion_polizas
union all select 'Sin rol lee cotizacion_valores_agregados', '0', count(*)::text from cotizacion_valores_agregados
union all select 'Sin rol lee cotizacion_consecutivos', '0', count(*)::text from cotizacion_consecutivos
union all select 'Sin rol lee hitos_cobro', '0', count(*)::text from hitos_cobro
union all select 'Sin rol lee items_precios_historico', '0', count(*)::text from items_precios_historico
union all select 'Sin rol edita el catálogo (filas)', '0',
  pg_temp.filas('update items_catalogo set descripcion = descripcion')::text
union all select 'Sin rol saca código de cotización', 'rechazado',
  pg_temp.probar_escritura('select fn_siguiente_codigo_cotizacion(2099::smallint)')
union all select 'Sin rol crea contador de año', 'rechazado',
  pg_temp.probar_escritura('insert into cotizacion_consecutivos (anio, ultimo_numero) values (2098, 0)');

-- ============================================================ políticas y privilegios
reset role;
insert into verificacion
select 'Políticas using(true) en las 8 tablas', '0', count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename = any (array['cotizaciones', 'cotizacion_items', 'cotizacion_polizas',
                             'cotizacion_valores_agregados', 'cotizacion_consecutivos',
                             'hitos_cobro', 'items_catalogo', 'items_precios_historico'])
  and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true')
union all
select 'Políticas en las 8 tablas (4 por tabla)', '32', count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename = any (array['cotizaciones', 'cotizacion_items', 'cotizacion_polizas',
                             'cotizacion_valores_agregados', 'cotizacion_consecutivos',
                             'hitos_cobro', 'items_catalogo', 'items_precios_historico'])
union all
select 'Privilegios de anon en las 8 tablas', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name = any (array['cotizaciones', 'cotizacion_items', 'cotizacion_polizas',
                              'cotizacion_valores_agregados', 'cotizacion_consecutivos',
                              'hitos_cobro', 'items_catalogo', 'items_precios_historico'])
union all
select 'TRUNCATE/TRIGGER/REFERENCES de authenticated en las 8', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
  and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
  and table_name = any (array['cotizaciones', 'cotizacion_items', 'cotizacion_polizas',
                              'cotizacion_valores_agregados', 'cotizacion_consecutivos',
                              'hitos_cobro', 'items_catalogo', 'items_precios_historico']);

-- ============================================================ resultado (última instrucción)
select prueba, esperado, obtenido,
  case
    when esperado = '> 0' and obtenido ~ '^[0-9]+$' and obtenido::int > 0 then 'OK'
    when esperado = '>= 0' and obtenido ~ '^[0-9]+$' then 'OK'
    when esperado = obtenido then 'OK'
    else 'REVISAR'
  end as estado
from verificacion;

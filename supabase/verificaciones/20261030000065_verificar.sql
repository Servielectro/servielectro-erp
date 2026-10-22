-- Verificación de la migración 65 (Parámetros de liquidación). Correr DESPUÉS de la migración, todo junto.
-- Prueba que la migración no trae ningún valor de ley, que los valores tienen vigencia y no se
-- sobrescriben, y que solo RRHH "trabajar" los ve.
-- Crea personas y datos de prueba y BORRA todo antes de mostrar el resultado.
-- Resultado esperado: todas las filas en "OK".

begin;

create temporary table resultado (orden serial, prueba text, esperado text, resultado text) on commit drop;
grant all on resultado to authenticated;
grant usage on sequence resultado_orden_seq to authenticated;

create or replace function pg_temp.intentar(p_sql text)
returns text language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'aceptado (' || n || ' filas)';
exception when others then
  return 'RECHAZADO [' || sqlstate || ']: ' || sqlerrm;
end $$;

create or replace function pg_temp.valor(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, '(vacío)');
exception when others then
  return 'ERROR: ' || sqlerrm;
end $$;

create or replace function pg_temp.como(p_usuario uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
$$;

-- ============================================================ personas de prueba (admin)
-- R = RRHH "trabajar" (como Alejandra). K = RRHH "consultar" (chuleo). T = técnico.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000065a0', 'authenticated', 'authenticated', 'rrhh.65@invalid.local'),
  ('00000000-0000-0000-0000-0000000065b0', 'authenticated', 'authenticated', 'consulta.65@invalid.local'),
  ('00000000-0000-0000-0000-0000000065c0', 'authenticated', 'authenticated', 'tecnico.65@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__RRHH prueba 65__'), ('__consulta prueba 65__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'rrhh', case r.nombre when '__RRHH prueba 65__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__RRHH prueba 65__', '__consulta prueba 65__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000065a0', '__RRHH prueba 65__', '__R 65__'),
  ('00000000-0000-0000-0000-0000000065b0', '__consulta prueba 65__', '__K 65__'),
  ('00000000-0000-0000-0000-0000000065c0', 'Técnicos', '__T 65__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- ============================================================ 1) la estructura nace sin valores
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000065a0');
insert into resultado (prueba, esperado, resultado)
select '1a RRHH ve el catálogo de parámetros (26 nombres)', '26',
  pg_temp.valor($q$select count(*)::text from parametros_liquidacion where clave not like 'prueba%'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b ningún valor de ley viene cargado por la migración', '0',
  pg_temp.valor($q$select count(*)::text from parametro_valores where clave not like 'prueba%'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c sin valores, el vigente de cada parámetro está vacío', '26 / 0',
  pg_temp.valor($q$select count(*)::text || ' / ' || count(valor)::text from fn_parametros_vigentes()$q$);

-- ============================================================ 2) valores con vigencia (cifras de prueba, no de ley)
insert into resultado (prueba, esperado, resultado)
select '2a RRHH agrega un parámetro nuevo sin migrar', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into parametros_liquidacion (clave, nombre, unidad, grupo) values ('prueba_65', '__Parámetro de prueba 65__', 'pesos', 'Prueba')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b registra un valor con su vigencia', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into parametro_valores (clave, vigente_desde, valor, nota) values ('prueba_65', '2026-01-01', 111, 'prueba')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c y el año siguiente otro, sin tocar el anterior', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into parametro_valores (clave, vigente_desde, valor) values ('prueba_65', '2027-01-01', 222)$q$);
insert into resultado (prueba, esperado, resultado)
select '2d el vigente depende de la fecha (jun-2026 / feb-2027 / dic-2025)', '111.0000 / 222.0000 / (vacío)',
  pg_temp.valor($q$select (select valor::text from fn_parametros_vigentes('2026-06-01') where clave = 'prueba_65')$q$) || ' / ' ||
  pg_temp.valor($q$select (select valor::text from fn_parametros_vigentes('2027-02-01') where clave = 'prueba_65')$q$) || ' / ' ||
  pg_temp.valor($q$select (select valor::text from fn_parametros_vigentes('2025-12-01') where clave = 'prueba_65')$q$);
insert into resultado (prueba, esperado, resultado)
select '2e un valor registrado no se cambia (no hay política de update: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update parametro_valores set valor = 1 where clave = 'prueba_65'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f … ni se borra (no hay política: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from parametro_valores where clave = 'prueba_65'$q$);
-- 2g: una corrección con la misma vigencia, registrada después.
insert into parametro_valores (clave, vigente_desde, valor, nota) values ('prueba_65', '2027-01-01', 333, 'corrección');
insert into resultado (prueba, esperado, resultado)
select '2g corrección del mismo día: gana la registrada después', '333.0000',
  pg_temp.valor($q$select (select valor::text from fn_parametros_vigentes('2027-02-01') where clave = 'prueba_65')$q$);
insert into resultado (prueba, esperado, resultado)
select '2h quién registró lo pone la base', 'R',
  pg_temp.valor($q$select case when bool_and(registrado_por = '00000000-0000-0000-0000-0000000065a0') then 'R' else '?' end from parametro_valores where clave = 'prueba_65'$q$);

-- ============================================================ 3) nadie más
select pg_temp.como('00000000-0000-0000-0000-0000000065b0');
insert into resultado (prueba, esperado, resultado)
select '3a RRHH "consultar" (chuleo): ni el catálogo ni los valores', '0 / 0 / 0',
  pg_temp.valor($q$select count(*)::text from parametros_liquidacion$q$) || ' / ' ||
  pg_temp.valor($q$select count(*)::text from parametro_valores$q$) || ' / ' ||
  pg_temp.valor($q$select count(*)::text from fn_parametros_vigentes()$q$);
insert into resultado (prueba, esperado, resultado)
select '3b RRHH "consultar" registra un valor', 'contiene: row-level security', pg_temp.intentar($q$
  insert into parametro_valores (clave, vigente_desde, valor) values ('prueba_65', '2028-01-01', 1)$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000065c0');
insert into resultado (prueba, esperado, resultado)
select '3c técnico: nada', '0 / 0',
  pg_temp.valor($q$select count(*)::text from parametro_valores$q$) || ' / ' ||
  pg_temp.valor($q$select count(*)::text from fn_parametros_vigentes()$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '3d funciones ejecutables por anon', '0',
  coalesce(nullif(string_agg(p.proname::text, ', '), ''), '0')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_parametros_vigentes', 'fn_parametro_valor_inmutable', 'fn_parametro_valor_quien')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- ============================================================ limpieza (admin)
delete from parametro_valores where clave = 'prueba_65';
delete from parametros_liquidacion where clave = 'prueba_65';

delete from perfiles where id::text like '00000000-0000-0000-0000-0000000065_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__RRHH prueba 65__', '__consulta prueba 65__'));
delete from roles where nombre in ('__RRHH prueba 65__', '__consulta prueba 65__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000065_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

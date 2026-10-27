-- Verificación de la migración 79 (municipios con su código DANE, DIVIPOLA). Correr DESPUÉS de la
-- migración. Prueba que la descarga quedó completa (33 departamentos con Bogotá, más de 1.100
-- códigos), que Bogotá es 11 / 11001, que todos los códigos son de 5 dígitos y empiezan por el de su
-- departamento, y que cualquiera con sesión la lee pero nadie la cambia desde la app. Solo lee.
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

insert into resultado (prueba, esperado, resultado)
select '1 departamentos: 32 más Bogotá D.C.', '33', pg_temp.valor($q$select count(distinct departamento_codigo)::text from municipios_dane$q$);
insert into resultado (prueba, esperado, resultado)
select '2 códigos: la descarga está completa (más de 1.100)', 'sí', pg_temp.valor($q$select case when count(*) > 1100 then 'sí' else 'NO: ' || count(*) end from municipios_dane$q$);
insert into resultado (prueba, esperado, resultado)
select '3 exactamente los de la descarga (1.122)', '1122', pg_temp.valor($q$select count(*)::text from municipios_dane$q$);
insert into resultado (prueba, esperado, resultado)
select '4 Bogotá D.C. es departamento 11 y municipio 11001', '11 / BOGOTÁ, D.C.', pg_temp.valor($q$select departamento_codigo || ' / ' || municipio from municipios_dane where codigo = '11001'$q$);
insert into resultado (prueba, esperado, resultado)
select '5 Medellín es 05001 (el cero inicial se conserva)', 'ANTIOQUIA / MEDELLÍN', pg_temp.valor($q$select departamento || ' / ' || municipio from municipios_dane where codigo = '05001'$q$);
insert into resultado (prueba, esperado, resultado)
select '6 todos de 5 dígitos y con el prefijo de su departamento', '0', pg_temp.valor($q$select count(*)::text from municipios_dane where codigo !~ '^[0-9]{5}$' or left(codigo, 2) <> departamento_codigo$q$);
insert into resultado (prueba, esperado, resultado)
select '7 cada departamento con un solo nombre', '0', pg_temp.valor($q$select count(*)::text from (select departamento_codigo from municipios_dane group by 1 having count(distinct departamento) > 1) x$q$);
insert into resultado (prueba, esperado, resultado)
select '8 queda la fuente y la fecha', 'sí', pg_temp.valor($q$select case when bool_and(fuente like '%DIVIPOLA%2025-01-24%') then 'sí' else 'no' end from municipios_dane$q$);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '696d9431-5c4d-4043-aee4-3e4597094f26', 'role', 'authenticated')::text, true);
insert into resultado (prueba, esperado, resultado)
select '9 con sesión se lee', 'sí', pg_temp.valor($q$select case when count(*) > 1100 then 'sí' else 'no' end from municipios_dane$q$);
insert into resultado (prueba, esperado, resultado)
select '10 nadie la cambia desde la app', 'contiene: permission denied', pg_temp.intentar($q$update municipios_dane set municipio = 'X' where codigo = '11001'$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '11 anónimo no la lee', 'false', pg_temp.valor($q$select has_table_privilege('anon', 'municipios_dane', 'select')::text$q$);

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

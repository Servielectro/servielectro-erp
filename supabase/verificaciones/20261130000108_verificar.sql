-- Verificación de la migración 108 (plan anual sobre los estándares mínimos). Correr DESPUÉS de la
-- migración, todo junto. Son las pruebas que el orquestador corrió a mano al aplicarla. Toca el
-- estándar 5.1.1 de 2026 para probar el puntaje y lo DEJA COMO ESTABA; lo demás no escribe nada.
begin;

create temporary table resultado (orden serial, prueba text, esperado text, resultado text) on commit drop;

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

-- Cómo estaba el 5.1.1 antes de la prueba (se restaura al final).
create temporary table antes_511 on commit drop as
select calificacion, motivo_no_aplica from sst_plan_items where anio = 2026 and codigo = '5.1.1';

-- ============================================================ 1) la siembra
insert into resultado (prueba, esperado, resultado)
select '1a 60 estándares en 2026', '60',
  pg_temp.valor($q$select count(*)::text from sst_plan_items where anio = 2026 and codigo is not null$q$);
insert into resultado (prueba, esperado, resultado)
select '1b la suma de los pesos es exactamente 100', '100.00',
  pg_temp.valor($q$select sum(valor)::numeric(6,2)::text from sst_plan_items where anio = 2026 and codigo is not null$q$);
insert into resultado (prueba, esperado, resultado)
select '1c 11 grupos, y cada uno suma el porcentaje que declara', '11 / 0 descuadrados',
  pg_temp.valor($q$select count(*)::text || ' / ' || count(*) filter (where suma <> declarado)::text || ' descuadrados'
                   from (select grupo, sum(valor) as suma, substring(grupo from '\((\d+)%\)')::numeric as declarado
                           from sst_plan_items where anio = 2026 and codigo is not null group by grupo) g$q$);
insert into resultado (prueba, esperado, resultado)
select '1d los 7 del artículo 3', '1.1.1, 1.1.4, 1.2.1, 2.4.1, 3.1.4, 4.1.2, 4.2.1',
  pg_temp.valor($q$select string_agg(codigo, ', ' order by string_to_array(codigo, '.')::int[])
                   from sst_plan_items where anio = 2026 and aplica_7$q$);
insert into resultado (prueba, esperado, resultado)
select '1e por ciclo: 22 / 30 / 4 / 4', '22 / 30 / 4 / 4',
  pg_temp.valor($q$select count(*) filter (where ciclo = 'PLANEAR')::text || ' / ' || count(*) filter (where ciclo = 'HACER')::text || ' / '
                       || count(*) filter (where ciclo = 'VERIFICAR')::text || ' / ' || count(*) filter (where ciclo = 'ACTUAR')::text
                   from sst_plan_items where anio = 2026 and codigo is not null$q$);
insert into resultado (prueba, esperado, resultado)
select '1f las nueve asociaciones de formatos sembradas', '9',
  pg_temp.valor($q$select count(*)::text from sst_estandar_plantillas
                   where (codigo_estandar, codigo_plantilla) in (('1.2.2','FOR-02'),('4.2.4','FOR-09'),('4.2.4','FOR-23'),('4.2.4','FOR-39'),
                         ('4.2.4','FOR-40'),('4.2.4','FOR-17'),('4.2.3','FOR-14'),('4.2.1','FOR-15'),('4.2.6','FOR-27'))$q$);

-- ============================================================ 2) la calificación del artículo 27
insert into resultado (prueba, esperado, resultado)
select '2a "no aplica" sin motivo', 'contiene: sst_plan_items_no_aplica_con_motivo', pg_temp.intentar($q$
  update sst_plan_items set calificacion = 'no_aplica', motivo_no_aplica = null where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b "no aplica" con motivo da el MÁXIMO (5.1.1 vale 5)', '5.00', pg_temp.intentar($q$
  update sst_plan_items set calificacion = 'no_aplica', motivo_no_aplica = 'Prueba de la verificación 108'
   where anio = 2026 and codigo = '5.1.1'$q$);
-- (el puntaje se lee en una sentencia aparte: la vista ve el cambio solo en la sentencia siguiente)
update resultado set resultado = pg_temp.valor($q$select puntaje::numeric(4,2)::text from v_sst_autoevaluacion where anio = 2026 and codigo = '5.1.1'$q$)
 where prueba like '2b %';
insert into resultado (prueba, esperado, resultado)
select '2c "no cumple" da cero', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_plan_items set calificacion = 'no_cumple', motivo_no_aplica = null where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d … y su puntaje es 0', '0.00',
  pg_temp.valor($q$select puntaje::numeric(4,2)::text from v_sst_autoevaluacion where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e una tarea libre no se califica', 'contiene: sst_plan_items_solo_estandar_califica', pg_temp.intentar($q$
  insert into sst_plan_items (estandar, calificacion) values ('__Tarea libre 108__', 'cumple')$q$);
insert into resultado (prueba, esperado, resultado)
select '2f un estándar con código y sin valor', 'contiene: sst_plan_items_estandar_completo', pg_temp.intentar($q$
  insert into sst_plan_items (estandar, anio, codigo, ciclo, grupo) values ('__Sin valor 108__', 2026, '9.9.9', 'HACER', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2g un ciclo que no existe', 'contiene: sst_plan_items_ciclo_check', pg_temp.intentar($q$
  insert into sst_plan_items (estandar, anio, codigo, ciclo, grupo, valor) values ('__Ciclo 108__', 2026, '9.9.8', 'PENSAR', 'x', 1)$q$);

-- ============================================================ 3) privilegios
insert into resultado (prueba, esperado, resultado)
select '3a anon no lee la autoevaluación ni las asociaciones', 'false / false',
  has_table_privilege('anon', 'public.v_sst_autoevaluacion_total', 'select')::text || ' / ' ||
  has_table_privilege('anon', 'public.sst_estandar_plantillas', 'select')::text;

-- ============================================================ el 5.1.1 vuelve a como estaba
update sst_plan_items i set calificacion = a.calificacion, motivo_no_aplica = a.motivo_no_aplica
  from antes_511 a where i.anio = 2026 and i.codigo = '5.1.1';
insert into resultado (prueba, esperado, resultado)
select '4 el 5.1.1 quedó como estaba', 'true',
  (select (i.calificacion = a.calificacion and i.motivo_no_aplica is not distinct from a.motivo_no_aplica)::text
     from sst_plan_items i, antes_511 a where i.anio = 2026 and i.codigo = '5.1.1');

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

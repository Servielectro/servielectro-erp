-- Verificación de la migración 96 (días hábiles con sábado e inicio de labores elegido en el acta).
-- Correr DESPUÉS de la migración, todo junto. Reemplaza los casos 1c, 1d, 1e, 4a y 4b de la
-- verificación de la 94 (que quedan con la regla vieja y ya no aplican). Crea usuarios, un
-- proyecto y actas de prueba; BORRA todo al final. Todas las filas deben decir OK.
-- Cada consulta va en su propio statement (una función STABLE dentro del mismo statement que el
-- UPDATE ve el estado ANTERIOR: así pasaba la 5a de la 94 sin probar nada).
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

-- ============================================================ 1) la regla
insert into resultado (prueba, esperado, resultado)
select '1a jueves 29/10, 12 días, inicia al día siguiente: cuenta sábados 31/10 y 7/11, salta festivos 2 y 16', '2026-11-13',
  pg_temp.valor($q$select fn_sumar_dias_habiles('2026-10-29', 12, false)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1b el mismo caso, iniciando el MISMO día del acta', '2026-11-12',
  pg_temp.valor($q$select fn_sumar_dias_habiles('2026-10-29', 12, true)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1c 5 días desde el viernes 18/12, al día siguiente (sábado 19 cuenta; salta el domingo)', '2026-12-24',
  pg_temp.valor($q$select fn_sumar_dias_habiles('2026-12-18', 5, false)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1d 1 día desde el viernes 13/11, al día siguiente: el sábado 14', '2026-11-14',
  pg_temp.valor($q$select fn_sumar_dias_habiles('2026-11-13', 1, false)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1e acta del domingo 1/11 que inicia el mismo día: domingo y lunes festivo no cuentan', '2026-11-03',
  pg_temp.valor($q$select fn_sumar_dias_habiles('2026-11-01', 1, true)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1f sin saber cuándo inician las labores, no se calcula', 'NO SE CALCULA',
  pg_temp.valor($q$select coalesce(fn_sumar_dias_habiles('2026-10-29', 12, null)::text, 'NO SE CALCULA')$q$);

-- ============================================================ 2) la plantilla
insert into resultado (prueba, esperado, resultado)
select '2a versión 2 publicada y versión 1 archivada', '2 publicada / 1 archivada', pg_temp.valor($q$
  select (select version || ' ' || estado from sst_plantillas where id = '00000000-0000-4000-8000-0000000096a1') || ' / ' ||
         (select version || ' ' || estado from sst_plantillas where id = '00000000-0000-4000-8000-0000000094a1')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b el motor acepta la versión 2', 'SIN PROBLEMAS', pg_temp.valor($q$
  select coalesce(fn_sst_campos_problema(campos, firmas), 'SIN PROBLEMAS') from sst_plantillas where id = '00000000-0000-4000-8000-0000000096a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c "Inicio de labores" es obligatorio y va justo antes del plazo', 'true / true', pg_temp.valor($q$
  select ((x ->> 'obligatorio')::boolean)::text || ' / ' ||
         ((select o from jsonb_array_elements(campos) with ordinality e(y, o) where y ->> 'id' = 'plazo_dias_habiles') = o + 1)::text
  from sst_plantillas, jsonb_array_elements(campos) with ordinality e(x, o)
  where id = '00000000-0000-4000-8000-0000000096a1' and x ->> 'id' = 'inicio_labores'$q$);

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000096b0', 'authenticated', 'authenticated', 'proy-trab.96@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy trab 96__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select id, 'proyectos', 'trabajar', false from roles where nombre = '__Proy trab 96__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000096b0', id, '__Q 96__' from roles where nombre = '__Proy trab 96__'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000096e0', '__PRY-96__', '__Obra prueba 96__')
on conflict (id) do nothing;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000096b0');

-- ============================================================ 3) las fechas que pone la base en el acta
insert into resultado (prueba, esperado, resultado)
select '3a acta del 29/10, 12 días, inicia al día siguiente (la app manda fechas falsas)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into sst_formatos (id, plantilla_id, proyecto_id, fecha, respuestas)
  values ('00000000-0000-0000-0000-0000000096f1', '00000000-0000-4000-8000-0000000096a1', '00000000-0000-0000-0000-0000000096e0', '2026-10-29',
          '{"plazo_dias_habiles": "12", "inicio_labores": "El día siguiente al acta",
            "fecha_inicio_oficial": "2000-01-01", "fecha_terminacion_estimada": "2099-12-31"}')$q$);
insert into resultado (prueba, esperado, resultado)
select '3b … la base escribe inicio oficial y terminación', '2026-10-30 / 2026-11-13', pg_temp.valor($q$
  select (respuestas ->> 'fecha_inicio_oficial') || ' / ' || (respuestas ->> 'fecha_terminacion_estimada')
  from sst_formatos where id = '00000000-0000-0000-0000-0000000096f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c cambia a "el mismo día del acta"', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_formatos set respuestas = respuestas || '{"inicio_labores": "El mismo día del acta"}'
  where id = '00000000-0000-0000-0000-0000000096f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d … y se recalcula', '2026-10-29 / 2026-11-12', pg_temp.valor($q$
  select (respuestas ->> 'fecha_inicio_oficial') || ' / ' || (respuestas ->> 'fecha_terminacion_estimada')
  from sst_formatos where id = '00000000-0000-0000-0000-0000000096f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3e sin "inicio de labores"', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_formatos set respuestas = respuestas - 'inicio_labores' where id = '00000000-0000-0000-0000-0000000096f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f … no hay fechas inventadas', 'SIN INICIO / SIN TERMINACIÓN', pg_temp.valor($q$
  select coalesce(respuestas ->> 'fecha_inicio_oficial', 'SIN INICIO') || ' / ' || coalesce(respuestas ->> 'fecha_terminacion_estimada', 'SIN TERMINACIÓN')
  from sst_formatos where id = '00000000-0000-0000-0000-0000000096f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g la versión 1 (archivada) ya no se llena', 'contiene: Solo se llenan plantillas publicadas', pg_temp.intentar($q$
  insert into sst_formatos (plantilla_id, proyecto_id) values ('00000000-0000-4000-8000-0000000094a1', '00000000-0000-0000-0000-0000000096e0')$q$);

-- ============================================================ 4) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '4a funciones de días hábiles ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_sumar_dias_habiles', 'fn_sst_formato_calculos') and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '4b ya no existe la versión de dos parámetros (la regla vieja)', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname = 'fn_sumar_dias_habiles' and p.pronargs = 2;

-- ============================================================ limpieza (admin)
delete from sst_formatos where id = '00000000-0000-0000-0000-0000000096f1';
delete from proyectos where id = '00000000-0000-0000-0000-0000000096e0';
delete from perfiles where id = '00000000-0000-0000-0000-0000000096b0';
delete from permisos_rol where rol_id in (select id from roles where nombre = '__Proy trab 96__');
delete from roles where nombre = '__Proy trab 96__';
delete from auth.users where id = '00000000-0000-0000-0000-0000000096b0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

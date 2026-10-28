-- Verificación de la migración 98 (acta de inicio, versión 3). La 98 ya estaba aplicada en
-- producción antes de existir este archivo: esto comprueba que el archivo dice lo mismo que la base.
-- Correr todo junto. Crea un usuario de Proyectos, una obra y un acta de prueba; BORRA todo al
-- final. Todas las filas deben decir OK.
-- Cada consulta va en su propio statement (una función STABLE dentro del mismo statement que el
-- cambio ve el estado ANTERIOR).

-- 0) La función como está en producción, para compararla con la sección 1 del archivo si algo no
--    coincide (debe tener el left join lateral "a" del anticipo y la clave 'anticipo_valor').
select pg_get_functiondef('public.fn_actas_prellenado()'::regprocedure);

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

-- ============================================================ 1) la plantilla
insert into resultado (prueba, esperado, resultado)
select '1a versión 3 publicada y versión 2 archivada', '3 publicada / 2 archivada', pg_temp.valor($q$
  select (select version || ' ' || estado from sst_plantillas where id = '00000000-0000-4000-8000-0000000098a1') || ' / ' ||
         (select version || ' ' || estado from sst_plantillas where id = '00000000-0000-4000-8000-0000000096a1')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b la v3 es la única publicada del acta de inicio', '1', pg_temp.valor($q$
  select count(*)::text from sst_plantillas
  where codigo = (select codigo from sst_plantillas where id = '00000000-0000-4000-8000-0000000098a1') and estado = 'publicada'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c firmas de la v3: solo contratante y contratista, sin técnico', 'sst_cliente:true, responsable_sst:true', pg_temp.valor($q$
  select string_agg((x ->> 'rol') || ':' || (x ->> 'obligatoria'), ', ' order by o)
  from sst_plantillas, jsonb_array_elements(firmas) with ordinality e(x, o)
  where id = '00000000-0000-4000-8000-0000000098a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d req_anticipo_valor se prellena del anticipo', 'anticipo_valor', pg_temp.valor($q$
  select x ->> 'prellenar' from sst_plantillas, jsonb_array_elements(campos) x
  where id = '00000000-0000-4000-8000-0000000098a1' and x ->> 'id' = 'req_anticipo_valor'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e el resto de los campos igual que en la v2', 'iguales', pg_temp.valor($q$
  select case when (select campos from sst_plantillas where id = '00000000-0000-4000-8000-0000000096a1') =
                   (select jsonb_agg(case when x ->> 'id' = 'req_anticipo_valor' then x - 'prellenar' else x end order by o)
                    from sst_plantillas, jsonb_array_elements(campos) with ordinality e(x, o)
                    where id = '00000000-0000-4000-8000-0000000098a1')
              then 'iguales' else 'distintos' end$q$);

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000098b0', 'authenticated', 'authenticated', 'proy-trab.98@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy trab 98__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select id, 'proyectos', 'trabajar', false from roles where nombre = '__Proy trab 98__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000098b0', id, '__Q 98__' from roles where nombre = '__Proy trab 98__'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000098e0', '__PRY-98__', '__Obra prueba 98__')
on conflict (id) do nothing;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000098b0');

-- ============================================================ 2) el anticipo de Tintalá
-- Requiere el contrato de CSE-26-151 CONFIRMADO. Sin confirmar todavía, 2a da '(vacío)'.
insert into resultado (prueba, esperado, resultado)
select '2a prellenado de CSE-26-151: anticipo_valor', '8485267', pg_temp.valor($q$
  select r.datos ->> 'anticipo_valor' from fn_actas_prellenado() r join proyectos p on p.id = r.proyecto_id
  where p.codigo = 'CSE-26-151'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b obra sin contrato: sin anticipo (no se inventa)', '(vacío)', pg_temp.valor($q$
  select r.datos ->> 'anticipo_valor' from fn_actas_prellenado() r where r.proyecto_id = '00000000-0000-0000-0000-0000000098e0'$q$);

-- ============================================================ 3) acta con la v3: no pide técnicos
insert into resultado (prueba, esperado, resultado)
select '3a acta nueva con la v3', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into sst_formatos (id, plantilla_id, proyecto_id, fecha, respuestas)
  values ('00000000-0000-0000-0000-0000000098f1', '00000000-0000-4000-8000-0000000098a1', '00000000-0000-0000-0000-0000000098e0', '2026-10-29', '{}')$q$);
insert into resultado (prueba, esperado, resultado)
select '3b fn_sst_pide_tecnicos con la v3', 'false', pg_temp.valor($q$
  select fn_sst_pide_tecnicos('00000000-0000-0000-0000-0000000098f1')::text$q$);

-- ============================================================ limpieza
reset role;
delete from sst_formatos where id = '00000000-0000-0000-0000-0000000098f1';
delete from proyectos where id = '00000000-0000-0000-0000-0000000098e0';
delete from perfiles where id = '00000000-0000-0000-0000-0000000098b0';
delete from permisos_rol where rol_id in (select id from roles where nombre = '__Proy trab 98__');
delete from roles where nombre = '__Proy trab 98__';
delete from auth.users where id = '00000000-0000-0000-0000-0000000098b0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

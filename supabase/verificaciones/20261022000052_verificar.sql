-- Verificación de la migración 52 (módulo Planificación, con permiso). Correr DESPUÉS de
-- la migración, todo junto. Crea un USUARIO SIN NINGÚN ROL, un TÉCNICO y un COORDINADOR de
-- prueba, y tareas; BORRA todo antes de mostrar el resultado. No deja cambios.
--
-- Lo que importa:
--   - Administrador y Coordinador tienen Planificación; Técnicos no (y por eso no la ven en
--     el menú, que sale de fn_mis_permisos).
--   - Sin rol: no ve nada y no puede anotar. Técnico: no puede crear tareas de agenda
--     aunque llame a la API.
--   - Las agendas siguen siendo privadas: nadie ve la de otro, ni el administrador.
--
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

-- ============================================================ estructura
insert into resultado (prueba, esperado, resultado)
select '1a quién tiene Planificación', 'Administrador:responsable, Coordinador:trabajar', pg_temp.valor($q$
  select string_agg(r.nombre || ':' || pr.nivel, ', ' order by r.nombre)
  from permisos_rol pr join roles r on r.id = pr.rol_id where pr.modulo_id = 'planificacion'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b no quedó ningún mecanismo "para todos"', '0', pg_temp.valor($q$
  select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'modulos' and column_name = 'para_todos'$q$);

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'sin.rol.prueba.52@invalid.local'),
  ('00000000-0000-0000-0000-0000000000f3', 'authenticated', 'authenticated', 'tecnico.prueba.52@invalid.local'),
  ('00000000-0000-0000-0000-0000000000f4', 'authenticated', 'authenticated', 'coordinador.prueba.52@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre) values ('00000000-0000-0000-0000-0000000000f2', null, '__Sin rol 52__')
on conflict (id) do update set rol_id = null;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000000f3', id, '__Técnico 52__' from roles where nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000000f4', id, '__Coordinador 52__' from roles where nombre = 'Coordinador'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into visitas (id, titulo, tipo, fecha_programada)
values ('00000000-0000-0000-0000-00000000a521', '__obra prueba 52__', 'obra', current_date);

set local role authenticated;

-- ============================================================ 2) Jhojan y el coordinador anotan
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a Jhojan anota en su agenda y crea una de obra', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad, visita_id) values
    ('00000000-0000-0000-0000-0000000005c1', 'Revisar factura 123', 'interna', null),
    ('00000000-0000-0000-0000-0000000005c2', 'Obra de Jhojan', 'equipo', '00000000-0000-0000-0000-00000000a521')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
insert into resultado (prueba, esperado, resultado)
select '2b el coordinador tiene Planificación', 'true', fn_tiene_permiso('planificacion', 'trabajar')::text;
insert into resultado (prueba, esperado, resultado)
select '2c el coordinador anota en su agenda (orden de compra)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values ('00000000-0000-0000-0000-0000000005c4', 'Orden de compra de material', 'interna')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d el coordinador NO ve la agenda de Jhojan', '0',
  pg_temp.valor($q$select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005c1'$q$);

-- ============================================================ 3) el técnico: sin agenda
select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
insert into resultado (prueba, esperado, resultado)
select '3a el técnico NO tiene Planificación (no la ve en el menú)', 'false',
  pg_temp.valor($q$select exists (select 1 from fn_mis_permisos() where modulo_id = 'planificacion')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '3b el técnico NO puede crear tareas de agenda (ni por la API)', 'RECHAZADO', pg_temp.intentar($q$
  insert into tareas (titulo, visibilidad) values ('Agenda del técnico', 'interna')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c el técnico no ve ninguna agenda ajena', '0',
  pg_temp.valor($q$select count(*) from tareas where visibilidad = 'interna'$q$);

-- ============================================================ 4) sin ningún rol: nada
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
insert into resultado (prueba, esperado, resultado)
select '4a sin rol no tiene ningún permiso de módulo', '0', pg_temp.valor($q$select count(*) from fn_mis_permisos()$q$);
insert into resultado (prueba, esperado, resultado)
select '4b sin rol NO puede anotar', 'RECHAZADO', pg_temp.intentar($q$
  insert into tareas (titulo, visibilidad) values ('x', 'interna')$q$);
insert into resultado (prueba, esperado, resultado)
select '4c sin rol ve CERO tareas', '0', pg_temp.valor($q$select count(*) from tareas$q$);
insert into resultado (prueba, esperado, resultado)
select '4d sin rol ve CERO historial', '0', pg_temp.valor($q$select count(*) from tarea_eventos$q$);
insert into resultado (prueba, esperado, resultado)
select '4e sin rol no puede tocar la agenda de Jhojan (filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update tareas set titulo = 'cambiada' where id = '00000000-0000-0000-0000-0000000005c1'$q$);

-- ============================================================ 5) el admin tampoco ve agendas ajenas
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '5a Jhojan (admin) NO ve la agenda del coordinador', '0',
  pg_temp.valor($q$select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005c4'$q$);

-- ============================================================ limpieza (admin)
reset role;
delete from tarea_eventos where tarea_id::text like '00000000-0000-0000-0000-0000000005c%';
delete from tareas where id::text like '00000000-0000-0000-0000-0000000005c%';
delete from visitas where id = '00000000-0000-0000-0000-00000000a521';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4');

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

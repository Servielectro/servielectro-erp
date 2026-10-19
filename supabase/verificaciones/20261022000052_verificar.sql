-- Verificación de la migración 52 (módulo Planificación). Correr DESPUÉS de la migración,
-- todo junto. Crea un USUARIO SIN NINGÚN ROL de prueba (perfil con rol_id nulo) y tareas
-- de Jhojan; BORRA todo antes de mostrar el resultado. No deja cambios.
--
-- Lo que importa (pedido explícito): abrir Planificación a todos NO abre datos. El usuario
-- sin rol entra, anota en su agenda y ve CERO tareas ajenas. Si alguien cambia algún día
-- la política de tareas para que dependa del permiso de módulo, esta prueba se cae.
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
select '1a Planificación existe y es para todos', 'true',
  pg_temp.valor($q$select para_todos::text from modulos where id = 'planificacion'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b no tiene permisos por rol', '0',
  pg_temp.valor($q$select count(*) from permisos_rol where modulo_id = 'planificacion'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c los demás módulos NO quedaron para todos', '0',
  pg_temp.valor($q$select count(*) from modulos where para_todos and id <> 'planificacion'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d la base no deja cargarle permisos por rol', 'contiene: es para todos los usuarios', pg_temp.intentar($q$
  insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
  select id, 'planificacion', 'consultar', false from roles where nombre = 'Administrador'$q$);

-- ============================================================ datos de prueba (admin)
-- Usuario SIN NINGÚN ROL: perfil con rol_id nulo.
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'sin.rol.prueba.52@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
values ('00000000-0000-0000-0000-0000000000f2', null, '__Sin rol prueba 52__')
on conflict (id) do update set rol_id = null;
insert into visitas (id, titulo, tipo, fecha_programada)
values ('00000000-0000-0000-0000-00000000a521', '__obra prueba 52__', 'obra', current_date);

set local role authenticated;

-- Jhojan: una interna (su agenda) y una de equipo.
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a Jhojan anota en su agenda y crea una de equipo', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad, visita_id) values
    ('00000000-0000-0000-0000-0000000005c1', 'Agenda de Jhojan', 'interna', null),
    ('00000000-0000-0000-0000-0000000005c2', 'Obra de Jhojan', 'equipo', '00000000-0000-0000-0000-00000000a521')$q$);

-- ============================================================ el usuario sin rol
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
insert into resultado (prueba, esperado, resultado)
select '3a el usuario sin rol no tiene ningún permiso de módulo', '0',
  pg_temp.valor($q$select count(*) from fn_mis_permisos()$q$);
insert into resultado (prueba, esperado, resultado)
select '3b ve el módulo Planificación (para todos)', '1',
  pg_temp.valor($q$select count(*) from modulos where para_todos$q$);
insert into resultado (prueba, esperado, resultado)
select '3c anota en SU agenda', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values ('00000000-0000-0000-0000-0000000005c3', 'Mi recordatorio', 'interna')$q$);
insert into resultado (prueba, esperado, resultado)
select '3d ve SOLO su tarea (cero ajenas)', '1', pg_temp.valor($q$select count(*) from tareas$q$);
insert into resultado (prueba, esperado, resultado)
select '3e no ve la agenda de Jhojan', '0',
  pg_temp.valor($q$select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f no ve la tarea de obra de Jhojan', '0',
  pg_temp.valor($q$select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005c2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g no ve el historial de tareas ajenas', '0',
  pg_temp.valor($q$select count(*) from tarea_eventos where tarea_id <> '00000000-0000-0000-0000-0000000005c3'$q$);
insert into resultado (prueba, esperado, resultado)
select '3h no puede crear tareas de equipo (sin Operativo)', 'RECHAZADO', pg_temp.intentar($q$
  insert into tareas (titulo, visibilidad, visita_id) values ('x', 'equipo', '00000000-0000-0000-0000-00000000a521')$q$);
insert into resultado (prueba, esperado, resultado)
select '3i no puede tocar la agenda de Jhojan (filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update tareas set titulo = 'cambiada' where id = '00000000-0000-0000-0000-0000000005c1'$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3j y Jhojan (admin) tampoco ve la agenda del usuario sin rol', '0',
  pg_temp.valor($q$select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005c3'$q$);

-- ============================================================ limpieza (admin)
reset role;
delete from tarea_eventos where tarea_id::text like '00000000-0000-0000-0000-0000000005c%';
delete from tareas where id::text like '00000000-0000-0000-0000-0000000005c%';
delete from visitas where id = '00000000-0000-0000-0000-00000000a521';
delete from perfiles where id = '00000000-0000-0000-0000-0000000000f2';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000f2';

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

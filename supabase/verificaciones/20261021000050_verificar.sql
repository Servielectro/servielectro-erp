-- Verificación de la migración 50 (tablero de tareas y agenda). Correr DESPUÉS de la
-- migración, todo junto. Crea un COORDINADOR y un TÉCNICO de prueba, una visita y tareas;
-- BORRA todo antes de mostrar el resultado. No deja cambios.
--
-- Simula: Jhojan (Administrador), coordinador, técnico y usuario sin rol.
-- Prueba: agenda interna privada (ni el admin la ve), obra obligatoria solo en equipo,
-- quién crea y quién asigna, el asignado solo mueve de columna, dependencias con título
-- y estado (y sin título si no la puede ver), sin ciclos, historial intocable, obras sin
-- datos comerciales, hora sin fecha, sin borrar tareas.
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

-- Usuarios: Jhojan 696d…; coordinador …e9; técnico …ea; sin rol …b0
-- Tareas: c1 agenda de Jhojan · c2 agenda del coordinador · c4 "Canalizar tramo B" ·
--         c5 "Cablear tramo B" · c6 "Compra reservada" (no asignada al técnico) ·
--         c8 "Revisión final" · c9 agenda del técnico

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e9', 'authenticated', 'authenticated', 'coordinador.prueba.50@invalid.local'),
  ('00000000-0000-0000-0000-0000000000ea', 'authenticated', 'authenticated', 'tecnico.prueba.50@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000000e9', id, '__Coordinador prueba 50__' from roles where nombre = 'Coordinador'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000000ea', id, '__Técnico prueba 50__' from roles where nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into visitas (id, titulo, tipo, tecnico_id, fecha_programada)
values ('00000000-0000-0000-0000-00000000a501', '__obra prueba 50__', 'obra', '00000000-0000-0000-0000-0000000000ea', current_date);

set local role authenticated;

-- ============================================================ 1) rol Coordinador
select pg_temp.como('00000000-0000-0000-0000-0000000000e9');
insert into resultado (prueba, esperado, resultado)
select '1a permisos del rol Coordinador', 'operativo:trabajar, tecnico:consultar', pg_temp.valor($q$
  select string_agg(pr.modulo_id || ':' || pr.nivel, ', ' order by pr.modulo_id)
  from permisos_rol pr join roles r on r.id = pr.rol_id where r.nombre = 'Coordinador'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b coordinador NO tiene comercial', 'false', fn_tiene_permiso('comercial', 'consultar')::text;

-- ============================================================ 2) agenda interna y obra
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a Jhojan: interna SIN obra ("llamar al contador")', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad, fecha_programada)
  values ('00000000-0000-0000-0000-0000000000c1', 'Llamar al contador', 'interna', current_date)$q$);
insert into resultado (prueba, esperado, resultado)
select '2b hora sin fecha', 'RECHAZADO', pg_temp.intentar($q$
  insert into tareas (titulo, visibilidad, hora) values ('x', 'interna', '10:00')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c interna sin hora queda con hora nula (no 00:00)', '(vacío)', pg_temp.valor($q$
  select hora::text from tareas where id = '00000000-0000-0000-0000-0000000000c1'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e9');
insert into resultado (prueba, esperado, resultado)
select '2d coordinador: interna propia', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values ('00000000-0000-0000-0000-0000000000c2', 'Agenda del coordinador', 'interna')$q$);
insert into resultado (prueba, esperado, resultado)
select '2e coordinador: equipo SIN obra', 'contiene: tiene que colgar de un proyecto o de una visita', pg_temp.intentar($q$
  insert into tareas (titulo, visibilidad) values ('Sin obra', 'equipo')$q$);
insert into resultado (prueba, esperado, resultado)
select '2f coordinador: equipo con la visita (3 tareas)', 'aceptado (3 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad, visita_id) values
    ('00000000-0000-0000-0000-0000000000c4', 'Canalizar tramo B', 'equipo', '00000000-0000-0000-0000-00000000a501'),
    ('00000000-0000-0000-0000-0000000000c5', 'Cablear tramo B', 'equipo', '00000000-0000-0000-0000-00000000a501'),
    ('00000000-0000-0000-0000-0000000000c8', 'Revisión final', 'equipo', '00000000-0000-0000-0000-00000000a501')
  on conflict do nothing$q$);
insert into resultado (prueba, esperado, resultado)
select '2g coordinador asigna al técnico', 'aceptado (3 filas)', pg_temp.intentar($q$
  insert into tarea_asignados (tarea_id, perfil_id) values
    ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000ea'),
    ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000ea'),
    ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000ea')$q$);
insert into resultado (prueba, esperado, resultado)
select '2h coordinador asigna su tarea INTERNA', 'contiene: Una tarea interna no se asigna', pg_temp.intentar($q$
  insert into tarea_asignados (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000ea')$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2i Jhojan: equipo "Compra reservada" (no asignada al técnico)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad, visita_id)
  values ('00000000-0000-0000-0000-0000000000c6', 'Compra reservada', 'equipo', '00000000-0000-0000-0000-00000000a501')$q$);

-- ============================================================ 3) quién ve qué
insert into resultado (prueba, esperado, resultado)
select '3a Jhojan (admin) NO ve la agenda del coordinador', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000000c2'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000e9');
insert into resultado (prueba, esperado, resultado)
select '3b coordinador NO ve la agenda de Jhojan', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000000c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c coordinador ve las de equipo (4) y su agenda (1)', '5', pg_temp.valor($q$
  select count(*) from tareas where id::text like '00000000-0000-0000-0000-0000000000c%'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ea');
insert into resultado (prueba, esperado, resultado)
select '3d técnico ve solo sus 3 asignadas', '3', pg_temp.valor($q$
  select count(*) from tareas where id::text like '00000000-0000-0000-0000-0000000000c%'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000b0');
insert into resultado (prueba, esperado, resultado)
select '3e sin rol no ve nada', '0', pg_temp.valor($q$
  select count(*) from tareas where id::text like '00000000-0000-0000-0000-0000000000c%'$q$);

-- ============================================================ 4) el técnico
select pg_temp.como('00000000-0000-0000-0000-0000000000ea');
insert into resultado (prueba, esperado, resultado)
select '4a técnico crea tarea de EQUIPO', 'RECHAZADO', pg_temp.intentar($q$
  insert into tareas (titulo, visibilidad, visita_id) values ('x', 'equipo', '00000000-0000-0000-0000-00000000a501')$q$);
insert into resultado (prueba, esperado, resultado)
select '4b técnico crea su tarea interna', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values ('00000000-0000-0000-0000-0000000000c9', 'Comprar guantes', 'interna')$q$);
insert into resultado (prueba, esperado, resultado)
select '4c técnico cambia el título de una asignada', 'contiene: solo puedes mover la tarea de columna', pg_temp.intentar($q$
  update tareas set titulo = 'otro' where id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '4d técnico archiva una asignada', 'RECHAZADO', pg_temp.intentar($q$
  update tareas set archivada = true where id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '4e técnico pasa su interna a equipo', 'RECHAZADO', pg_temp.intentar($q$
  update tareas set visibilidad = 'equipo', visita_id = '00000000-0000-0000-0000-00000000a501'
  where id = '00000000-0000-0000-0000-0000000000c9'$q$);

-- ============================================================ 5) dependencias
select pg_temp.como('00000000-0000-0000-0000-0000000000e9');
insert into resultado (prueba, esperado, resultado)
select '5a "Cablear" espera a "Canalizar" y a "Compra reservada" (para empezar)', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into tarea_dependencias (tarea_id, bloqueante_id, tipo) values
    ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c4', 'para_empezar'),
    ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c6', 'para_empezar')$q$);
insert into resultado (prueba, esperado, resultado)
select '5b "Cablear" no cierra sin "Revisión final" (para cerrar)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_dependencias (tarea_id, bloqueante_id, tipo)
  values ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c8', 'para_cerrar')$q$);
insert into resultado (prueba, esperado, resultado)
select '5c ciclo: "Canalizar" esperando a "Cablear"', 'contiene: círculo', pg_temp.intentar($q$
  insert into tarea_dependencias (tarea_id, bloqueante_id) values ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c5')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000ea');
insert into resultado (prueba, esperado, resultado)
select '5d técnico arranca "Cablear": dice título y estado de la visible', 'contiene: "Canalizar tramo B" (Por hacer)', pg_temp.intentar($q$
  update tareas set estado = 'en_progreso' where id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '5e … y la que no puede ver, sin título', 'contiene: 1 tarea que no puedes ver', pg_temp.intentar($q$
  update tareas set estado = 'en_progreso' where id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '5f el mensaje NO filtra el título oculto', 'no contiene: Compra reservada', pg_temp.intentar($q$
  update tareas set estado = 'en_progreso' where id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '5g técnico cierra "Canalizar" (asignada)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tareas set estado = 'hecho' where id = '00000000-0000-0000-0000-0000000000c4'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '5h Jhojan cierra "Compra reservada"', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tareas set estado = 'hecho' where id = '00000000-0000-0000-0000-0000000000c6'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ea');
insert into resultado (prueba, esperado, resultado)
select '5i ahora sí arranca "Cablear"', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tareas set estado = 'en_progreso' where id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '5j no cierra "Cablear" sin "Revisión final"', 'contiene: No puede pasar a Hecho: la bloquea "Revisión final" (Por hacer)', pg_temp.intentar($q$
  update tareas set estado = 'hecho' where id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '5k cierra "Revisión final"', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tareas set estado = 'hecho' where id = '00000000-0000-0000-0000-0000000000c8'$q$);
insert into resultado (prueba, esperado, resultado)
select '5l ahora sí cierra "Cablear"', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tareas set estado = 'hecho' where id = '00000000-0000-0000-0000-0000000000c5'$q$);

-- ============================================================ 6) historial intocable
insert into resultado (prueba, esperado, resultado)
select '6a nota de seguimiento del técnico', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_nota_tarea('00000000-0000-0000-0000-0000000000c5', 'Quedó cableado el tramo B')$q$);
insert into resultado (prueba, esperado, resultado)
select '6b nota en una tarea que no ve', 'RECHAZADO', pg_temp.intentar($q$
  select fn_nota_tarea('00000000-0000-0000-0000-0000000000c6', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '6c el historial de "Cablear" registró todo (creada, deps, estados, nota)', '>= 6', pg_temp.valor($q$
  select count(*) from tarea_eventos where tarea_id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '6d técnico escribe un evento a mano', 'RECHAZADO', pg_temp.intentar($q$
  insert into tarea_eventos (tarea_id, tipo) values ('00000000-0000-0000-0000-0000000000c5', 'nota')$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '6e Operativo (Jhojan) edita el historial', 'RECHAZADO', pg_temp.intentar($q$
  update tarea_eventos set nota = 'cambiada' where tarea_id = '00000000-0000-0000-0000-0000000000c5'$q$);
insert into resultado (prueba, esperado, resultado)
select '6f Operativo (Jhojan) borra el historial', 'RECHAZADO', pg_temp.intentar($q$
  delete from tarea_eventos where tarea_id = '00000000-0000-0000-0000-0000000000c5'$q$);

-- ============================================================ 7) archivar, no borrar; obras
insert into resultado (prueba, esperado, resultado)
select '7a Jhojan borra su tarea (no hay borrado)', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from tareas where id = '00000000-0000-0000-0000-0000000000c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '7b Jhojan la archiva', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tareas set archivada = true where id = '00000000-0000-0000-0000-0000000000c1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000e9');
insert into resultado (prueba, esperado, resultado)
select '7c obras para el coordinador: solo id, código y nombre', 'TABLE(id uuid, codigo text, nombre text)', pg_temp.valor($q$
  select pg_get_function_result('public.fn_proyectos_para_tareas()'::regprocedure)$q$);
insert into resultado (prueba, esperado, resultado)
select '7d el coordinador la puede llamar', 'aceptado (0 filas)', pg_temp.intentar($q$select * from fn_proyectos_para_tareas()$q$);
insert into resultado (prueba, esperado, resultado)
select '7e personas asignables para el coordinador', '>= 1', pg_temp.valor($q$select count(*) from fn_personas_asignables()$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ea');
insert into resultado (prueba, esperado, resultado)
select '7f el técnico no lista personas para asignar', 'RECHAZADO', pg_temp.intentar($q$select * from fn_personas_asignables()$q$);

-- ============================================================ 8) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '8a políticas using(true) en el tablero', '0', count(*)::text
from pg_policies where schemaname = 'public'
  and tablename in ('tareas', 'tarea_asignados', 'tarea_subtareas', 'tarea_dependencias', 'tarea_eventos')
  and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true');
insert into resultado (prueba, esperado, resultado)
select '8b políticas que escriben en tarea_eventos', '0', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'tarea_eventos' and cmd <> 'SELECT';
insert into resultado (prueba, esperado, resultado)
select '8c privilegios de anon en el tablero', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('tareas', 'tarea_asignados', 'tarea_subtareas', 'tarea_dependencias', 'tarea_eventos');
insert into resultado (prueba, esperado, resultado)
select '8d authenticated sin insert/update/delete en tarea_eventos', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated' and table_name = 'tarea_eventos'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
insert into resultado (prueba, esperado, resultado)
select '8e columnas de Google Calendar (nulas)', '2', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'tareas' and is_nullable = 'YES'
  and column_name in ('calendario_evento_id', 'calendario_sincronizado_en');

-- ============================================================ limpieza (admin)
delete from tarea_dependencias where tarea_id::text like '00000000-0000-0000-0000-0000000000c%';
delete from tarea_subtareas where tarea_id::text like '00000000-0000-0000-0000-0000000000c%';
delete from tarea_asignados where tarea_id::text like '00000000-0000-0000-0000-0000000000c%';
delete from tarea_eventos where tarea_id::text like '00000000-0000-0000-0000-0000000000c%';
delete from tareas where id::text like '00000000-0000-0000-0000-0000000000c%';
delete from visitas where id = '00000000-0000-0000-0000-00000000a501';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000ea');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000ea');

-- ============================================================ resultado (última instrucción)
select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado like 'no contiene: %' and resultado like 'RECHAZADO%' and position(substring(esperado from 14) in resultado) = 0 then 'OK'
    when esperado like '>= %' and resultado ~ '^[0-9]+$' and resultado::int >= substring(esperado from 4)::int then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

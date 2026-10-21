-- Verificación del CAMINO COMPLETO DEL TÉCNICO, contra la base ya migrada (hasta la 57).
-- Para correr antes de entregarles el módulo a los técnicos y después de cualquier migración
-- que toque permisos, RLS o funciones. No es de una migración: es de punta a punta.
--
-- Hace, con la sesión de cada uno (RLS y privilegios reales, no como administrador):
--   1) alta del técnico: usuario + perfil con rol "Técnicos" (lo que hace crearUsuario con la
--      clave secreta; acá se inserta directo) y Jhojan le pone la cédula (cambiarDatosPersonales);
--   2) Jhojan lo ve en la lista de asignables, le crea una visita (crearVisita) y una tarea de
--      obra en esa visita, asignada a él (tablero de Operativo);
--   3) el técnico entra: tiene tecnico/trabajar (/tecnico), lee su nombre y cédula, baja la
--      visita y la tarea con LAS MISMAS consultas que la app (descargarVisitas,
--      descargarTareas), mueve la tarea, arranca la visita, y NO entra a Planificación.
-- Crea todo con ids de prueba y lo BORRA antes de mostrar el resultado.
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

-- ============================================================ 1) alta del técnico (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000f7', 'authenticated', 'authenticated', 't.camino.tecnico@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000000f7', r.id, '__Técnico camino prueba__'
from roles r where r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre;

insert into resultado (prueba, esperado, resultado)
select '1a existe el rol "Técnicos" y el perfil quedó con él', '1', pg_temp.valor($q$
  select count(*) from perfiles p join roles r on r.id = p.rol_id
  where p.id = '00000000-0000-0000-0000-0000000000f7' and r.nombre = 'Técnicos'$q$);

set local role authenticated;

-- ============================================================ 2) Jhojan asigna
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '1b Jhojan le pone la cédula (cambiarDatosPersonales)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update perfiles set cedula = '1012345678', telefono = '3000000000'
  where id = '00000000-0000-0000-0000-0000000000f7'$q$);
insert into resultado (prueba, esperado, resultado)
select '2a el técnico sale en la lista de asignables', '1', pg_temp.valor($q$
  select count(*) from fn_tecnicos_asignables() t where t.id = '00000000-0000-0000-0000-0000000000f7'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b Jhojan crea la visita asignada (crearVisita)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visitas (id, titulo, cliente_nombre, direccion, tipo, tecnico_id, fecha_programada, descripcion_trabajo)
  values ('00000000-0000-0000-0000-00000000c7a1', '__visita camino prueba__', 'Cliente de prueba', 'Calle 1',
          'obra', '00000000-0000-0000-0000-0000000000f7', current_date, 'Prueba del camino del técnico')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c Jhojan crea una tarea de obra en esa visita', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad, visita_id)
  values ('00000000-0000-0000-0000-00000000c7b1', '__tarea camino prueba__', 'equipo', '00000000-0000-0000-0000-00000000c7a1')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d … y se la asigna al técnico', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_asignados (tarea_id, perfil_id)
  values ('00000000-0000-0000-0000-00000000c7b1', '00000000-0000-0000-0000-0000000000f7')$q$);

-- ============================================================ 3) el técnico entra
select pg_temp.como('00000000-0000-0000-0000-0000000000f7');
insert into resultado (prueba, esperado, resultado)
select '3a abre /tecnico (tecnico/trabajar)', 'true', pg_temp.valor($q$
  select fn_tiene_permiso('tecnico', 'trabajar')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '3b lee su nombre y cédula (página /tecnico)', '__Técnico camino prueba__ · 1012345678', pg_temp.valor($q$
  select nombre || ' · ' || cedula from perfiles where id = '00000000-0000-0000-0000-0000000000f7'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c baja su visita (consulta de descargarVisitas)', '1', pg_temp.valor($q$
  select count(*) from visitas
  where tecnico_id = '00000000-0000-0000-0000-0000000000f7'
    and estado in ('programada', 'en_curso', 'firmada')
    and id = '00000000-0000-0000-0000-00000000c7a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d baja su tarea (consulta de descargarTareas)', '1', pg_temp.valor($q$
  select count(*) from tareas t join tarea_asignados a on a.tarea_id = t.id
  where a.perfil_id = '00000000-0000-0000-0000-0000000000f7'
    and t.visibilidad = 'equipo' and t.archivada = false
    and t.id = '00000000-0000-0000-0000-00000000c7b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3e mueve la tarea a "En progreso"', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tareas set estado = 'en_progreso' where id = '00000000-0000-0000-0000-00000000c7b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f arranca la visita (en curso)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update visitas set estado = 'en_curso' where id = '00000000-0000-0000-0000-00000000c7a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g NO entra a Planificación', 'false', pg_temp.valor($q$
  select fn_tiene_permiso('planificacion', 'trabajar')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '3h NO lee clientes (NIT, RUT)', '0', pg_temp.valor($q$
  select count(*) from clientes$q$);

-- ============================================================ limpieza (admin)
reset role;
delete from tarea_subtareas where tarea_id = '00000000-0000-0000-0000-00000000c7b1';
delete from tarea_asignados where tarea_id = '00000000-0000-0000-0000-00000000c7b1';
delete from tarea_eventos where tarea_id = '00000000-0000-0000-0000-00000000c7b1';
delete from tareas where id = '00000000-0000-0000-0000-00000000c7b1';
delete from visitas where id = '00000000-0000-0000-0000-00000000c7a1';
delete from perfiles where id = '00000000-0000-0000-0000-0000000000f7';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000f7';

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

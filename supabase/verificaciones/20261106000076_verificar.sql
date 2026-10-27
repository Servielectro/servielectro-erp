-- Verificación de la migración 76 (notificaciones). Correr DESPUÉS de la migración, todo junto.
-- Prueba cada evento (abono, permiso, gasto, documento, caja menor, tarea) hecho por SQL —también
-- avisa—, que el texto no lleva montos, que la calamidad para hoy llega urgente, que nadie se avisa
-- a sí mismo, que "gasto registrado" viene apagada y se puede prender, que apagar un tipo funciona,
-- y que cada quien ve y marca SOLO las suyas (ni el administrador ve las ajenas) y nadie las crea a
-- mano. Crea personas y registros de prueba (Jhojan como aprobador) y BORRA todo antes del resultado.
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
-- T = técnico. R = RRHH "trabajar". J = Jhojan (aprobador de permisos y abonos).
-- Los eventos se hacen como administrador por SQL (con la "sesión" de quien actúa), que es justo lo
-- que se quiere probar: un cambio hecho por fuera de la pantalla también avisa.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000076a0', 'authenticated', 'authenticated', 'tecnico.76@invalid.local'),
  ('00000000-0000-0000-0000-0000000076b0', 'authenticated', 'authenticated', 'rrhh.76@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__RRHH prueba 76__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'rrhh', 'trabajar', false from roles r where r.nombre = '__RRHH prueba 76__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000076a0', 'Técnicos', 'Camilo Prueba76'),
             ('00000000-0000-0000-0000-0000000076b0', '__RRHH prueba 76__', 'Alejandra Prueba76')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into rrhh_aprobadores (perfil_id) select '696d9431-5c4d-4043-aee4-3e4597094f26' where exists (select 1 from perfiles where id = '696d9431-5c4d-4043-aee4-3e4597094f26')
on conflict (perfil_id) do nothing;

create temporary table ids76 on commit drop as
select '00000000-0000-0000-0000-0000000076a0'::uuid t, '00000000-0000-0000-0000-0000000076b0'::uuid r, '696d9431-5c4d-4043-aee4-3e4597094f26'::uuid j;
grant select on ids76 to authenticated;

-- ============================================================ 1) abonos
select pg_temp.como('00000000-0000-0000-0000-0000000076a0');
insert into abonos (id, persona_id, monto, fecha_requerida) values
  ('00000000-0000-0000-0000-0000000076c1', '00000000-0000-0000-0000-0000000076a0', 350000, (now() at time zone 'America/Bogota')::date + 2);
insert into resultado (prueba, esperado, resultado)
select '1a abono pedido: le llega al aprobador, sin el monto', 'Pidieron un abono de nómina / Camilo Prueba76 pidió un abono. / normal',
  pg_temp.valor($q$select titulo || ' / ' || cuerpo || ' / ' || case when urgente then 'URGENTE' else 'normal' end
                  from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076c1' and destinatario_id = (select j from ids76)$q$);
insert into abonos (id, persona_id, monto, fecha_requerida, urgencia_calamidad, justificacion) values
  ('00000000-0000-0000-0000-0000000076c2', '00000000-0000-0000-0000-0000000076a0', 200000, (now() at time zone 'America/Bogota')::date, true, 'Calamidad');
insert into resultado (prueba, esperado, resultado)
select '1b calamidad para hoy: llega marcada urgente', 'URGENTE: abono por calamidad doméstica para hoy / URGENTE',
  pg_temp.valor($q$select titulo || ' / ' || case when urgente then 'URGENTE' else 'normal' end
                  from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076c2'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
update abonos set estado = 'aprobado', monto_aprobado = 200000 where id = '00000000-0000-0000-0000-0000000076c1';
insert into resultado (prueba, esperado, resultado)
select '1c aprobado: al técnico, sin monto; al que aprueba nada', 'Te aprobaron un abono / 0',
  pg_temp.valor($q$select titulo from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076c1' and destinatario_id = (select t from ids76)$q$)
  || ' / ' || pg_temp.valor($q$select count(*)::text from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076c1' and destinatario_id = (select j from ids76) and tipo <> 'abono_solicitado'$q$);
update abonos set estado = 'desembolsado', fecha_desembolso = (now() at time zone 'America/Bogota')::date,
  pantallazo_path = 'abonos/00000000-0000-0000-0000-0000000076c1/p.jpg' where id = '00000000-0000-0000-0000-0000000076c1';
insert into resultado (prueba, esperado, resultado)
select '1d transferido: le llega al técnico', 'Te transfirieron un abono',
  pg_temp.valor($q$select titulo from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076c1' and tipo = 'abono_desembolsado'$q$);
update abonos set estado = 'rechazado', motivo_rechazo = 'Flujo de caja' where id = '00000000-0000-0000-0000-0000000076c2';
insert into resultado (prueba, esperado, resultado)
select '1e rechazado: le llega al técnico, sin el motivo en el aviso', 'Tu abono fue rechazado / Entra para ver el motivo.',
  pg_temp.valor($q$select titulo || ' / ' || cuerpo from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076c2' and destinatario_id = (select t from ids76)$q$);

-- ============================================================ 2) permisos
select pg_temp.como('00000000-0000-0000-0000-0000000076a0');
insert into permisos_laborales (id, persona_id, tipo, desde, hasta, motivo) values
  ('00000000-0000-0000-0000-0000000076d1', '00000000-0000-0000-0000-0000000076a0', 'cita_medica', '2026-12-10', '2026-12-10', 'Cita');
insert into resultado (prueba, esperado, resultado)
select '2a permiso pedido: al aprobador, con la fecha', 'Pidieron un permiso / Camilo Prueba76 pidió permiso para el 10/12.',
  pg_temp.valor($q$select titulo || ' / ' || cuerpo from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076d1'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
update permisos_laborales set estado = 'aprobado', compensacion = 'con_goce' where id = '00000000-0000-0000-0000-0000000076d1';
insert into resultado (prueba, esperado, resultado)
select '2b permiso aprobado: al técnico', 'Te aprobaron un permiso / Para el 10/12.',
  pg_temp.valor($q$select titulo || ' / ' || cuerpo from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076d1' and destinatario_id = (select t from ids76)$q$);

-- ============================================================ 3) gastos
select pg_temp.como('00000000-0000-0000-0000-0000000076a0');
insert into gastos (id, persona_id, tipo, categoria_costo, monto, descripcion, pagado_con) values
  ('00000000-0000-0000-0000-0000000076e1', '00000000-0000-0000-0000-0000000076a0', 'compra', 'MATERIAL', 45000, 'Cinta', 'propio');
insert into resultado (prueba, esperado, resultado)
select '3a gasto registrado: a RRHH NO le llega (apagada por defecto)', '0',
  pg_temp.valor($q$select count(*)::text from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076e1'$q$);
insert into notificacion_preferencias (perfil_id, tipo, activa) values ('00000000-0000-0000-0000-0000000076b0', 'gasto_registrado', true);
insert into gastos (id, persona_id, tipo, categoria_costo, monto, descripcion, origen, destino, pagado_con) values
  ('00000000-0000-0000-0000-0000000076e2', '00000000-0000-0000-0000-0000000076a0', 'transporte', 'TRANSPORTE', 12000, 'Taxi', 'A', 'B', 'propio');
insert into resultado (prueba, esperado, resultado)
select '3b si RRHH la prende, le llega', 'Transporte registrado / Camilo Prueba76 registró un transporte.',
  pg_temp.valor($q$select titulo || ' / ' || cuerpo from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076e2' and destinatario_id = (select r from ids76)$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000076b0');
update gastos set estado = 'observado', observacion = 'Falta la factura' where id = '00000000-0000-0000-0000-0000000076e1';
insert into resultado (prueba, esperado, resultado)
select '3c gasto observado: al técnico', 'RRHH te devolvió un gasto para corregir / /tecnico/gastos',
  pg_temp.valor($q$select titulo || ' / ' || ruta from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076e1' and destinatario_id = (select t from ids76)$q$);

-- ============================================================ 4) documentos y caja menor
insert into documentos_personal (id, persona_id, tipo, titulo, storage_path, requiere_firma) values
  ('00000000-0000-0000-0000-0000000076f1', '00000000-0000-0000-0000-0000000076a0', 'desprendible', 'Quincena 1 nov', 'documentos/00000000-0000-0000-0000-0000000076a0/d.pdf', true);
insert into resultado (prueba, esperado, resultado)
select '4a documento que pide firma: lo dice', 'Tienes un desprendible nuevo para firmar / Quincena 1 nov · pide tu firma.',
  pg_temp.valor($q$select titulo || ' / ' || cuerpo from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076f1'$q$);
insert into empleados (id, perfil_id, primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base) values
  ('00000000-0000-0000-0000-0000000076a1', '00000000-0000-0000-0000-0000000076a0', 'Camilo', 'Prueba', '1000000761', '2026-01-15', 1);
insert into caja_menor_recibos (id, empleado_id, concepto, monto_asignado) values
  ('00000000-0000-0000-0000-0000000076a2', '00000000-0000-0000-0000-0000000076a1', 'Viáticos Tunja', 300000);
update caja_menor_recibos set estado = 'cerrada' where id = '00000000-0000-0000-0000-0000000076a2';
insert into resultado (prueba, esperado, resultado)
select '4b caja menor asignada y cerrada (al usuario de la ficha)', 'Te asignaron una caja menor | Te cerraron una caja menor',
  pg_temp.valor($q$select string_agg(titulo, ' | ' order by titulo) from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076a2'$q$);

-- ============================================================ 5) tareas
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into clientes (id, nombre) values ('00000000-0000-0000-0000-0000000076b4', '__Cliente 76__');
insert into proyectos (id, codigo, nombre, cliente_id) values ('00000000-0000-0000-0000-0000000076b5', '__P76__', '__Obra 76__', '00000000-0000-0000-0000-0000000076b4');
insert into tareas (id, titulo, visibilidad, proyecto_id, creada_por) values ('00000000-0000-0000-0000-0000000076b1', 'Revisar cámara portería', 'equipo', '00000000-0000-0000-0000-0000000076b5', '696d9431-5c4d-4043-aee4-3e4597094f26');
insert into tarea_asignados (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000076b1', '00000000-0000-0000-0000-0000000076a0');
insert into resultado (prueba, esperado, resultado)
select '5a tarea asignada: al técnico, con el título, a su app', 'Te asignaron una tarea / Revisar cámara portería / /tecnico',
  pg_temp.valor($q$select titulo || ' / ' || cuerpo || ' / ' || ruta from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076b1' and tipo = 'tarea_asignada'$q$);
insert into grupos (id, nombre) values ('00000000-0000-0000-0000-0000000076b2', '__Grupo 76__');
insert into grupo_miembros (grupo_id, perfil_id) values ('00000000-0000-0000-0000-0000000076b2', '00000000-0000-0000-0000-0000000076a0'), ('00000000-0000-0000-0000-0000000076b2', '00000000-0000-0000-0000-0000000076b0');
insert into tareas (id, titulo, visibilidad, creada_por) values ('00000000-0000-0000-0000-0000000076b6', 'Reunión de obra', 'compartida', '696d9431-5c4d-4043-aee4-3e4597094f26');
insert into tarea_participantes (tarea_id, grupo_id) values ('00000000-0000-0000-0000-0000000076b6', '00000000-0000-0000-0000-0000000076b2');
insert into resultado (prueba, esperado, resultado)
select '5b compartida con un grupo: a cada miembro', '2',
  pg_temp.valor($q$select count(*)::text from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076b6' and tipo = 'tarea_compartida'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000076b0');
insert into tarea_asignados (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000076b1', '00000000-0000-0000-0000-0000000076b0');
insert into resultado (prueba, esperado, resultado)
select '5c quien se asigna a sí mismo no se avisa', '0',
  pg_temp.valor($q$select count(*)::text from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076b1' and tipo = 'tarea_asignada' and destinatario_id = (select r from ids76)$q$);

-- ============================================================ 6) cada quien las suyas
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000076a0');
insert into resultado (prueba, esperado, resultado)
select '6a el técnico apaga "tarea asignada"', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into notificacion_preferencias (perfil_id, tipo, activa) values ('00000000-0000-0000-0000-0000000076a0', 'tarea_asignada', false)$q$);
reset role;
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into tareas (id, titulo, visibilidad, proyecto_id, creada_por) values ('00000000-0000-0000-0000-0000000076b3', 'Otra tarea', 'equipo', '00000000-0000-0000-0000-0000000076b5', '696d9431-5c4d-4043-aee4-3e4597094f26');
insert into tarea_asignados (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000076b3', '00000000-0000-0000-0000-0000000076a0');
insert into resultado (prueba, esperado, resultado)
select '6b ... y ya no le llega', '0',
  pg_temp.valor($q$select count(*)::text from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076b3'$q$);
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000076a0');
insert into resultado (prueba, esperado, resultado)
select '6c el técnico ve solo las suyas (ninguna del aprobador ni de RRHH)', '10 / 0',
  pg_temp.valor($q$select (select count(*) from notificaciones where destinatario_id = (select t from ids76))::text || ' / ' ||
                  (select count(*) from notificaciones where destinatario_id <> (select t from ids76))::text$q$);
insert into resultado (prueba, esperado, resultado)
select '6d marca como leída una suya', 'aceptado (1 filas)', pg_temp.intentar($q$
  update notificaciones set leida_en = now() where origen_id = '00000000-0000-0000-0000-0000000076f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '6e no marca las ajenas', 'aceptado (0 filas)', pg_temp.intentar($q$
  update notificaciones set leida_en = now() where destinatario_id = (select j from ids76)$q$);
insert into resultado (prueba, esperado, resultado)
select '6f no cambia el texto de una suya', 'contiene: permission denied', pg_temp.intentar($q$
  update notificaciones set titulo = 'x' where origen_id = '00000000-0000-0000-0000-0000000076f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '6g no inserta notificaciones', 'contiene: permission denied', pg_temp.intentar($q$
  insert into notificaciones (destinatario_id, tipo, titulo) values ((select j from ids76), 'tarea_asignada', 'Falsa')$q$);
insert into resultado (prueba, esperado, resultado)
select '6h no las crea llamando la función a mano', 'contiene: no se crean a mano', pg_temp.intentar($q$
  select fn_notificar((select j from ids76), 'tarea_asignada', 'Falsa', null, null, null, null)$q$);
insert into resultado (prueba, esperado, resultado)
select '6i no las borra', 'contiene: permission denied', pg_temp.intentar($q$
  delete from notificaciones where origen_id = '00000000-0000-0000-0000-0000000076f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '6j no lee la lista de aprobadores por la función auxiliar', '0',
  pg_temp.valor($q$select count(*)::text from fn_notif_aprobadores('abonos')$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '6k ni el administrador ve las del técnico', '0',
  pg_temp.valor($q$select count(*)::text from notificaciones where destinatario_id = (select t from ids76)$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '6l ningún aviso de prueba lleva montos', '0',
  pg_temp.valor($q$select count(*)::text from notificaciones where destinatario_id in ((select t from ids76), (select r from ids76), (select j from ids76))
                  and (coalesce(titulo, '') || ' ' || coalesce(cuerpo, '')) ~ '(350|200|45|12|300)[.,]?000'$q$);
insert into resultado (prueba, esperado, resultado)
select '6m anónimo no ve nada', 'false',
  pg_temp.valor($q$select has_table_privilege('anon', 'notificaciones', 'select')::text$q$);

-- ============================================================ limpieza (admin)
delete from notificaciones where origen_id::text like '00000000-0000-0000-0000-000000007%' or destinatario_id in ((select t from ids76), (select r from ids76));
delete from notificacion_preferencias where perfil_id in ((select t from ids76), (select r from ids76));
delete from tarea_participantes where tarea_id::text like '00000000-0000-0000-0000-0000000076b%';
delete from tarea_asignados where tarea_id::text like '00000000-0000-0000-0000-0000000076b%';
delete from tarea_eventos where tarea_id::text like '00000000-0000-0000-0000-0000000076b%';
delete from tareas where id::text like '00000000-0000-0000-0000-0000000076b%';
delete from grupo_miembros where grupo_id = '00000000-0000-0000-0000-0000000076b2';
delete from grupo_eventos where grupo_id = '00000000-0000-0000-0000-0000000076b2';
delete from grupos where id = '00000000-0000-0000-0000-0000000076b2';
delete from proyectos where id = '00000000-0000-0000-0000-0000000076b5';
delete from clientes where id = '00000000-0000-0000-0000-0000000076b4';
delete from caja_menor_recibos where id = '00000000-0000-0000-0000-0000000076a2';
delete from empleados where id = '00000000-0000-0000-0000-0000000076a1';
delete from documentos_personal where id = '00000000-0000-0000-0000-0000000076f1';
delete from gastos where persona_id = (select t from ids76);
delete from permisos_laborales where persona_id = (select t from ids76);
delete from abonos where persona_id = (select t from ids76);
delete from perfiles where id in ((select t from ids76), (select r from ids76));
delete from permisos_rol where rol_id in (select id from roles where nombre = '__RRHH prueba 76__');
delete from roles where nombre = '__RRHH prueba 76__';
delete from auth.users where id in ('00000000-0000-0000-0000-0000000076a0', '00000000-0000-0000-0000-0000000076b0');

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

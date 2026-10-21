-- Verificación de la migración 62 (eliminar tareas y visitas con contraseña, rastro único).
-- Correr DESPUÉS de la migración, todo junto. Crea un TÉCNICO de prueba, visitas y una tarea,
-- y BORRA todo antes de mostrar el resultado. No usa los datos reales (la visita de Miguel).
--
-- La contraseña la verifica el SERVIDOR contra Supabase Auth; acá se simula el paso siguiente
-- (el servidor registra la confirmación con la clave de servicio) llamando a
-- fn_reautenticacion_registrar como administrador. Lo que se prueba es que la base NO borra
-- nada sin esa confirmación reciente.
-- No crea archivos en el almacenamiento: comprueba que la función DEVUELVE las rutas que el
-- servidor tiene que borrar.
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

-- ============================================================ datos de prueba (admin)
-- J = Jhojan (Operativo). T = técnico de prueba.
-- Visita A: de prueba, en curso, con jornada, foto, firma del técnico, sugerencia y nota → se elimina.
-- Visita B: con la firma del cliente → no se elimina.
-- Visita C: con una tarea → no se elimina hasta quitar la tarea.
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000ee', 'authenticated', 'authenticated', 'tecnico.prueba.62@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre, cedula)
select '00000000-0000-0000-0000-0000000000ee', r.id, '__Técnico prueba 62__', '1000000062'
from roles r where r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into visitas (id, titulo, tipo, estado, tecnico_id, fecha_programada, creada_por) values
  ('00000000-0000-0000-0000-00000000a621', '__visita A prueba 62__', 'visita', 'en_curso', '00000000-0000-0000-0000-0000000000ee', current_date, '696d9431-5c4d-4043-aee4-3e4597094f26'),
  ('00000000-0000-0000-0000-00000000a622', '__visita B prueba 62__', 'visita', 'en_curso', '00000000-0000-0000-0000-0000000000ee', current_date, '696d9431-5c4d-4043-aee4-3e4597094f26'),
  ('00000000-0000-0000-0000-00000000a623', '__visita C prueba 62__', 'visita', 'programada', '00000000-0000-0000-0000-0000000000ee', current_date, '696d9431-5c4d-4043-aee4-3e4597094f26');
insert into visita_jornadas (id, visita_id, fecha, check_in_en, check_in_gps_estado, labor_ejecutada)
values ('00000000-0000-0000-0000-00000000b621', '00000000-0000-0000-0000-00000000a621', current_date, now(), 'sin_senal', 'Prueba');
insert into visita_fotos (visita_id, jornada_id, storage_path, momento, bytes)
values ('00000000-0000-0000-0000-00000000a621', '00000000-0000-0000-0000-00000000b621',
        '00000000-0000-0000-0000-00000000a621/foto-1.jpg', 'antes', 1000);
insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
values ('00000000-0000-0000-0000-00000000a621', 'tecnico', 'T', '1', '00000000-0000-0000-0000-00000000a621/firma-tecnico.png');
insert into visita_sugerencias (visita_id, jornada_id, descripcion)
values ('00000000-0000-0000-0000-00000000a621', '00000000-0000-0000-0000-00000000b621', 'Cable de prueba');
insert into visita_notas_posteriores (visita_id, texto) values ('00000000-0000-0000-0000-00000000a621', 'Nota de prueba');
-- En dos sentencias: la del cliente exige que la del técnico ya exista (fn_firma_antes).
insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
values ('00000000-0000-0000-0000-00000000a622', 'tecnico', 'T', '1', '00000000-0000-0000-0000-00000000a622/firma-tecnico.png');
insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
values ('00000000-0000-0000-0000-00000000a622', 'cliente', 'C', '2', '00000000-0000-0000-0000-00000000a622/firma-cliente.png');
insert into tareas (id, titulo, visibilidad, visita_id, creada_por)
values ('00000000-0000-0000-0000-00000000c621', '__tarea prueba 62__', 'equipo', '00000000-0000-0000-0000-00000000a623',
        '696d9431-5c4d-4043-aee4-3e4597094f26');
delete from reautenticaciones where perfil_id = '696d9431-5c4d-4043-aee4-3e4597094f26';

set local role authenticated;
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');

-- ============================================================ 1) sin contraseña no se borra nada
insert into resultado (prueba, esperado, resultado)
select '1a eliminar VISITA sin confirmar la contraseña', 'contiene: confirma con tu contraseña', pg_temp.intentar($q$
  select fn_eliminar_visita('00000000-0000-0000-0000-00000000a621', 'Prueba')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b eliminar TAREA sin confirmar la contraseña', 'contiene: confirma con tu contraseña', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c621', 'Prueba')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c el usuario NO puede registrarse la confirmación solo', 'contiene: permission denied', pg_temp.intentar($q$
  select fn_reautenticacion_registrar('696d9431-5c4d-4043-aee4-3e4597094f26', true)$q$);
insert into resultado (prueba, esperado, resultado)
select '1d … ni leer la tabla de confirmaciones', 'contiene: permission denied', pg_temp.intentar($q$
  select count(*) from reautenticaciones$q$);

-- ============================================================ 2) con la confirmación (la registra el servidor)
reset role;
select fn_reautenticacion_registrar('696d9431-5c4d-4043-aee4-3e4597094f26', true);
set local role authenticated;
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a visita con FIRMA DEL CLIENTE: no se elimina', 'contiene: firma del cliente', pg_temp.intentar($q$
  select fn_eliminar_visita('00000000-0000-0000-0000-00000000a622', 'Prueba')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b visita con una TAREA: no se elimina', 'contiene: tarea(s)', pg_temp.intentar($q$
  select fn_eliminar_visita('00000000-0000-0000-0000-00000000a623', 'Prueba')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c visita sin motivo', 'contiene: Escribe por qué', pg_temp.intentar($q$
  select fn_eliminar_visita('00000000-0000-0000-0000-00000000a621', ' ')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d ELIMINAR la visita de prueba: devuelve las rutas de sus 2 archivos', '2', pg_temp.valor($q$
  select array_length(fn_eliminar_visita('00000000-0000-0000-0000-00000000a621', 'Visita de prueba'), 1)::text$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '2e no quedó nada de la visita (visita, jornada, foto, firma, sugerencia, nota)', '0', pg_temp.valor($q$
  select ((select count(*) from visitas where id = '00000000-0000-0000-0000-00000000a621')
        + (select count(*) from visita_jornadas where visita_id = '00000000-0000-0000-0000-00000000a621')
        + (select count(*) from visita_fotos where visita_id = '00000000-0000-0000-0000-00000000a621')
        + (select count(*) from visita_firmas where visita_id = '00000000-0000-0000-0000-00000000a621')
        + (select count(*) from visita_sugerencias where visita_id = '00000000-0000-0000-0000-00000000a621')
        + (select count(*) from visita_notas_posteriores where visita_id = '00000000-0000-0000-0000-00000000a621'))::text$q$);
insert into resultado (prueba, esperado, resultado)
select '2f quedó el rastro de la visita (quién, motivo, conteos)', 'true', pg_temp.valor($q$
  select (tipo = 'visita' and titulo = '__visita A prueba 62__' and motivo = 'Visita de prueba'
          and eliminado_por = '696d9431-5c4d-4043-aee4-3e4597094f26'
          and (detalle ->> 'fotos')::int = 1 and (detalle ->> 'archivos')::int = 2)::text
  from elementos_eliminados where elemento_id = '00000000-0000-0000-0000-00000000a621'$q$);
set local role authenticated;
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2g ELIMINAR la tarea recién creada', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c621', 'Creada por error')$q$);
insert into resultado (prueba, esperado, resultado)
select '2h … y ahora la visita C (ya sin tareas) se elimina', '0', pg_temp.valor($q$
  select coalesce(array_length(fn_eliminar_visita('00000000-0000-0000-0000-00000000a623', 'Visita de prueba'), 1), 0)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '2i el rastro tiene las tres (2 visitas, 1 tarea)', '2 visita · 1 tarea', pg_temp.valor($q$
  select count(*) filter (where tipo = 'visita') || ' visita · ' || count(*) filter (where tipo = 'tarea') || ' tarea'
  from elementos_eliminados where elemento_id::text like '00000000-0000-0000-0000-00000000_62%'$q$);

-- ============================================================ 3) gastar la confirmación (una contraseña, un borrado)
reset role;
select fn_reautenticacion_consumir('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into tareas (id, titulo, visibilidad, visita_id, creada_por)
values ('00000000-0000-0000-0000-00000000c622', '__tarea 2 prueba 62__', 'equipo', '00000000-0000-0000-0000-00000000a622',
        '696d9431-5c4d-4043-aee4-3e4597094f26');
set local role authenticated;
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3a confirmación gastada: el siguiente borrado pide la contraseña otra vez', 'contiene: confirma con tu contraseña', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c622', 'Prueba')$q$);

-- ============================================================ 4) intentos fallidos
reset role;
select fn_reautenticacion_registrar('696d9431-5c4d-4043-aee4-3e4597094f26', false) from generate_series(1, 4);
insert into resultado (prueba, esperado, resultado)
select '4a 4 contraseñas mal: todavía no se bloquea', '(vacío)', pg_temp.valor($q$
  select fn_reautenticacion_bloqueada_hasta('696d9431-5c4d-4043-aee4-3e4597094f26')::text$q$);
select fn_reautenticacion_registrar('696d9431-5c4d-4043-aee4-3e4597094f26', false);
insert into resultado (prueba, esperado, resultado)
select '4b la 5ª seguida: bloqueada ~15 minutos', 'true', pg_temp.valor($q$
  select (fn_reautenticacion_bloqueada_hasta('696d9431-5c4d-4043-aee4-3e4597094f26')
          between now() + interval '14 minutes' and now() + interval '16 minutes')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '4c un fallo borra cualquier confirmación previa', 'false', pg_temp.valor($q$
  select (verificada_en is not null)::text from reautenticaciones where perfil_id = '696d9431-5c4d-4043-aee4-3e4597094f26'$q$);

-- ============================================================ 5) quién y el rastro
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000ee');
insert into resultado (prueba, esperado, resultado)
select '5a el TÉCNICO intenta eliminar', 'contiene: requiere permiso de Operativo', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c622', 'No')$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '5b EDITAR el rastro', 'contiene: permission denied', pg_temp.intentar($q$
  update elementos_eliminados set motivo = 'otro' where elemento_id = '00000000-0000-0000-0000-00000000a621'$q$);
insert into resultado (prueba, esperado, resultado)
select '5c BORRAR el rastro', 'contiene: permission denied', pg_temp.intentar($q$
  delete from elementos_eliminados where elemento_id = '00000000-0000-0000-0000-00000000a621'$q$);

-- ============================================================ 6) privilegios
reset role;
insert into resultado (prueba, esperado, resultado)
select '6a la tabla vieja tareas_eliminadas ya no existe', 'true', (to_regclass('public.tareas_eliminadas') is null)::text;
insert into resultado (prueba, esperado, resultado)
select '6b registrar / bloqueada / consumir: solo el servidor (ni anon ni authenticated)', 'false',
  (has_function_privilege('authenticated', 'public.fn_reautenticacion_registrar(uuid, boolean)', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.fn_reautenticacion_bloqueada_hasta(uuid)', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.fn_reautenticacion_consumir(uuid)', 'EXECUTE')
   or has_function_privilege('anon', 'public.fn_reautenticacion_registrar(uuid, boolean)', 'EXECUTE'))::text;
insert into resultado (prueba, esperado, resultado)
select '6c funciones del módulo ejecutables por anon', '0',
  coalesce(nullif(string_agg(p.proname::text, ', ' order by p.proname), ''), '0')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in (
  'fn_puede_ver_visita', 'fn_puede_escribir_visita', 'fn_visita_firmada', 'fn_visita_de_ruta',
  'fn_contenido_evidencia', 'fn_cambiar_estado_sugerencia', 'fn_tecnicos_asignables',
  'fn_candado_visita', 'fn_candado_visita_insert', 'fn_firma_antes', 'fn_firma_despues',
  'fn_sugerencia_creada', 'fn_sugerencias_estado_protegido', 'fn_visitas_solo_estado_tecnico',
  'fn_es_asignado_tarea', 'fn_puede_ver_tarea', 'fn_puede_editar_tarea', 'fn_tarea_tiene_asignados',
  'fn_nombre_actor', 'fn_etiqueta_estado_tarea', 'fn_bloqueo_tarea', 'fn_nota_tarea',
  'fn_proyectos_para_tareas', 'fn_personas_asignables', 'fn_tareas_reglas', 'fn_tareas_historial',
  'fn_tarea_hijos_historial', 'fn_tarea_asignados_reglas', 'fn_tarea_dependencias_sin_ciclos',
  'fn_subtarea_quien_y_cuando', 'fn_es_miembro_grupo', 'fn_persona_tiene_permiso',
  'fn_es_participante_tarea', 'fn_tarea_tiene_participantes', 'fn_tarea_participantes_reglas',
  'fn_tarea_participantes_historial', 'fn_grupo_miembros_reglas', 'fn_grupos_historial',
  'fn_grupos_archivo', 'fn_transferir_tareas', 'fn_personas_planificacion',
  'fn_puede_editar_contenido_tarea', 'fn_validar_responsable_subtarea', 'fn_subtareas_reglas',
  'fn_es_salida_tras_firma', 'fn_marcar_visita_vista', 'fn_marcar_tarea_vista', 'fn_visita_reasignada',
  'fn_visita_cierre', 'fn_eliminar_tarea', 'fn_eliminar_visita', 'fn_elementos_eliminados_intocable',
  'fn_reautenticacion_registrar', 'fn_reautenticacion_bloqueada_hasta', 'fn_reautenticacion_consumir',
  'fn_reautenticado_reciente')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- ============================================================ limpieza (admin)
delete from elementos_eliminados where elemento_id::text like '00000000-0000-0000-0000-00000000_62%';
delete from reautenticaciones where perfil_id = '696d9431-5c4d-4043-aee4-3e4597094f26';
delete from tarea_asignados where tarea_id::text like '00000000-0000-0000-0000-00000000c62%';
delete from tarea_eventos where tarea_id::text like '00000000-0000-0000-0000-00000000c62%';
delete from tareas where id::text like '00000000-0000-0000-0000-00000000c62%';
delete from visita_firmas where visita_id::text like '00000000-0000-0000-0000-00000000a62%';
delete from visitas where id::text like '00000000-0000-0000-0000-00000000a62%';
delete from perfiles where id = '00000000-0000-0000-0000-0000000000ee';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000ee';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

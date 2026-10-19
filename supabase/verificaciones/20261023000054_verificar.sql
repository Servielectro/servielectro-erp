-- Verificación de la migración 54 (privilegios de funciones y responsable de subtarea).
-- Correr DESPUÉS de la migración, todo junto. Crea un COORDINADOR que hace de "contadora"
-- y un TÉCNICO de prueba, y tareas; BORRA todo antes de mostrar el resultado.
--
-- Prueba:
--   - CERO funciones de los módulos Técnico y Planificación ejecutables por anon (si una
--     migración futura olvida el revoke de PUBLIC, este caso se cae);
--   - fn_persona_tiene_permiso no la ejecuta ni authenticated;
--   - las escrituras normales siguen funcionando con los triggers (crear tarea, compartir,
--     subtareas): el cierre de privilegios no rompió nada;
--   - responsable de subtarea: solo quien creó la tarea lo elige, el responsable tiene que
--     ver la tarea, los demás solo marcan, y el cambio queda en el historial.
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

-- ============================================================ 1) privilegios de las funciones
-- Todas las funciones de los módulos (migraciones 45 a 54), por nombre.
create temporary table funciones_modulo on commit drop as
select p.oid, p.proname::text as nombre
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
  'fn_puede_editar_contenido_tarea', 'fn_validar_responsable_subtarea', 'fn_subtareas_reglas');

insert into resultado (prueba, esperado, resultado)
select '1a funciones del módulo encontradas', '44', count(*)::text from funciones_modulo;
insert into resultado (prueba, esperado, resultado)
select '1b funciones del módulo ejecutables por anon', '0',
  coalesce(nullif(string_agg(nombre, ', ' order by nombre), ''), '0')
from funciones_modulo where has_function_privilege('anon', oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '1c fn_persona_tiene_permiso NO la ejecuta authenticated', 'false',
  has_function_privilege('authenticated', 'public.fn_persona_tiene_permiso(uuid, text, nivel_permiso)', 'EXECUTE')::text;
insert into resultado (prueba, esperado, resultado)
select '1d las de las políticas sí las ejecuta authenticated', 'true',
  (has_function_privilege('authenticated', 'public.fn_puede_ver_tarea(uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.fn_es_participante_tarea(uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.fn_puede_ver_visita(uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.fn_visita_de_ruta(text)', 'EXECUTE'))::text;
insert into resultado (prueba, esperado, resultado)
select '1e … y service_role (traslado de fotos a Drive)', 'true',
  (has_function_privilege('service_role', 'public.fn_visita_firmada(uuid)', 'EXECUTE')
   and has_function_privilege('service_role', 'public.fn_contenido_evidencia(text, jsonb)', 'EXECUTE'))::text;

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'c2.prueba.54@invalid.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 't.prueba.54@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select x.id::uuid, r.id, x.nombre
from (values ('00000000-0000-0000-0000-0000000000e2', 'Coordinador', '__Contadora prueba 54__'),
             ('00000000-0000-0000-0000-0000000000e3', 'Técnicos', '__Técnico prueba 54__')) as x(id, rol, nombre)
join roles r on r.nombre = x.rol
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre;
insert into visitas (id, titulo, tipo, fecha_programada)
values ('00000000-0000-0000-0000-00000000a541', '__obra prueba 54__', 'obra', current_date);

set local role authenticated;

-- ============================================================ 2) escrituras normales (los triggers siguen andando)
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a Jhojan crea una compartida (dispara reglas e historial)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values ('00000000-0000-0000-0000-0000000006d1', 'Revisar factura 456', 'compartida')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b se la comparte a la contadora', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_participantes (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000006d1', '00000000-0000-0000-0000-0000000000e2')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c crea una de obra y la asigna al técnico', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad, visita_id) values ('00000000-0000-0000-0000-0000000006d2', 'Pasar cable', 'equipo', '00000000-0000-0000-0000-00000000a541')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d (asignación)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_asignados (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000006d2', '00000000-0000-0000-0000-0000000000e3')$q$);

-- ============================================================ 3) responsable de subtarea
insert into resultado (prueba, esperado, resultado)
select '3a subtarea "Sin asignar" (responsable nulo)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_subtareas (id, tarea_id, titulo) values ('00000000-0000-0000-0000-0000000006e1', '00000000-0000-0000-0000-0000000006d1', 'Pedir soporte al proveedor')$q$);
insert into resultado (prueba, esperado, resultado)
select '3b subtarea con la contadora de responsable (participa)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_subtareas (id, tarea_id, titulo, responsable_id) values ('00000000-0000-0000-0000-0000000006e2', '00000000-0000-0000-0000-0000000006d1', 'Revisar el NIT', '00000000-0000-0000-0000-0000000000e2')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c responsable que no ve la tarea (el técnico)', 'contiene: Esa persona no ve esta tarea', pg_temp.intentar($q$
  update tarea_subtareas set responsable_id = '00000000-0000-0000-0000-0000000000e3' where id = '00000000-0000-0000-0000-0000000006e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d en la de obra, el técnico asignado SÍ puede ser responsable', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_subtareas (id, tarea_id, titulo, responsable_id) values ('00000000-0000-0000-0000-0000000006e3', '00000000-0000-0000-0000-0000000006d2', 'Medir el tramo', '00000000-0000-0000-0000-0000000000e3')$q$);
insert into resultado (prueba, esperado, resultado)
select '3e cambio de responsable (a "Sin asignar")', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tarea_subtareas set responsable_id = null where id = '00000000-0000-0000-0000-0000000006e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f el historial registró el cambio de responsable', '1', pg_temp.valor($q$
  select count(*) from tarea_eventos where tarea_id = '00000000-0000-0000-0000-0000000006d1'
    and tipo = 'subtarea' and detalle->>'accion' = 'responsable'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '3g la contadora (participante) marca la subtarea hecha', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tarea_subtareas set hecha = true where id = '00000000-0000-0000-0000-0000000006e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3h la contadora NO elige responsables', 'contiene: Solo puedes marcar la subtarea', pg_temp.intentar($q$
  update tarea_subtareas set responsable_id = '00000000-0000-0000-0000-0000000000e2' where id = '00000000-0000-0000-0000-0000000006e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3i la contadora NO renombra', 'contiene: Solo puedes marcar la subtarea', pg_temp.intentar($q$
  update tarea_subtareas set titulo = 'otro' where id = '00000000-0000-0000-0000-0000000006e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3j la contadora NO agrega subtareas', 'contiene: Solo quien creó la tarea agrega o quita', pg_temp.intentar($q$
  insert into tarea_subtareas (tarea_id, titulo) values ('00000000-0000-0000-0000-0000000006d1', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '3k la contadora NO quita subtareas', 'contiene: Solo quien creó la tarea agrega o quita', pg_temp.intentar($q$
  delete from tarea_subtareas where id = '00000000-0000-0000-0000-0000000006e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3l la validación no sirve para curiosear tareas ajenas', 'contiene: Solo quien creó la tarea elige', pg_temp.intentar($q$
  select fn_validar_responsable_subtarea('00000000-0000-0000-0000-0000000006d1', '00000000-0000-0000-0000-0000000000e3')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
insert into resultado (prueba, esperado, resultado)
select '3m el técnico asignado marca su subtarea', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tarea_subtareas set hecha = true where id = '00000000-0000-0000-0000-0000000006e3'$q$);
insert into resultado (prueba, esperado, resultado)
select '3n el técnico NO renombra la subtarea', 'contiene: Solo puedes marcar la subtarea', pg_temp.intentar($q$
  update tarea_subtareas set titulo = 'otro' where id = '00000000-0000-0000-0000-0000000006e3'$q$);
insert into resultado (prueba, esperado, resultado)
select '3o quién la marcó y cuándo (migración 51)', 'true', pg_temp.valor($q$
  select (hecha_por = '00000000-0000-0000-0000-0000000000e3' and hecha_en is not null)::text
  from tarea_subtareas where id = '00000000-0000-0000-0000-0000000006e3'$q$);

-- ============================================================ limpieza (admin)
reset role;
delete from tarea_subtareas where tarea_id::text like '00000000-0000-0000-0000-0000000006d%';
delete from tarea_participantes where tarea_id::text like '00000000-0000-0000-0000-0000000006d%';
delete from tarea_asignados where tarea_id::text like '00000000-0000-0000-0000-0000000006d%';
delete from tarea_eventos where tarea_id::text like '00000000-0000-0000-0000-0000000006d%';
delete from tareas where id::text like '00000000-0000-0000-0000-0000000006d%';
delete from visitas where id = '00000000-0000-0000-0000-00000000a541';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

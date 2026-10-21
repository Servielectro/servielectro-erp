-- Verificación de la migración 60 ("Dar por terminada"). Correr DESPUÉS de la migración, todo
-- junto. Crea un TÉCNICO de prueba, dos obras y una visita de un día, con la sesión de cada uno
-- (RLS y triggers reales), y BORRA todo antes de mostrar el resultado.
-- Resultado esperado: todas las filas en "OK". Los rechazos tienen que ser por la regla que se
-- prueba ("contiene: …"), no por otra.

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
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000ec', 'authenticated', 'authenticated', 'tecnico.prueba.60@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre, cedula)
select '00000000-0000-0000-0000-0000000000ec', r.id, '__Técnico prueba 60__', '1000000060'
from roles r where r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
-- Obra 1 (se da por terminada), obra 2 (sigue en curso), visita de un día (en curso) y una
-- visita de un día que se firma y se cierra por el camino de siempre.
insert into visitas (id, titulo, tipo, estado, tecnico_id, fecha_programada) values
  ('00000000-0000-0000-0000-00000000a601', '__obra 1 prueba 60__', 'obra', 'en_curso', '00000000-0000-0000-0000-0000000000ec', current_date),
  ('00000000-0000-0000-0000-00000000a602', '__obra 2 prueba 60__', 'obra', 'en_curso', '00000000-0000-0000-0000-0000000000ec', current_date),
  ('00000000-0000-0000-0000-00000000a603', '__visita prueba 60__', 'visita', 'en_curso', '00000000-0000-0000-0000-0000000000ec', current_date),
  ('00000000-0000-0000-0000-00000000a604', '__visita firmada prueba 60__', 'visita', 'en_curso', '00000000-0000-0000-0000-0000000000ec', current_date);

set local role authenticated;

-- ============================================================ 1) quién puede cerrar y qué
select pg_temp.como('00000000-0000-0000-0000-0000000000ec');
insert into resultado (prueba, esperado, resultado)
select '1a el TÉCNICO da por terminada su obra', 'contiene: requiere permiso de Operativo', pg_temp.intentar($q$
  update visitas set estado = 'cerrada' where id = '00000000-0000-0000-0000-00000000a601'$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '1b Operativo da por terminada una visita de UN DÍA sin firma', 'contiene: se cierra con la firma del cliente', pg_temp.intentar($q$
  update visitas set estado = 'cerrada' where id = '00000000-0000-0000-0000-00000000a603'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c Operativo da por terminada la OBRA en curso, con nota', 'aceptado (1 filas)', pg_temp.intentar($q$
  update visitas set estado = 'cerrada', cierre_nota = 'Entregada con la visita del día'
  where id = '00000000-0000-0000-0000-00000000a601'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d quedó quién, cuándo y la nota', 'true', pg_temp.valor($q$
  select (cerrada_por = '696d9431-5c4d-4043-aee4-3e4597094f26' and cerrada_en > now() - interval '1 hour'
          and cierre_nota = 'Entregada con la visita del día')::text
  from visitas where id = '00000000-0000-0000-0000-00000000a601'$q$);

-- ============================================================ 2) cerrada es final
insert into resultado (prueba, esperado, resultado)
select '2a reabrir la obra cerrada', 'contiene: cerrada es final', pg_temp.intentar($q$
  update visitas set estado = 'en_curso' where id = '00000000-0000-0000-0000-00000000a601'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b cambiar quién la cerró', 'contiene: no se cambia', pg_temp.intentar($q$
  update visitas set cerrada_por = null where id = '00000000-0000-0000-0000-00000000a601'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c cambiar la nota después', 'contiene: no se cambia', pg_temp.intentar($q$
  update visitas set cierre_nota = 'otra' where id = '00000000-0000-0000-0000-00000000a601'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d poner quién/cuándo a mano en una visita abierta', 'contiene: no se cambia', pg_temp.intentar($q$
  update visitas set cerrada_en = now() where id = '00000000-0000-0000-0000-00000000a602'$q$);

-- ============================================================ 3) el técnico no escribe en una obra cerrada
select pg_temp.como('00000000-0000-0000-0000-0000000000ec');
insert into resultado (prueba, esperado, resultado)
select '3a jornada NUEVA en la obra cerrada', 'contiene: row-level security', pg_temp.intentar($q$
  insert into visita_jornadas (visita_id, fecha, check_in_en, check_in_gps_estado)
  values ('00000000-0000-0000-0000-00000000a601', current_date, now(), 'sin_senal')$q$);
insert into resultado (prueba, esperado, resultado)
select '3b jornada en la obra que SIGUE en curso (no se rompió nada)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_jornadas (visita_id, fecha, check_in_en, check_in_gps_estado)
  values ('00000000-0000-0000-0000-00000000a602', current_date, now(), 'sin_senal')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c el técnico sigue VIENDO la obra cerrada', '1', pg_temp.valor($q$
  select count(*)::text from visitas where id = '00000000-0000-0000-0000-00000000a601'$q$);

-- ============================================================ 4) el camino de siempre: firmada → cerrada
insert into resultado (prueba, esperado, resultado)
select '4a firma del técnico', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a604', 'tecnico', '__Técnico prueba 60__', '1000000060', 'x/t.png')$q$);
insert into resultado (prueba, esperado, resultado)
select '4b firma del cliente (la pasa a firmada)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, cargo, imagen_path)
  values ('00000000-0000-0000-0000-00000000a604', 'cliente', 'Cliente', '79000000', 'Administrador', 'x/c.png')$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '4c Operativo cierra la visita FIRMADA (el candado deja pasar quién/cuándo)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update visitas set estado = 'cerrada' where id = '00000000-0000-0000-0000-00000000a604'$q$);
insert into resultado (prueba, esperado, resultado)
select '4d quedó quién y cuándo', 'true', pg_temp.valor($q$
  select (cerrada_por = '696d9431-5c4d-4043-aee4-3e4597094f26' and cerrada_en is not null)::text
  from visitas where id = '00000000-0000-0000-0000-00000000a604'$q$);
insert into resultado (prueba, esperado, resultado)
select '4e el candado sigue: no se edita el título de la firmada/cerrada', 'contiene: firmada por el cliente', pg_temp.intentar($q$
  update visitas set titulo = 'otro' where id = '00000000-0000-0000-0000-00000000a604'$q$);

-- ============================================================ 5) privilegios
reset role;
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
  'fn_puede_editar_contenido_tarea', 'fn_validar_responsable_subtarea', 'fn_subtareas_reglas',
  'fn_es_salida_tras_firma', 'fn_marcar_visita_vista', 'fn_marcar_tarea_vista', 'fn_visita_reasignada',
  -- 60
  'fn_visita_cierre');
insert into resultado (prueba, esperado, resultado)
select '5a funciones del módulo encontradas', '49', count(*)::text from funciones_modulo;
insert into resultado (prueba, esperado, resultado)
select '5b funciones del módulo ejecutables por anon', '0',
  coalesce(nullif(string_agg(nombre, ', ' order by nombre), ''), '0')
from funciones_modulo where has_function_privilege('anon', oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '5c fn_visita_cierre (trigger) NO la ejecuta authenticated', 'false',
  has_function_privilege('authenticated', 'public.fn_visita_cierre()', 'EXECUTE')::text;

-- ============================================================ limpieza (admin)
delete from visita_firmas where visita_id::text like '00000000-0000-0000-0000-00000000a60%';
delete from visita_jornadas where visita_id::text like '00000000-0000-0000-0000-00000000a60%';
delete from visitas where id::text like '00000000-0000-0000-0000-00000000a60%';
delete from perfiles where id = '00000000-0000-0000-0000-0000000000ec';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000ec';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

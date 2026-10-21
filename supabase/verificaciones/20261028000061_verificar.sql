-- Verificación de la migración 61 (eliminar tareas sin trabajo, con rastro). Correr DESPUÉS de
-- la migración, todo junto. Crea un TÉCNICO de prueba, una visita y tareas, con la sesión de cada
-- uno (RLS y triggers reales), y BORRA todo antes de mostrar el resultado. No usa los datos de
-- prueba de Jhojan.
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

-- Crea una tarea de obra en la visita de prueba, asignada al técnico (como Jhojan).
create or replace function pg_temp.tarea(p_id text, p_titulo text)
returns text language sql as $f$
  select format($q$
    with t as (insert into tareas (id, titulo, visibilidad, visita_id)
               values (%L, %L, 'equipo', '00000000-0000-0000-0000-00000000a611') returning id)
    insert into tarea_asignados (tarea_id, perfil_id) select id, '00000000-0000-0000-0000-0000000000ed' from t$q$, p_id, p_titulo)
$f$;

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000ed', 'authenticated', 'authenticated', 'tecnico.prueba.61@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000000ed', r.id, '__Técnico prueba 61__'
from roles r where r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre;
insert into visitas (id, titulo, tipo, tecnico_id, fecha_programada)
values ('00000000-0000-0000-0000-00000000a611', '__visita prueba 61__', 'visita', '00000000-0000-0000-0000-0000000000ed', current_date);

set local role authenticated;
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');

-- ============================================================ 1) recién creada: se elimina y queda el rastro
insert into resultado (prueba, esperado, resultado)
select '1a crear tarea asignada al técnico', 'aceptado (1 filas)', pg_temp.intentar(pg_temp.tarea('00000000-0000-0000-0000-00000000c611', '__mal asignada 61__'));
insert into resultado (prueba, esperado, resultado)
select '1b ELIMINAR la recién creada', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c611', 'Creada por error')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c la tarea ya no existe', '0', pg_temp.valor($q$
  select count(*)::text from tareas where id = '00000000-0000-0000-0000-00000000c611'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d quedó el rastro (título, asignado, quién, motivo)', 'true', pg_temp.valor($q$
  select (titulo = '__mal asignada 61__' and motivo = 'Creada por error'
          and eliminada_por = '696d9431-5c4d-4043-aee4-3e4597094f26' and eliminada_en is not null
          and asignados -> 0 ->> 'nombre' = '__Técnico prueba 61__' and creada_en is not null)::text
  from tareas_eliminadas where tarea_id = '00000000-0000-0000-0000-00000000c611'$q$);

-- ============================================================ 2) con trabajo: no se elimina
select pg_temp.intentar(pg_temp.tarea('00000000-0000-0000-0000-00000000c612', '__en progreso 61__'));
select pg_temp.intentar($q$update tareas set estado = 'en_progreso' where id = '00000000-0000-0000-0000-00000000c612'$q$);
insert into resultado (prueba, esperado, resultado)
select '2a ELIMINAR una que pasó a "En progreso"', 'contiene: Archívala', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c612', 'Ya no va')$q$);
select pg_temp.intentar($q$update tareas set estado = 'por_hacer' where id = '00000000-0000-0000-0000-00000000c612'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b … aunque haya vuelto a "Por hacer"', 'contiene: ya se movió de "Por hacer"', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c612', 'Ya no va')$q$);

select pg_temp.intentar(pg_temp.tarea('00000000-0000-0000-0000-00000000c613', '__con subtarea 61__'));
select pg_temp.intentar($q$insert into tarea_subtareas (id, tarea_id, titulo)
  values ('00000000-0000-0000-0000-00000000d613', '00000000-0000-0000-0000-00000000c613', 'Medir')$q$);
select pg_temp.intentar($q$update tarea_subtareas set hecha = true where id = '00000000-0000-0000-0000-00000000d613'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c ELIMINAR una con una subtarea marcada', 'contiene: subtareas marcadas', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c613', 'Ya no va')$q$);

select pg_temp.intentar(pg_temp.tarea('00000000-0000-0000-0000-00000000c614', '__con nota 61__'));
select pg_temp.intentar($q$select fn_nota_tarea('00000000-0000-0000-0000-00000000c614', 'Llamé al cliente')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d ELIMINAR una con nota de seguimiento', 'contiene: notas de seguimiento', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c614', 'Ya no va')$q$);

-- Una subtarea SIN marcar no es trabajo: se elimina con la tarea.
select pg_temp.intentar(pg_temp.tarea('00000000-0000-0000-0000-00000000c615', '__subtarea sin marcar 61__'));
select pg_temp.intentar($q$insert into tarea_subtareas (tarea_id, titulo) values ('00000000-0000-0000-0000-00000000c615', 'Pendiente')$q$);
insert into resultado (prueba, esperado, resultado)
select '2e ELIMINAR una con subtarea SIN marcar (se va con ella)', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c615', 'Duplicada')$q$);
insert into resultado (prueba, esperado, resultado)
select '2f no quedó nada de ella (subtareas, eventos, asignados)', '0', pg_temp.valor($q$
  select ((select count(*) from tarea_subtareas where tarea_id = '00000000-0000-0000-0000-00000000c615')
        + (select count(*) from tarea_eventos where tarea_id = '00000000-0000-0000-0000-00000000c615')
        + (select count(*) from tarea_asignados where tarea_id = '00000000-0000-0000-0000-00000000c615'))::text$q$);

-- ============================================================ 3) quién y cómo
insert into resultado (prueba, esperado, resultado)
select '3a sin motivo', 'contiene: Escribe por qué', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c614', '   ')$q$);
select pg_temp.intentar(pg_temp.tarea('00000000-0000-0000-0000-00000000c616', '__para el técnico 61__'));
select pg_temp.como('00000000-0000-0000-0000-0000000000ed');
insert into resultado (prueba, esperado, resultado)
select '3b el TÉCNICO asignado intenta eliminarla', 'contiene: requiere permiso de Operativo', pg_temp.intentar($q$
  select fn_eliminar_tarea('00000000-0000-0000-0000-00000000c616', 'No me gusta')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c … y la tarea sigue ahí', '1', pg_temp.valor($q$
  select count(*)::text from tareas where id = '00000000-0000-0000-0000-00000000c616'$q$);

-- ============================================================ 4) el rastro no se toca
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '4a Operativo lee el rastro', 'true', pg_temp.valor($q$
  select (count(*) >= 2)::text from tareas_eliminadas
  where tarea_id in ('00000000-0000-0000-0000-00000000c611', '00000000-0000-0000-0000-00000000c615')$q$);
insert into resultado (prueba, esperado, resultado)
select '4b EDITAR el rastro', 'contiene: permission denied', pg_temp.intentar($q$
  update tareas_eliminadas set motivo = 'otro' where tarea_id = '00000000-0000-0000-0000-00000000c611'$q$);
insert into resultado (prueba, esperado, resultado)
select '4c BORRAR el rastro', 'contiene: permission denied', pg_temp.intentar($q$
  delete from tareas_eliminadas where tarea_id = '00000000-0000-0000-0000-00000000c611'$q$);
insert into resultado (prueba, esperado, resultado)
select '4d INSERTAR a mano en el rastro', 'contiene: permission denied', pg_temp.intentar($q$
  insert into tareas_eliminadas (tarea_id, titulo, eliminada_por, motivo)
  values (gen_random_uuid(), 'falsa', '696d9431-5c4d-4043-aee4-3e4597094f26', 'x')$q$);

-- ============================================================ 5) privilegios
reset role;
insert into resultado (prueba, esperado, resultado)
select '5a fn_eliminar_tarea: anon NO, authenticated SÍ', 'false · true',
  has_function_privilege('anon', 'public.fn_eliminar_tarea(uuid, text)', 'EXECUTE')::text || ' · '
  || has_function_privilege('authenticated', 'public.fn_eliminar_tarea(uuid, text)', 'EXECUTE')::text;
insert into resultado (prueba, esperado, resultado)
select '5b el trigger del rastro no lo ejecuta authenticated', 'false',
  has_function_privilege('authenticated', 'public.fn_tareas_eliminadas_intocable()', 'EXECUTE')::text;
insert into resultado (prueba, esperado, resultado)
select '5c funciones del módulo ejecutables por anon', '0',
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
  'fn_visita_cierre', 'fn_eliminar_tarea', 'fn_tareas_eliminadas_intocable')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- ============================================================ limpieza (admin)
-- Orden: hijos (sus triggers anotan eventos) → eventos → tareas.
delete from tareas_eliminadas where tarea_id::text like '00000000-0000-0000-0000-00000000c61%';
delete from tarea_subtareas where tarea_id::text like '00000000-0000-0000-0000-00000000c61%';
delete from tarea_asignados where tarea_id::text like '00000000-0000-0000-0000-00000000c61%';
delete from tarea_eventos where tarea_id::text like '00000000-0000-0000-0000-00000000c61%';
delete from tareas where id::text like '00000000-0000-0000-0000-00000000c61%';
delete from visitas where id = '00000000-0000-0000-0000-00000000a611';
delete from perfiles where id = '00000000-0000-0000-0000-0000000000ed';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000ed';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

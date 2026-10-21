-- Verificación de la migración 59 (vista, ubicación del sitio y hora programada). Correr
-- DESPUÉS de la migración, todo junto. Crea dos TÉCNICOS de prueba, una visita y una tarea de
-- obra, con la sesión de cada uno (RLS y triggers reales), y BORRA todo antes de mostrar el
-- resultado.
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

-- ============================================================ 1) columnas
insert into resultado (prueba, esperado, resultado)
select '1a columnas nuevas (10)', '10', count(*)::text
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('tarea_asignados', 'visto_en'),
    ('visitas', 'visto_en'), ('visitas', 'hora_programada'), ('visitas', 'sitio_lat'),
    ('visitas', 'sitio_lng'), ('visitas', 'sitio_url_maps'),
    ('tareas', 'sitio_direccion'), ('tareas', 'sitio_lat'), ('tareas', 'sitio_lng'), ('tareas', 'sitio_url_maps'));
insert into resultado (prueba, esperado, resultado)
select '1b las del GPS del check-in siguen iguales (10 columnas)', '10', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'visita_jornadas'
  and column_name in ('check_in_en', 'check_in_gps_estado', 'check_in_lat', 'check_in_lng', 'check_in_precision_m',
                      'check_out_en', 'check_out_gps_estado', 'check_out_lat', 'check_out_lng', 'check_out_precision_m');

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000ea', 'authenticated', 'authenticated', 't1.prueba.59@invalid.local'),
  ('00000000-0000-0000-0000-0000000000eb', 'authenticated', 'authenticated', 't2.prueba.59@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select x.id::uuid, r.id, x.nombre
from (values ('00000000-0000-0000-0000-0000000000ea', '__Técnico 1 prueba 59__'),
             ('00000000-0000-0000-0000-0000000000eb', '__Técnico 2 prueba 59__')) as x(id, nombre)
join roles r on r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre;

set local role authenticated;

-- ============================================================ 2) reglas (Jhojan, Operativo)
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a visita con dirección, hora y sitio (lat/lng + enlace)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visitas (id, titulo, tipo, tecnico_id, fecha_programada, hora_programada, direccion,
                       sitio_lat, sitio_lng, sitio_url_maps)
  values ('00000000-0000-0000-0000-00000000a591', '__prueba 59__', 'visita', '00000000-0000-0000-0000-0000000000ea',
          current_date, '11:30', 'Calle 129 # 56C-22', 4.712345, -74.056789,
          'https://www.google.com/maps/@4.712345,-74.056789,17z')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b latitud sin longitud', 'contiene: sitio_coordenadas', pg_temp.intentar($q$
  update visitas set sitio_lng = null where id = '00000000-0000-0000-0000-00000000a591'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c latitud fuera de rango (95)', 'contiene: sitio_coordenadas', pg_temp.intentar($q$
  update visitas set sitio_lat = 95 where id = '00000000-0000-0000-0000-00000000a591'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d enlace que no es https', 'contiene: sitio_url_maps', pg_temp.intentar($q$
  update visitas set sitio_url_maps = 'http://maps.example' where id = '00000000-0000-0000-0000-00000000a591'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e hora programada sin fecha', 'contiene: visitas_hora_requiere_fecha', pg_temp.intentar($q$
  update visitas set fecha_programada = null where id = '00000000-0000-0000-0000-00000000a591'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f tarea de obra con su sitio', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad, visita_id, sitio_direccion, sitio_lat, sitio_lng)
  values ('00000000-0000-0000-0000-00000000c591', '__tarea prueba 59__', 'equipo', '00000000-0000-0000-0000-00000000a591',
          'Cuarto técnico, sótano 1', 4.712300, -74.056700)$q$);
insert into resultado (prueba, esperado, resultado)
select '2g tarea con latitud sin longitud', 'contiene: tareas_sitio_coordenadas', pg_temp.intentar($q$
  update tareas set sitio_lng = null where id = '00000000-0000-0000-0000-00000000c591'$q$);
insert into resultado (prueba, esperado, resultado)
select '2h se la asigna al técnico 1', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_asignados (tarea_id, perfil_id)
  values ('00000000-0000-0000-0000-00000000c591', '00000000-0000-0000-0000-0000000000ea')$q$);

-- ============================================================ 3) el técnico NO cambia el sitio
select pg_temp.como('00000000-0000-0000-0000-0000000000ea');
insert into resultado (prueba, esperado, resultado)
select '3a el técnico cambia la ubicación del sitio de su visita', 'contiene: Solo Operativo', pg_temp.intentar($q$
  update visitas set sitio_lat = 4.0 where id = '00000000-0000-0000-0000-00000000a591'$q$);
insert into resultado (prueba, esperado, resultado)
select '3b el técnico se marca "vista" a mano (update directo)', 'contiene: Solo Operativo', pg_temp.intentar($q$
  update visitas set visto_en = now() where id = '00000000-0000-0000-0000-00000000a591'$q$);

-- ============================================================ 4) "vista" de la visita
select pg_temp.como('00000000-0000-0000-0000-0000000000eb');
insert into resultado (prueba, esperado, resultado)
select '4a OTRO técnico la marca vista (no es suya)', '(vacío)', pg_temp.valor($q$
  select fn_marcar_visita_vista('00000000-0000-0000-0000-00000000a591')::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ea');
insert into resultado (prueba, esperado, resultado)
select '4b … y quedó sin marcar', 'true', pg_temp.valor($q$
  select (visto_en is null)::text from visitas where id = '00000000-0000-0000-0000-00000000a591'$q$);
insert into resultado (prueba, esperado, resultado)
select '4c el técnico asignado la abre', 'true', pg_temp.valor($q$
  select (fn_marcar_visita_vista('00000000-0000-0000-0000-00000000a591') is not null)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '4d abrirla otra vez no cambia la primera hora', 'true', pg_temp.valor($q$
  select (fn_marcar_visita_vista('00000000-0000-0000-0000-00000000a591') = v.visto_en)::text
  from visitas v where v.id = '00000000-0000-0000-0000-00000000a591'$q$);

-- ============================================================ 5) "vista" de la tarea, sin ensuciar el historial
reset role;
create temporary table eventos_antes on commit drop as
select count(*) as n from tarea_eventos where tarea_id = '00000000-0000-0000-0000-00000000c591';
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000eb');
insert into resultado (prueba, esperado, resultado)
select '5a OTRO técnico la marca vista (no está asignado)', '(vacío)', pg_temp.valor($q$
  select fn_marcar_tarea_vista('00000000-0000-0000-0000-00000000c591')::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ea');
insert into resultado (prueba, esperado, resultado)
select '5b el técnico asignado la abre', 'true', pg_temp.valor($q$
  select (fn_marcar_tarea_vista('00000000-0000-0000-0000-00000000c591') is not null)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '5c update directo de tarea_asignados (no hay política)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update tarea_asignados set visto_en = now() - interval '1 day'
  where tarea_id = '00000000-0000-0000-0000-00000000c591'$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '5d marcar "vista" no agregó eventos al historial', '0', pg_temp.valor($q$
  select ((select count(*) from tarea_eventos where tarea_id = '00000000-0000-0000-0000-00000000c591')
          - (select n from eventos_antes))::text$q$);
insert into resultado (prueba, esperado, resultado)
select '5e la hora de "vista" es la de la función, no la del update directo', 'true', pg_temp.valor($q$
  select (visto_en > now() - interval '1 hour')::text from tarea_asignados
  where tarea_id = '00000000-0000-0000-0000-00000000c591' and perfil_id = '00000000-0000-0000-0000-0000000000ea'$q$);
set local role authenticated;

-- ============================================================ 6) reasignar la visita
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '6a Operativo la reasigna al técnico 2', 'aceptado (1 filas)', pg_temp.intentar($q$
  update visitas set tecnico_id = '00000000-0000-0000-0000-0000000000eb' where id = '00000000-0000-0000-0000-00000000a591'$q$);
insert into resultado (prueba, esperado, resultado)
select '6b el nuevo técnico todavía no la vio', 'true', pg_temp.valor($q$
  select (visto_en is null)::text from visitas where id = '00000000-0000-0000-0000-00000000a591'$q$);

-- ============================================================ 7) privilegios
reset role;
-- Todas las funciones de los módulos Técnico, Planificación y estas (migraciones 45 a 59).
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
  -- 58 y 59
  'fn_es_salida_tras_firma', 'fn_marcar_visita_vista', 'fn_marcar_tarea_vista', 'fn_visita_reasignada');
insert into resultado (prueba, esperado, resultado)
select '7a funciones del módulo encontradas', '48', count(*)::text from funciones_modulo;
insert into resultado (prueba, esperado, resultado)
select '7b funciones del módulo ejecutables por anon', '0',
  coalesce(nullif(string_agg(nombre, ', ' order by nombre), ''), '0')
from funciones_modulo where has_function_privilege('anon', oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '7c las de "vista" sí las ejecuta authenticated', 'true',
  (has_function_privilege('authenticated', 'public.fn_marcar_visita_vista(uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.fn_marcar_tarea_vista(uuid)', 'EXECUTE'))::text;
insert into resultado (prueba, esperado, resultado)
select '7d la del trigger de reasignación NO la ejecuta authenticated', 'false',
  has_function_privilege('authenticated', 'public.fn_visita_reasignada()', 'EXECUTE')::text;

-- ============================================================ limpieza (admin)
delete from tarea_eventos where tarea_id = '00000000-0000-0000-0000-00000000c591';
delete from tarea_asignados where tarea_id = '00000000-0000-0000-0000-00000000c591';
delete from tarea_eventos where tarea_id = '00000000-0000-0000-0000-00000000c591';
delete from tareas where id = '00000000-0000-0000-0000-00000000c591';
delete from visitas where id = '00000000-0000-0000-0000-00000000a591';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000eb');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000eb');

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

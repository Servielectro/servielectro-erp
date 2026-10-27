-- Verificación de la migración 86 (reuniones: aviso de grabación, audio directo, acta, aprobación,
-- compromisos → tareas, plantilla del acta). Correr DESPUÉS de la migración (y de la 85).
-- Crea usuarios, un proyecto, dos reuniones, un audio de prueba y una tarea, y BORRA todo al final.
-- Todas las filas deben decir OK.
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

-- ============================================================ personas, proyecto, una tarea (admin)
-- P = Proyectos "responsable" (aprueba). Q = Proyectos "trabajar" (graba y procesa). X = técnico, sin Proyectos.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000086a0', 'authenticated', 'authenticated', 'proy-resp.86@invalid.local'),
  ('00000000-0000-0000-0000-0000000086b0', 'authenticated', 'authenticated', 'proy-trab.86@invalid.local'),
  ('00000000-0000-0000-0000-0000000086c0', 'authenticated', 'authenticated', 'tecnico.86@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy resp 86__'), ('__Proy trab 86__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'proyectos', case r.nombre when '__Proy resp 86__' then 'responsable' else 'trabajar' end::nivel_permiso, false
from roles r where r.nombre in ('__Proy resp 86__', '__Proy trab 86__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000086a0', '__Proy resp 86__', '__P 86__'),
             ('00000000-0000-0000-0000-0000000086b0', '__Proy trab 86__', '__Q 86__'),
             ('00000000-0000-0000-0000-0000000086c0', 'Técnicos', '__X 86__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000086e0', '__PRY-86__', '__Obra prueba 86__') on conflict (id) do nothing;
insert into tareas (id, titulo, visibilidad, proyecto_id, creada_por)
values ('00000000-0000-0000-0000-0000000086d1', 'Enviar planos', 'equipo', '00000000-0000-0000-0000-0000000086e0', '00000000-0000-0000-0000-0000000086a0')
on conflict (id) do nothing;

insert into resultado (prueba, esperado, resultado)
select '0a la plantilla "Acta de reunión" quedó publicada, en Proyectos, y sus campos son válidos', 'proyectos / publicada / (sin problema)',
  pg_temp.valor($q$select ambito || ' / ' || estado || ' / ' || coalesce(fn_sst_campos_problema(campos, firmas), '(sin problema)')
                   from sst_plantillas where id = '00000000-0000-4000-8000-0000000086a1'$q$);

set local role authenticated;
-- ============================================================ 1) el aviso de grabación
select pg_temp.como('00000000-0000-0000-0000-0000000086b0');
insert into resultado (prueba, esperado, resultado)
select '1a crea la reunión (todavía sin aviso)', 'preparando / no',
  pg_temp.valor($q$with n as (insert into reuniones (id, proyecto_id, titulo) values
    ('00000000-0000-0000-0000-0000000086f1', '00000000-0000-0000-0000-0000000086e0', 'Comité de obra') returning estado, aviso_grabacion)
    select estado || ' / ' || case when aviso_grabacion then 'sí' else 'no' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1b sin aviso no recibe transcripción', 'contiene: reuniones_audio_con_aviso', pg_temp.intentar($q$
  update reuniones set transcripcion = '[00:00] HABLANTE 1: hola' where id = '00000000-0000-0000-0000-0000000086f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c el audio no sube a una reunión sin aviso', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('reuniones', '00000000-0000-0000-0000-0000000086f1/audio.webm')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d el aviso exige anotar quiénes estaban', 'contiene: Anota quiénes estaban', pg_temp.intentar($q$
  update reuniones set aviso_grabacion = true where id = '00000000-0000-0000-0000-0000000086f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e con asistentes: queda quién avisó y cuándo', 'Q / sí',
  pg_temp.valor($q$with n as (update reuniones set aviso_grabacion = true, aviso_por = '00000000-0000-0000-0000-0000000086a0',
      asistentes = '[{"nombre": "Jhojan Poveda", "parte": "servielectro"}, {"nombre": "Ana Administradora", "parte": "cliente"}]'
    where id = '00000000-0000-0000-0000-0000000086f1' returning aviso_por, aviso_en)
    select case when aviso_por = '00000000-0000-0000-0000-0000000086b0' then 'Q' else '?' end || ' / ' || case when aviso_en is not null then 'sí' else 'no' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1f el aviso no se deshace ni se cambian los asistentes', 'contiene: no se cambia', pg_temp.intentar($q$
  update reuniones set asistentes = '[{"nombre": "Otro", "parte": "cliente"}]' where id = '00000000-0000-0000-0000-0000000086f1'$q$);

-- ============================================================ 2) el audio
insert into resultado (prueba, esperado, resultado)
select '2a con aviso, el audio sube directo a Storage', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('reuniones', '00000000-0000-0000-0000-0000000086f1/audio.webm')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b se registra el audio', 'audio_subido', pg_temp.valor($q$with n as (update reuniones
  set audio_path = '00000000-0000-0000-0000-0000000086f1/audio.webm', audio_mime = 'audio/webm', audio_bytes = 1000, estado = 'audio_subido'
  where id = '00000000-0000-0000-0000-0000000086f1' returning estado) select estado from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2c el audio no se reemplaza', 'contiene: no se reemplaza', pg_temp.intentar($q$
  update reuniones set audio_path = '00000000-0000-0000-0000-0000000086f1/otro.webm' where id = '00000000-0000-0000-0000-0000000086f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d ni se sube otro archivo a la reunión', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('reuniones', '00000000-0000-0000-0000-0000000086f1/otro.webm')$q$);
insert into resultado (prueba, esperado, resultado)
select '2e la retención no se marca (el plazo no está definido)', 'contiene: La retención del audio todavía no está definida', pg_temp.intentar($q$
  update reuniones set audio_descartable_desde = '2027-01-01' where id = '00000000-0000-0000-0000-0000000086f1'$q$);

-- ============================================================ 3) el acta
insert into resultado (prueba, esperado, resultado)
select '3a se guarda la transcripción y el acta (la redactada y la de revisión)', 'lista',
  pg_temp.valor($q$with n as (update reuniones set transcripcion = '[00:00] JHOJAN: Ana, nos envía los planos el viernes.',
      acta = '{"titulo": "Comité de obra", "compromisos": [{"descripcion": "Enviar planos", "parte": "cliente", "responsable": "Ana", "fecha_limite": null}]}',
      acta_revisada = '{"titulo": "Comité de obra", "compromisos": [{"descripcion": "Enviar planos", "parte": "cliente", "responsable": "Ana", "fecha_limite": null}]}',
      estado = 'lista'
    where id = '00000000-0000-0000-0000-0000000086f1' returning estado) select estado from n$q$);
insert into resultado (prueba, esperado, resultado)
select '3b quien graba no aprueba', 'contiene: Aprobar el acta lo hace el responsable de Proyectos', pg_temp.intentar($q$
  update reuniones set estado = 'aprobada' where id = '00000000-0000-0000-0000-0000000086f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c antes de aprobar, el compromiso no se vuelve tarea', 'contiene: cuando el acta está aprobada', pg_temp.intentar($q$
  insert into reunion_tareas (reunion_id, indice, tarea_id) values ('00000000-0000-0000-0000-0000000086f1', 0, '00000000-0000-0000-0000-0000000086d1')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000086a0');
insert into resultado (prueba, esperado, resultado)
select '3d el responsable aprueba (queda quién)', 'aprobada / P',
  pg_temp.valor($q$with n as (update reuniones set estado = 'aprobada' where id = '00000000-0000-0000-0000-0000000086f1' returning estado, aprobada_por)
    select estado || ' / ' || case when aprobada_por = '00000000-0000-0000-0000-0000000086a0' then 'P' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '3e aprobada, el acta no se edita', 'contiene: ya está aprobada', pg_temp.intentar($q$
  update reuniones set acta_revisada = '{"titulo": "Otro"}' where id = '00000000-0000-0000-0000-0000000086f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f un compromiso que no existe no se vuelve tarea', 'contiene: cuando el acta está aprobada', pg_temp.intentar($q$
  insert into reunion_tareas (reunion_id, indice, tarea_id) values ('00000000-0000-0000-0000-0000000086f1', 5, '00000000-0000-0000-0000-0000000086d1')$q$);
insert into resultado (prueba, esperado, resultado)
select '3g el compromiso 0 se vuelve tarea, una sola vez', 'aceptado (1 filas) / RECHAZADO',
  pg_temp.intentar($q$insert into reunion_tareas (reunion_id, indice, tarea_id) values ('00000000-0000-0000-0000-0000000086f1', 0, '00000000-0000-0000-0000-0000000086d1')$q$)
  || ' / ' || split_part(pg_temp.intentar($q$insert into reunion_tareas (reunion_id, indice, tarea_id) values ('00000000-0000-0000-0000-0000000086f1', 0, '00000000-0000-0000-0000-0000000086d1')$q$), ' ', 1);
insert into resultado (prueba, esperado, resultado)
select '3h el acta aprobada pasa al motor de plantillas para firmar (un solo documento)', 'aceptado (1 filas) / aceptado (1 filas) / RECHAZADO',
  pg_temp.intentar($q$insert into sst_formatos (id, plantilla_id, proyecto_id, respuestas) values
    ('00000000-0000-0000-0000-0000000086f9', '00000000-0000-4000-8000-0000000086a1', '00000000-0000-0000-0000-0000000086e0', '{"titulo": "Comité de obra"}')$q$)
  || ' / ' || pg_temp.intentar($q$update reuniones set formato_id = '00000000-0000-0000-0000-0000000086f9' where id = '00000000-0000-0000-0000-0000000086f1'$q$)
  || ' / ' || split_part(pg_temp.intentar($q$update reuniones set formato_id = null where id = '00000000-0000-0000-0000-0000000086f1'$q$), ' ', 1);
insert into resultado (prueba, esperado, resultado)
select '3i una reunión no se borra', 'aceptado (0 filas)', pg_temp.intentar($q$delete from reuniones where id = '00000000-0000-0000-0000-0000000086f1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000086b0');
insert into reuniones (id, proyecto_id, titulo) values ('00000000-0000-0000-0000-0000000086f2', '00000000-0000-0000-0000-0000000086e0', 'Otra');
insert into resultado (prueba, esperado, resultado)
select '3j anular sin motivo, no', 'contiene: Escribe por qué se anula', pg_temp.intentar($q$
  update reuniones set estado = 'anulada' where id = '00000000-0000-0000-0000-0000000086f2'$q$);

-- ============================================================ 4) quien no tiene Proyectos no ve nada
select pg_temp.como('00000000-0000-0000-0000-0000000086c0');
insert into resultado (prueba, esperado, resultado)
select '4a un técnico no ve reuniones, ni audios, ni compromisos', '0 / 0 / 0',
  pg_temp.valor($q$select (select count(*) from reuniones)::text || ' / ' ||
                          (select count(*) from storage.objects where bucket_id = 'reuniones')::text || ' / ' ||
                          (select count(*) from reunion_tareas)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '4b ni crea reuniones', 'contiene: row-level security', pg_temp.intentar($q$
  insert into reuniones (proyecto_id, titulo) values ('00000000-0000-0000-0000-0000000086e0', 'x')$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '4c anónimo no ve nada', 'false / false',
  pg_temp.valor($q$select has_table_privilege('anon', 'reuniones', 'select')::text || ' / ' || has_table_privilege('anon', 'reunion_tareas', 'select')::text$q$);

-- ============================================================ limpieza (admin)
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'reuniones' and name like '00000000-0000-0000-0000-0000000086f%';
delete from reunion_tareas where reunion_id::text like '00000000-0000-0000-0000-0000000086f%';
delete from reuniones where id::text like '00000000-0000-0000-0000-0000000086f%';
delete from sst_formatos where id = '00000000-0000-0000-0000-0000000086f9';
delete from tarea_eventos where tarea_id = '00000000-0000-0000-0000-0000000086d1';
delete from tareas where id = '00000000-0000-0000-0000-0000000086d1';
delete from proyectos where id = '00000000-0000-0000-0000-0000000086e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000086_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy resp 86__', '__Proy trab 86__'));
delete from roles where nombre in ('__Proy resp 86__', '__Proy trab 86__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000086_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

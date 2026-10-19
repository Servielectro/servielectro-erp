-- Verificación de la migración 55 (eventos de la Agenda). Correr DESPUÉS de la migración,
-- todo junto. Crea un COORDINADOR ("contadora"), otro COORDINADOR y un TÉCNICO de prueba, un
-- grupo y eventos; BORRA todo antes de mostrar el resultado.
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

-- Personas: Jhojan 696d…; C1 …0e1; contadora …0e2; técnico …0e3. Grupo …7a1.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'c1.prueba.55@invalid.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'c2.prueba.55@invalid.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 't.prueba.55@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select x.id::uuid, r.id, x.nombre
from (values ('00000000-0000-0000-0000-0000000000e1', 'Coordinador', '__C1 prueba 55__'),
             ('00000000-0000-0000-0000-0000000000e2', 'Coordinador', '__Contadora prueba 55__'),
             ('00000000-0000-0000-0000-0000000000e3', 'Técnicos', '__Técnico prueba 55__')) as x(id, rol, nombre)
join roles r on r.nombre = x.rol
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre;
insert into grupos (id, nombre) values ('00000000-0000-0000-0000-0000000007a1', 'Gerencia (prueba 55)');
insert into grupo_miembros (grupo_id, perfil_id) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000000e3');

set local role authenticated;

-- ============================================================ 1) crear
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '1a Jhojan crea una reunión compartida', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into eventos (id, titulo, lugar, inicio, fin, visibilidad) values
    ('00000000-0000-0000-0000-0000000007e1', 'Reunión con el contador', 'Oficina', '2026-10-24 10:00-05', '2026-10-24 11:00-05', 'compartida')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b fin antes que inicio', 'RECHAZADO', pg_temp.intentar($q$
  insert into eventos (titulo, inicio, fin) values ('x', '2026-10-24 11:00-05', '2026-10-24 10:00-05')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c día completo: la hora no se usa', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into eventos (id, titulo, inicio, fin, todo_el_dia) values
    ('00000000-0000-0000-0000-0000000007e2', 'Festivo', '2026-10-26 15:37-05', '2026-10-26 18:00-05', true)$q$);
insert into resultado (prueba, esperado, resultado)
select '1d … quedó a la medianoche de Bogotá', '2026-10-26 00:00', pg_temp.valor($q$
  select to_char(inicio at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') from eventos where id = '00000000-0000-0000-0000-0000000007e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e se comparte con la contadora y con el grupo', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into evento_participantes (evento_id, perfil_id, grupo_id) values
    ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000000e2', null),
    ('00000000-0000-0000-0000-0000000007e1', null, '00000000-0000-0000-0000-0000000007a1')$q$);
insert into resultado (prueba, esperado, resultado)
select '1f compartir con el técnico (sin Planificación)', 'contiene: no tiene Planificación', pg_temp.intentar($q$
  insert into evento_participantes (evento_id, perfil_id) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000000e3')$q$);
insert into resultado (prueba, esperado, resultado)
select '1g grupos para compartir: miembros y sin Planificación', '2/1', pg_temp.valor($q$
  select miembros || '/' || sin_planificacion from fn_grupos_para_compartir() where id = '00000000-0000-0000-0000-0000000007a1'$q$);

-- ============================================================ 2) quién ve y quién edita
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '2a la contadora ve la reunión', '1', pg_temp.valor($q$select count(*) from eventos where id = '00000000-0000-0000-0000-0000000007e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b la contadora NO la edita (filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update eventos set titulo = 'otro' where id = '00000000-0000-0000-0000-0000000007e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c la contadora NO ve el festivo (interno de Jhojan)', '0', pg_temp.valor($q$select count(*) from eventos where id = '00000000-0000-0000-0000-0000000007e2'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
insert into resultado (prueba, esperado, resultado)
select '2d el técnico, aunque es del grupo, NO la ve (sin Planificación)', '0', pg_temp.valor($q$select count(*) from eventos$q$);
insert into resultado (prueba, esperado, resultado)
select '2e el técnico NO crea eventos', 'RECHAZADO', pg_temp.intentar($q$
  insert into eventos (titulo, inicio, fin) values ('x', now(), now())$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
insert into resultado (prueba, esperado, resultado)
select '2f C1 crea su cita interna', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into eventos (id, titulo, inicio, fin) values ('00000000-0000-0000-0000-0000000007e3', 'Médico', now(), now() + interval '1 hour')$q$);
insert into resultado (prueba, esperado, resultado)
select '2g C1 NO ve la reunión de Jhojan (no participa)', '0', pg_temp.valor($q$select count(*) from eventos where id = '00000000-0000-0000-0000-0000000007e1'$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2h Jhojan (admin) NO ve la cita interna de C1', '0', pg_temp.valor($q$select count(*) from eventos where id = '00000000-0000-0000-0000-0000000007e3'$q$);

-- ============================================================ 3) quien sale del grupo deja de ver
insert into resultado (prueba, esperado, resultado)
select '3a Jhojan quita a la contadora como persona', 'aceptado (1 filas)', pg_temp.intentar($q$
  delete from evento_participantes where evento_id = '00000000-0000-0000-0000-0000000007e1' and perfil_id = '00000000-0000-0000-0000-0000000000e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3b … y la saca del grupo', 'aceptado (1 filas)', pg_temp.intentar($q$
  delete from grupo_miembros where grupo_id = '00000000-0000-0000-0000-0000000007a1' and perfil_id = '00000000-0000-0000-0000-0000000000e2'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '3c la contadora ya NO la ve', '0', pg_temp.valor($q$select count(*) from eventos where id = '00000000-0000-0000-0000-0000000007e1'$q$);

-- ============================================================ 4) archivar, historial, grupo archivado
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '4a borrar (no hay borrado)', 'aceptado (0 filas)', pg_temp.intentar($q$delete from eventos where id = '00000000-0000-0000-0000-0000000007e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4b "Eliminar" archiva', 'aceptado (1 filas)', pg_temp.intentar($q$update eventos set archivado = true where id = '00000000-0000-0000-0000-0000000007e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4c el historial registró creación, participantes y archivo', '>= 5', pg_temp.valor($q$
  select count(*) from evento_historial where evento_id in ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007e2')$q$);
insert into resultado (prueba, esperado, resultado)
select '4d el historial no se escribe a mano', 'RECHAZADO', pg_temp.intentar($q$
  insert into evento_historial (evento_id, tipo) values ('00000000-0000-0000-0000-0000000007e1', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '4e … ni se borra', 'RECHAZADO', pg_temp.intentar($q$delete from evento_historial where evento_id = '00000000-0000-0000-0000-0000000007e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4f Jhojan archiva el grupo', 'aceptado (1 filas)', pg_temp.intentar($q$
  update grupos set archivado = true where id = '00000000-0000-0000-0000-0000000007a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4g a un grupo archivado no se le comparten eventos', 'contiene: archivado', pg_temp.intentar($q$
  insert into evento_participantes (evento_id, grupo_id) values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1')$q$);

-- ============================================================ 5) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '5a funciones de eventos ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_es_participante_evento', 'fn_puede_ver_evento', 'fn_evento_tiene_participantes',
                    'fn_grupos_para_compartir', 'fn_eventos_reglas', 'fn_evento_participantes_reglas', 'fn_eventos_historial')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '5b privilegios de anon en las tablas de eventos', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon' and table_name in ('eventos', 'evento_participantes', 'evento_historial');
insert into resultado (prueba, esperado, resultado)
select '5c columnas de Google Calendar (nulas)', '2', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'eventos' and is_nullable = 'YES'
  and column_name in ('calendario_evento_id', 'calendario_sincronizado_en');

-- ============================================================ limpieza (admin)
delete from evento_participantes where evento_id::text like '00000000-0000-0000-0000-0000000007e%';
delete from evento_historial where evento_id::text like '00000000-0000-0000-0000-0000000007e%';
delete from eventos where id::text like '00000000-0000-0000-0000-0000000007e%';
delete from grupo_miembros where grupo_id = '00000000-0000-0000-0000-0000000007a1';
delete from grupo_eventos where grupo_id = '00000000-0000-0000-0000-0000000007a1';
delete from grupos where id = '00000000-0000-0000-0000-0000000007a1';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado like '>= %' and resultado ~ '^[0-9]+$' and resultado::int >= substring(esperado from 4)::int then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

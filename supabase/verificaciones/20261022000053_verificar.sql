-- Verificación de la migración 53 (compartir tareas, grupos y transferir). Correr DESPUÉS
-- de la 52 y la 53, todo junto. Crea dos COORDINADORES (C1, y C2 que hace de "contadora")
-- y un TÉCNICO de prueba, un grupo y tareas; BORRA todo antes de mostrar el resultado.
--
-- Prueba: compartir con personas y grupos como un calendario; solo con quien tiene
-- Planificación; visibilidad calculada con los miembros ACTUALES (quien sale deja de ver);
-- grupo archivado sin miembros ni tareas nuevas; los participantes solo mueven y comentan;
-- el historial de grupos intocable; transferir solo Configuración, con rastro, sin dar
-- vista de lo ajeno; y ni el administrador ve una compartida en la que no participa.
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

-- Personas: Jhojan 696d…; C1 …0e1; C2 (contadora) …0e2; técnico …0e3
-- Tareas: d1 "Revisar factura 123" (Jhojan, compartida) · d2 agenda de C2 (interna)
--         · d3 compartida de C1 con C2 · d4 interna de Jhojan · d5 compartida para el 4c
-- Grupo:  g1 "Contabilidad (prueba 53)"

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'c1.prueba.53@invalid.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'c2.prueba.53@invalid.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 't.prueba.53@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select x.id::uuid, r.id, x.nombre
from (values ('00000000-0000-0000-0000-0000000000e1', 'Coordinador', '__C1 prueba 53__'),
             ('00000000-0000-0000-0000-0000000000e2', 'Coordinador', '__Contadora prueba 53__'),
             ('00000000-0000-0000-0000-0000000000e3', 'Técnicos', '__Técnico prueba 53__')) as x(id, rol, nombre)
join roles r on r.nombre = x.rol
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre;

set local role authenticated;

-- ============================================================ 1) grupos
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
insert into resultado (prueba, esperado, resultado)
select '1a un coordinador NO crea grupos (no es Configuración)', 'RECHAZADO', pg_temp.intentar($q$
  insert into grupos (nombre) values ('Grupo del coordinador')$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '1b Jhojan (Configuración) crea el grupo', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into grupos (id, nombre) values ('00000000-0000-0000-0000-0000000005a1', 'Contabilidad (prueba 53)')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c agrega a la contadora y al técnico', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into grupo_miembros (grupo_id, perfil_id) values
    ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000e2'),
    ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000e3')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '1d la contadora ve su grupo y quiénes están', '2', pg_temp.valor($q$
  select count(*) from grupo_miembros where grupo_id = '00000000-0000-0000-0000-0000000005a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e un miembro NO agrega gente al grupo', 'RECHAZADO', pg_temp.intentar($q$
  insert into grupo_miembros (grupo_id, perfil_id) values ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000e1')$q$);

-- ============================================================ 2) compartir "como un calendario"
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a Jhojan crea "Revisar factura 123" compartida y una interna', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values
    ('00000000-0000-0000-0000-0000000005d1', 'Revisar factura 123', 'compartida'),
    ('00000000-0000-0000-0000-0000000005d4', 'Agenda privada de Jhojan', 'interna')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b se la comparte a la contadora (persona)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_participantes (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000e2')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c y al grupo Contabilidad', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_participantes (tarea_id, grupo_id) values ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005a1')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d compartir con el técnico (sin Planificación)', 'contiene: no tiene Planificación', pg_temp.intentar($q$
  insert into tarea_participantes (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000e3')$q$);
insert into resultado (prueba, esperado, resultado)
select '2e compartir una tarea interna (sin volverla compartida)', 'contiene: Solo se comparte una tarea', pg_temp.intentar($q$
  insert into tarea_participantes (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000e2')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '2f a la contadora le aparece en su agenda', '1', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g la contadora la mueve de columna', 'aceptado (1 filas)', pg_temp.intentar($q$
  update tareas set estado = 'en_progreso' where id = '00000000-0000-0000-0000-0000000005d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2h la contadora deja una nota', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_nota_tarea('00000000-0000-0000-0000-0000000005d1', 'La factura tiene el NIT mal')$q$);
insert into resultado (prueba, esperado, resultado)
select '2i la contadora NO cambia el título', 'contiene: Solo puedes mover la tarea de columna', pg_temp.intentar($q$
  update tareas set titulo = 'otro' where id = '00000000-0000-0000-0000-0000000005d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2j la contadora NO la vuelve interna', 'contiene: Solo quien creó la tarea decide', pg_temp.intentar($q$
  update tareas set visibilidad = 'interna' where id = '00000000-0000-0000-0000-0000000005d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2k la contadora NO la comparte con otros', 'RECHAZADO', pg_temp.intentar($q$
  insert into tarea_participantes (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000e1')$q$);
insert into resultado (prueba, esperado, resultado)
select '2l la contadora NO ve la interna de Jhojan', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d4'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
insert into resultado (prueba, esperado, resultado)
select '2m el técnico, aunque es del grupo, NO la ve (sin Planificación)', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d1'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
insert into resultado (prueba, esperado, resultado)
select '2n C1 (no participa) NO la ve', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2o C1 crea una compartida…', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values ('00000000-0000-0000-0000-0000000005d3', 'Informe mensual', 'compartida')$q$);
insert into resultado (prueba, esperado, resultado)
select '2o2 … y se la comparte a la contadora', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tarea_participantes (tarea_id, perfil_id) values ('00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000e2')$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2p Jhojan (admin y Operativo) NO ve la compartida de C1 en la que no participa', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d3'$q$);
insert into resultado (prueba, esperado, resultado)
select '2q Jhojan no la vuelve interna con participantes', 'contiene: Quita a los participantes', pg_temp.intentar($q$
  update tareas set visibilidad = 'interna' where id = '00000000-0000-0000-0000-0000000005d1'$q$);

-- ============================================================ 3) quien sale deja de ver
insert into resultado (prueba, esperado, resultado)
select '3a Jhojan quita a la contadora como persona', 'aceptado (1 filas)', pg_temp.intentar($q$
  delete from tarea_participantes where tarea_id = '00000000-0000-0000-0000-0000000005d1' and perfil_id = '00000000-0000-0000-0000-0000000000e2'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '3b la sigue viendo por el grupo', '1', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d1'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3c Jhojan la saca del grupo', 'aceptado (1 filas)', pg_temp.intentar($q$
  delete from grupo_miembros where grupo_id = '00000000-0000-0000-0000-0000000005a1' and perfil_id = '00000000-0000-0000-0000-0000000000e2'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '3d ya NO la ve (miembros actuales, nada copiado)', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d1'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3e Jhojan, que la creó, la sigue viendo', '1', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f el historial del grupo registró altas y bajas', 'creado,miembro_agregado,miembro_agregado,miembro_quitado', pg_temp.valor($q$
  select string_agg(tipo, ',' order by creado_en, tipo) from grupo_eventos where grupo_id = '00000000-0000-0000-0000-0000000005a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g el historial de la tarea registró a quién se compartió', '>= 3', pg_temp.valor($q$
  select count(*) from tarea_eventos where tarea_id = '00000000-0000-0000-0000-0000000005d1' and tipo = 'participante'$q$);

-- ============================================================ 4) archivar el grupo
insert into resultado (prueba, esperado, resultado)
select '4a Jhojan archiva el grupo', 'aceptado (1 filas)', pg_temp.intentar($q$
  update grupos set archivado = true where id = '00000000-0000-0000-0000-0000000005a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4b a un grupo archivado NO se le agregan miembros', 'contiene: archivado: no se le agregan miembros', pg_temp.intentar($q$
  insert into grupo_miembros (grupo_id, perfil_id) values ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000e1')$q$);
insert into resultado (prueba, esperado, resultado)
select '4c0 (una compartida nueva para probar)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values ('00000000-0000-0000-0000-0000000005d5', 'Compartida nueva', 'compartida')$q$);
insert into resultado (prueba, esperado, resultado)
select '4c a un grupo archivado NO se le comparten tareas', 'contiene: archivado: no se le comparten tareas', pg_temp.intentar($q$
  insert into tarea_participantes (tarea_id, grupo_id) values ('00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000005a1')$q$);
insert into resultado (prueba, esperado, resultado)
select '4d no se borra (filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from grupos where id = '00000000-0000-0000-0000-0000000005a1'$q$);

-- ============================================================ 5) historial de grupos intocable
insert into resultado (prueba, esperado, resultado)
select '5a Jhojan escribe en el historial del grupo a mano', 'RECHAZADO', pg_temp.intentar($q$
  insert into grupo_eventos (grupo_id, tipo) values ('00000000-0000-0000-0000-0000000005a1', 'miembro_agregado')$q$);
insert into resultado (prueba, esperado, resultado)
select '5b … lo edita', 'RECHAZADO', pg_temp.intentar($q$
  update grupo_eventos set tipo = 'x' where grupo_id = '00000000-0000-0000-0000-0000000005a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '5c … lo borra', 'RECHAZADO', pg_temp.intentar($q$
  delete from grupo_eventos where grupo_id = '00000000-0000-0000-0000-0000000005a1'$q$);

-- ============================================================ 6) transferir
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '6a la contadora tiene un pendiente en su agenda', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into tareas (id, titulo, visibilidad) values ('00000000-0000-0000-0000-0000000005d2', 'Conciliar banco', 'interna')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
insert into resultado (prueba, esperado, resultado)
select '6b un coordinador NO transfiere (no es Configuración)', 'RECHAZADO', pg_temp.intentar($q$
  select fn_transferir_tareas('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'x')$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '6c sin motivo', 'contiene: Escribe el motivo', pg_temp.intentar($q$
  select fn_transferir_tareas('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', '  ')$q$);
insert into resultado (prueba, esperado, resultado)
select '6d Jhojan transfiere los pendientes de la contadora a C1 (devuelve solo la cantidad)', '1', pg_temp.valor($q$
  select fn_transferir_tareas('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'Se retiró de la empresa')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '6e transferir NO le da a Jhojan la vista de lo transferido', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d2'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
insert into resultado (prueba, esperado, resultado)
select '6f la contadora ya no la ve (no es suya)', '0', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d2'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
insert into resultado (prueba, esperado, resultado)
select '6g C1 la ve porque ahora es suya', '1', pg_temp.valor($q$
  select count(*) from tareas where id = '00000000-0000-0000-0000-0000000005d2'$q$);
insert into resultado (prueba, esperado, resultado)
select '6h y el historial dice quién la movió, desde qué cuenta y por qué', 'Contadora→C1 · Se retiró de la empresa', pg_temp.valor($q$
  select (case when detalle->>'de_nombre' like '%Contadora%' then 'Contadora' else '?' end) || '→' ||
         (case when detalle->>'a_nombre' like '%C1%' then 'C1' else '?' end) || ' · ' || (detalle->>'motivo')
  from tarea_eventos where tarea_id = '00000000-0000-0000-0000-0000000005d2' and tipo = 'transferida'$q$);

-- ============================================================ 7) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '7a privilegios de anon en las tablas nuevas', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('grupos', 'grupo_miembros', 'grupo_eventos', 'tarea_participantes');
insert into resultado (prueba, esperado, resultado)
select '7b authenticated sin insert/update/delete en grupo_eventos', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated' and table_name = 'grupo_eventos'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
insert into resultado (prueba, esperado, resultado)
select '7c políticas using(true) nuevas', '0', count(*)::text
from pg_policies where schemaname = 'public'
  and tablename in ('grupos', 'grupo_miembros', 'grupo_eventos', 'tarea_participantes')
  and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true');

-- ============================================================ limpieza (admin)
delete from tarea_participantes where tarea_id::text like '00000000-0000-0000-0000-0000000005d%'
   or grupo_id = '00000000-0000-0000-0000-0000000005a1';
delete from grupo_miembros where grupo_id = '00000000-0000-0000-0000-0000000005a1';
-- Solo por id fijo: nunca por título (podría llevarse una tarea real).
delete from tarea_eventos where tarea_id::text like '00000000-0000-0000-0000-0000000005d%';
delete from tareas where id::text like '00000000-0000-0000-0000-0000000005d%';
delete from grupo_eventos where grupo_id = '00000000-0000-0000-0000-0000000005a1';
delete from grupos where id = '00000000-0000-0000-0000-0000000005a1';
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

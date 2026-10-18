-- Verificación de la migración 45 (módulo Técnico, fase 1). Correr DESPUÉS de la
-- migración, todo junto, en el SQL Editor. Crea un TÉCNICO DE PRUEBA (usuario + perfil
-- con el rol "Técnicos"), dos visitas y su recorrido completo hasta la firma, y BORRA
-- todo antes de mostrar el resultado.
--
-- Simula: A) Jhojan crea y asigna visitas
--         B) el técnico ve SOLO la suya, trabaja, sugiere, firma; el cliente firma
--         C) después de la firma: nada se edita ni se agrega; la sugerencia sigue su
--            recorrido (Jhojan la toma y la descarta con motivo) y queda el historial
--         D) usuario sin rol: no ve nada
-- Resultado esperado: todas las filas en "OK".

begin;

create temporary table verificacion (orden serial, prueba text, esperado text, obtenido text) on commit drop;
grant all on verificacion to authenticated;
grant usage on sequence verificacion_orden_seq to authenticated;

-- Ejecuta y devuelve 'ok' o el error (NO deshace: el recorrido sigue paso a paso).
create or replace function pg_temp.hacer(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return 'rechazado';
end $$;

create or replace function pg_temp.valor(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR: ' || sqlerrm;
end $$;

-- ============================================================ datos de prueba (admin)
-- Técnico de prueba: 00000000-0000-0000-0000-0000000000e1
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'tecnico.prueba.rls45@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre, cedula)
select '00000000-0000-0000-0000-0000000000e1', r.id, '__Técnico prueba 45__', '1000000045'
from roles r where r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre, cedula = excluded.cedula;

-- ============================================================ A) Jhojan
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"696d9431-5c4d-4043-aee4-3e4597094f26","role":"authenticated"}', true);

insert into verificacion (prueba, esperado, obtenido)
select 'Jhojan es responsable de Operativo', 'true', fn_tiene_permiso('operativo', 'responsable')::text
union all select 'Jhojan es responsable de Técnico', 'true', fn_tiene_permiso('tecnico', 'responsable')::text
union all select 'Jhojan crea visita asignada al técnico', 'ok', pg_temp.hacer($q$
  insert into visitas (id, titulo, tecnico_id, fecha_programada)
  values ('00000000-0000-0000-0000-00000000a451', '__prueba 45: asignada__', '00000000-0000-0000-0000-0000000000e1', current_date)$q$)
union all select 'Jhojan crea otra visita (de nadie)', 'ok', pg_temp.hacer($q$
  insert into visitas (id, titulo) values ('00000000-0000-0000-0000-00000000a452', '__prueba 45: ajena__')$q$);

-- ============================================================ B) el técnico
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

insert into verificacion (prueba, esperado, obtenido)
select 'Técnico ve solo su visita', '1', (select count(*) from visitas where titulo like '__prueba 45%')::text
union all select 'Técnico no ve la visita ajena', '0',
  (select count(*) from visitas where id = '00000000-0000-0000-0000-00000000a452')::text
union all select 'Técnico lee su perfil (cédula para la firma)', '1000000045',
  pg_temp.valor($q$select cedula from perfiles where id = auth.uid()$q$)
union all select 'Técnico marca su visita en curso', 'ok', pg_temp.hacer($q$
  update visitas set estado = 'en_curso' where id = '00000000-0000-0000-0000-00000000a451'$q$)
union all select 'Técnico NO cambia el título (es de Operativo)', 'rechazado', pg_temp.hacer($q$
  update visitas set titulo = 'x' where id = '00000000-0000-0000-0000-00000000a451'$q$)
union all select 'Técnico registra la jornada con GPS negado', 'ok', pg_temp.hacer($q$
  insert into visita_jornadas (id, visita_id, check_in_en, check_in_gps_estado, labor_ejecutada)
  values ('00000000-0000-0000-0000-00000000b451', '00000000-0000-0000-0000-00000000a451', now(), 'denegado', 'Revisión de cámaras')$q$)
union all select 'Reintento de la cola (mismo id) no duplica', 'ok', pg_temp.hacer($q$
  insert into visita_jornadas (id, visita_id) values ('00000000-0000-0000-0000-00000000b451', '00000000-0000-0000-0000-00000000a451')
  on conflict (id) do nothing$q$)
union all select 'Técnico NO escribe en la visita ajena', 'rechazado', pg_temp.hacer($q$
  insert into visita_jornadas (visita_id) values ('00000000-0000-0000-0000-00000000a452')$q$)
union all select 'Técnico registra una foto', 'ok', pg_temp.hacer($q$
  insert into visita_fotos (id, visita_id, jornada_id, storage_path, tomada_en, bytes)
  values ('00000000-0000-0000-0000-00000000f451', '00000000-0000-0000-0000-00000000a451', '00000000-0000-0000-0000-00000000b451',
          '00000000-0000-0000-0000-00000000a451/00000000-0000-0000-0000-00000000f451.jpg', now(), 200000)$q$)
union all select 'Técnico sugiere un equipo', 'ok', pg_temp.hacer($q$
  insert into visita_sugerencias (id, visita_id, descripcion, cantidad, unidad, motivo)
  values ('00000000-0000-0000-0000-00000000c451', '00000000-0000-0000-0000-00000000a451', 'UTP cat 6', 50, 'm', 'Falta cableado al cuarto técnico')$q$)
union all select 'Técnico NO cambia el estado de la sugerencia a mano', 'rechazado', pg_temp.hacer($q$
  update visita_sugerencias set estado = 'descartada' where id = '00000000-0000-0000-0000-00000000c451'$q$)
union all select 'Cliente NO firma antes que el técnico', 'rechazado', pg_temp.hacer($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a451', 'cliente', 'Cliente', '1', 'x/firma-cliente.png')$q$)
union all select 'Firma del técnico', 'ok', pg_temp.hacer($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a451', 'tecnico', '__Técnico prueba 45__', '1000000045',
          '00000000-0000-0000-0000-00000000a451/firma-tecnico.png')$q$)
union all select 'Firma del cliente', 'ok', pg_temp.hacer($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, cargo, imagen_path)
  values ('00000000-0000-0000-0000-00000000a451', 'cliente', 'Portero de turno', '79000000', 'Portería',
          '00000000-0000-0000-0000-00000000a451/firma-cliente.png')$q$);

-- ============================================================ C) después de la firma
insert into verificacion (prueba, esperado, obtenido)
select 'La visita quedó firmada', 'firmada',
  pg_temp.valor($q$select estado from visitas where id = '00000000-0000-0000-0000-00000000a451'$q$)
union all select 'Técnico NO edita la jornada firmada', 'rechazado', pg_temp.hacer($q$
  update visita_jornadas set labor_ejecutada = 'otra cosa' where id = '00000000-0000-0000-0000-00000000b451'$q$)
union all select 'Técnico NO agrega fotos a la visita firmada', 'rechazado', pg_temp.hacer($q$
  insert into visita_fotos (visita_id, storage_path) values ('00000000-0000-0000-0000-00000000a451', 'x.jpg')$q$)
union all select 'Nadie edita una firma (filas)', '0',
  pg_temp.valor($q$with u as (update visita_firmas set nombre = 'x' where visita_id = '00000000-0000-0000-0000-00000000a451' returning 1) select count(*) from u$q$)
union all select 'Técnico agrega una nota posterior', 'ok', pg_temp.hacer($q$
  insert into visita_notas_posteriores (visita_id, texto) values ('00000000-0000-0000-0000-00000000a451', 'Corrección: eran 3 cámaras, no 4')$q$)
union all select 'Técnico NO toma la sugerencia (es de Comercial)', 'rechazado', pg_temp.hacer($q$
  select fn_cambiar_estado_sugerencia('00000000-0000-0000-0000-00000000c451', 'en_revision')$q$);

select set_config('request.jwt.claims',
  '{"sub":"696d9431-5c4d-4043-aee4-3e4597094f26","role":"authenticated"}', true);

insert into verificacion (prueba, esperado, obtenido)
select 'Jhojan ve la sugerencia pendiente', 'pendiente',
  pg_temp.valor($q$select estado from visita_sugerencias where id = '00000000-0000-0000-0000-00000000c451'$q$)
union all select 'Jhojan la toma (en revisión) con la visita firmada', 'ok', pg_temp.hacer($q$
  select fn_cambiar_estado_sugerencia('00000000-0000-0000-0000-00000000c451', 'en_revision')$q$)
union all select 'Descartar sin motivo', 'rechazado', pg_temp.hacer($q$
  select fn_cambiar_estado_sugerencia('00000000-0000-0000-0000-00000000c451', 'descartada', '  ')$q$)
union all select 'Jhojan la descarta con motivo', 'ok', pg_temp.hacer($q$
  select fn_cambiar_estado_sugerencia('00000000-0000-0000-0000-00000000c451', 'descartada', 'El cliente ya lo compró por su cuenta')$q$)
union all select 'Historial de la sugerencia (pendiente → revisión → descartada)', 'pendiente>en_revision>descartada',
  pg_temp.valor($q$select string_agg(estado_nuevo, '>' order by creado_en, id) from sugerencia_eventos
                   where sugerencia_id = '00000000-0000-0000-0000-00000000c451'$q$)
union all select 'Nadie borra el historial (filas)', '0',
  pg_temp.valor($q$with d as (delete from sugerencia_eventos where sugerencia_id = '00000000-0000-0000-0000-00000000c451' returning 1) select count(*) from d$q$)
union all select 'Jhojan NO borra la visita firmada', 'rechazado', pg_temp.hacer($q$
  delete from visitas where id = '00000000-0000-0000-0000-00000000a451'$q$);

-- ============================================================ D) usuario sin rol
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);

insert into verificacion (prueba, esperado, obtenido)
select 'Sin rol ve visitas', '0', (select count(*) from visitas)::text
union all select 'Sin rol ve sugerencias', '0', (select count(*) from visita_sugerencias)::text
union all select 'Sin rol ve firmas', '0', (select count(*) from visita_firmas)::text
union all select 'Sin rol crea visita', 'rechazado', pg_temp.hacer($q$insert into visitas (titulo) values ('x')$q$);

-- ============================================================ estructura
reset role;
insert into verificacion (prueba, esperado, obtenido)
select 'Políticas using(true) en las tablas del módulo', '0', count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename in ('visitas', 'visita_jornadas', 'visita_fotos', 'visita_firmas',
                    'visita_notas_posteriores', 'visita_sugerencias', 'sugerencia_eventos')
  and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true')
union all
select 'Privilegios de anon en las tablas del módulo', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('visitas', 'visita_jornadas', 'visita_fotos', 'visita_firmas',
                     'visita_notas_posteriores', 'visita_sugerencias', 'sugerencia_eventos')
union all
select 'Bucket visitas privado', 'false', (select public::text from storage.buckets where id = 'visitas')
union all
select 'perfiles tiene cédula y teléfono', '2', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'perfiles' and column_name in ('cedula', 'telefono');

-- ============================================================ limpieza (admin)
delete from sugerencia_eventos where sugerencia_id = '00000000-0000-0000-0000-00000000c451';
delete from visita_sugerencias where visita_id in ('00000000-0000-0000-0000-00000000a451', '00000000-0000-0000-0000-00000000a452');
delete from visita_notas_posteriores where visita_id in ('00000000-0000-0000-0000-00000000a451', '00000000-0000-0000-0000-00000000a452');
delete from visita_firmas where visita_id in ('00000000-0000-0000-0000-00000000a451', '00000000-0000-0000-0000-00000000a452');
delete from visita_fotos where visita_id in ('00000000-0000-0000-0000-00000000a451', '00000000-0000-0000-0000-00000000a452');
delete from visita_jornadas where visita_id in ('00000000-0000-0000-0000-00000000a451', '00000000-0000-0000-0000-00000000a452');
delete from visitas where id in ('00000000-0000-0000-0000-00000000a451', '00000000-0000-0000-0000-00000000a452');
delete from perfiles where id = '00000000-0000-0000-0000-0000000000e1';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1';

-- ============================================================ resultado (última instrucción)
select prueba, esperado, obtenido,
  case when esperado = obtenido then 'OK' else 'REVISAR' end as estado
from verificacion
order by orden;

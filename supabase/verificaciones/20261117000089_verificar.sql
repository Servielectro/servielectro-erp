-- Verificación de la migración 89 (copia del audio en Drive). Correr DESPUÉS de la migración,
-- todo junto. Crea un usuario de Proyectos, un proyecto y dos reuniones de prueba; BORRA todo al
-- final. Todas las filas deben decir OK.
begin;

create temporary table resultado (orden serial, prueba text, esperado text, resultado text) on commit drop;
grant all on resultado to authenticated, service_role;
grant usage on sequence resultado_orden_seq to authenticated, service_role;

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

-- Q = Proyectos "trabajar". Reuniones …89a1 (con audio) y …89a2 (sin audio).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000089b0', 'authenticated', 'authenticated', 'proy-trab.89@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy trab 89__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select id, 'proyectos', 'trabajar', false from roles where nombre = '__Proy trab 89__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000089b0', id, '__Q 89__' from roles where nombre = '__Proy trab 89__'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000089e0', '__PRY-89__', '__Obra prueba 89__')
on conflict (id) do nothing;

-- ============================================================ 1) desde la app, nadie escribe la copia
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000089b0');
insert into resultado (prueba, esperado, resultado)
select '1a crear una reunión mandando una "copia en Drive" inventada', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into reuniones (id, proyecto_id, titulo, audio_drive_archivo_id, audio_drive_md5, audio_drive_verificado_en)
  values ('00000000-0000-0000-0000-0000000089a1', '00000000-0000-0000-0000-0000000089e0', 'Reunión prueba 89',
          'inventado', '0123456789abcdef0123456789abcdef', now())$q$);
insert into resultado (prueba, esperado, resultado)
select '1b … la base la dejó vacía', '(vacío)', pg_temp.valor($q$
  select audio_drive_archivo_id from reuniones where id = '00000000-0000-0000-0000-0000000089a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c anotar la copia desde la app', 'contiene: la anota el respaldo automático', pg_temp.intentar($q$
  update reuniones set audio_drive_archivo_id = 'x', audio_drive_md5 = '0123456789abcdef0123456789abcdef', audio_drive_verificado_en = now()
  where id = '00000000-0000-0000-0000-0000000089a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d marcar el audio como descartable (la 86 sigue negándose)', 'contiene: La retención del audio todavía no está definida', pg_temp.intentar($q$
  update reuniones set audio_descartable_desde = current_date where id = '00000000-0000-0000-0000-0000000089a1'$q$);

-- ============================================================ 2) el respaldo (service_role)
reset role;
update reuniones set aviso_grabacion = true, aviso_por = '00000000-0000-0000-0000-0000000089b0', aviso_en = now(),
       asistentes = '[{"nombre": "Prueba", "parte": "servielectro"}]', audio_path = '00000000-0000-0000-0000-0000000089a1/audio.webm'
where id = '00000000-0000-0000-0000-0000000089a1';
insert into reuniones (id, proyecto_id, titulo, creada_por)
values ('00000000-0000-0000-0000-0000000089a2', '00000000-0000-0000-0000-0000000089e0', 'Reunión sin audio 89', '00000000-0000-0000-0000-0000000089b0');
set local role service_role;
insert into resultado (prueba, esperado, resultado)
select '2a copia de una reunión sin audio', 'contiene: reuniones_drive_completo', pg_temp.intentar($q$
  update reuniones set audio_drive_archivo_id = 'x', audio_drive_md5 = '0123456789abcdef0123456789abcdef', audio_drive_verificado_en = now()
  where id = '00000000-0000-0000-0000-0000000089a2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b copia a medias (sin verificar)', 'contiene: reuniones_drive_completo', pg_temp.intentar($q$
  update reuniones set audio_drive_archivo_id = 'x' where id = '00000000-0000-0000-0000-0000000089a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c MD5 que no es MD5', 'contiene: reuniones_drive_completo', pg_temp.intentar($q$
  update reuniones set audio_drive_archivo_id = 'x', audio_drive_md5 = 'abc', audio_drive_verificado_en = now()
  where id = '00000000-0000-0000-0000-0000000089a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d el respaldo anota la copia verificada', 'aceptado (1 filas)', pg_temp.intentar($q$
  update reuniones set audio_drive_archivo_id = '1AbCdEf', audio_drive_md5 = '0123456789abcdef0123456789abcdef', audio_drive_verificado_en = now()
  where id = '00000000-0000-0000-0000-0000000089a1'$q$);

-- ============================================================ 3) no hay descarte sin copia (ni para postgres)
reset role;
insert into resultado (prueba, esperado, resultado)
select '3a descartar el audio de una reunión sin copia en Drive', 'contiene: reuniones_descarte_con_copia', pg_temp.intentar($q$
  update reuniones set audio_descartado_en = now() where id = '00000000-0000-0000-0000-0000000089a2'$q$);

-- ============================================================ 4) estructura
insert into resultado (prueba, esperado, resultado)
select '4a la función de la copia no es ejecutable por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname = 'fn_reuniones_copia_drive' and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '4b ninguna reunión real quedó marcada como descartable', '0', count(*)::text
from reuniones where audio_descartable_desde is not null and id::text not like '00000000-0000-0000-0000-0000000089%';

-- ============================================================ limpieza (admin)
delete from reuniones where id::text like '00000000-0000-0000-0000-0000000089a%';
delete from proyectos where id = '00000000-0000-0000-0000-0000000089e0';
delete from perfiles where id = '00000000-0000-0000-0000-0000000089b0';
delete from permisos_rol where rol_id in (select id from roles where nombre = '__Proy trab 89__');
delete from roles where nombre = '__Proy trab 89__';
delete from auth.users where id = '00000000-0000-0000-0000-0000000089b0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

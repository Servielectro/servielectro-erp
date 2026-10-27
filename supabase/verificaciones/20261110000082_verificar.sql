-- Verificación de la migración 82 (RUT de cliente nuevo: carpeta de pendientes para Administrativo).
-- Correr DESPUÉS de la migración. Prueba: quien crea clientes sube a su propia carpeta y no a la de
-- otro; Administrativo ve esos RUT; quien no tiene Comercial ni Administrativo no sube ni ve.
-- Crea tres usuarios y un archivo de prueba y BORRA todo.
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

-- ============================================================ personas de prueba (admin)
-- A = solo Administrativo "trabajar". B = solo Administrativo "trabajar" (otra persona). T = técnico.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000082a0', 'authenticated', 'authenticated', 'a.82@invalid.local'),
  ('00000000-0000-0000-0000-0000000082b0', 'authenticated', 'authenticated', 'b.82@invalid.local'),
  ('00000000-0000-0000-0000-0000000082c0', 'authenticated', 'authenticated', 't.82@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Adm prueba 82__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'administrativo', 'trabajar', false from roles r where r.nombre = '__Adm prueba 82__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000082a0', '__Adm prueba 82__', '__A 82__'),
             ('00000000-0000-0000-0000-0000000082b0', '__Adm prueba 82__', '__B 82__'),
             ('00000000-0000-0000-0000-0000000082c0', 'Técnicos', '__T 82__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000082a0');
insert into resultado (prueba, esperado, resultado)
select '1a Administrativo sube el RUT de un cliente nuevo a SU carpeta de pendientes', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-clientes', 'pendientes/00000000-0000-0000-0000-0000000082a0/1-rut.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b no en la carpeta de otro', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-clientes', 'pendientes/00000000-0000-0000-0000-0000000082b0/1-rut.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c ve el suyo', '1', pg_temp.valor($q$select count(*)::text from storage.objects where name like 'pendientes/00000000-0000-0000-0000-0000000082a0/%'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000082b0');
insert into resultado (prueba, esperado, resultado)
select '1d otro de Administrativo también lo ve (como los demás RUT)', '1', pg_temp.valor($q$select count(*)::text from storage.objects where name like 'pendientes/00000000-0000-0000-0000-0000000082a0/%'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000082c0');
insert into resultado (prueba, esperado, resultado)
select '2a el técnico (sin Comercial ni Administrativo) no sube', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-clientes', 'pendientes/00000000-0000-0000-0000-0000000082c0/1-rut.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b ni ve los de otros', '0', pg_temp.valor($q$select count(*)::text from storage.objects where name like 'pendientes/%82a0%'$q$);
reset role;

-- ============================================================ limpieza (admin)
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'documentos-clientes' and name like 'pendientes/00000000-0000-0000-0000-000000008%';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000082_0';
delete from permisos_rol where rol_id in (select id from roles where nombre = '__Adm prueba 82__');
delete from roles where nombre = '__Adm prueba 82__';
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000082_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

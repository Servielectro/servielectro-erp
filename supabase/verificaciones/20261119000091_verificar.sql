-- Verificación de la migración 91 (respaldo en Google Drive). Correr DESPUÉS de la migración (y de
-- la 89), todo junto. No toca Drive: prueba lo que vive en la base (turno, cola, regla de
-- "verificado", permisos y el aviso). Crea filas de prueba y las BORRA al final.
-- Todas las filas deben decir OK.
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

-- Un técnico de prueba y un objeto de Storage de prueba (sin archivo: solo la fila).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000091c0', 'authenticated', 'authenticated', 'tecnico.91@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000000091c0', id, '__T 91__' from roles where nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into storage.objects (id, bucket_id, name, metadata, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000091f1', 'documentos-clientes', 'zz-prueba-91/archivo.pdf',
        '{"size": 1234, "mimetype": "application/pdf"}', '2000-01-01', '2000-01-01');
-- (Fecha vieja a propósito: la cola va de lo más viejo a lo más nuevo y así entra en las primeras 500.)
-- (Si ya hay una vuelta real abierta, la prueba del turno no aplica: correr con el cron pausado.)

-- ============================================================ 1) el turno (como la función)
set local role service_role;
create temporary table turnos (n int, id uuid);
insert into turnos select 1, fn_respaldo_tomar_turno();
insert into turnos select 2, fn_respaldo_tomar_turno();
insert into resultado (prueba, esperado, resultado)
select '1a la primera vuelta toma el turno; la segunda, no (hay otra viva)', 'true / (vacío)',
  pg_temp.valor($q$select ((select id from turnos where n = 1) is not null)::text$q$) || ' / ' ||
  pg_temp.valor($q$select id::text from turnos where n = 2$q$);
reset role;
update respaldo_drive_corridas set latido_en = now() - interval '20 minutes' where id = (select id from turnos where n = 1);
set local role service_role;
insert into turnos select 3, fn_respaldo_tomar_turno();
insert into resultado (prueba, esperado, resultado)
select '1b una vuelta sin latido por 15 min se cierra como fallo y la nueva toma el turno', 'fallo / true',
  pg_temp.valor($q$select resultado from respaldo_drive_corridas where id = (select id from turnos where n = 1)$q$) || ' / ' ||
  pg_temp.valor($q$select ((select id from turnos where n = 3) is not null)::text$q$);

-- ============================================================ 2) la cola y la regla de "verificado"
insert into resultado (prueba, esperado, resultado)
select '2a un archivo sin copia está en la cola', '1', pg_temp.valor($q$
  select count(*)::text from fn_respaldo_pendientes(500) where ruta = 'zz-prueba-91/archivo.pdf'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b "respaldado" sin que Drive confirme el mismo MD5', 'contiene: respaldo_verificado', pg_temp.intentar($q$
  insert into respaldo_drive_archivos (bucket, ruta, origen_md5, drive_file_id, drive_md5, verificado_en, estado)
  values ('documentos-clientes', 'zz-prueba-91/archivo.pdf', '0123456789abcdef0123456789abcdef', 'x', 'ffffffffffffffffffffffffffffffff', now(), 'respaldado')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c respaldado y verificado', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into respaldo_drive_archivos (bucket, ruta, origen_actualizado, origen_md5, drive_file_id, drive_md5, verificado_en, estado)
  values ('documentos-clientes', 'zz-prueba-91/archivo.pdf', (select updated_at from storage.objects where id = '00000000-0000-0000-0000-0000000091f1'),
          '0123456789abcdef0123456789abcdef', 'x', '0123456789abcdef0123456789abcdef', now(), 'respaldado')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d … ya no está en la cola', '0', pg_temp.valor($q$
  select count(*)::text from fn_respaldo_pendientes(500) where ruta = 'zz-prueba-91/archivo.pdf'$q$);
reset role;
update storage.objects set updated_at = now() where id = '00000000-0000-0000-0000-0000000091f1';
set local role service_role;
insert into resultado (prueba, esperado, resultado)
select '2e si el objeto cambia en Storage, vuelve a la cola', '1', pg_temp.valor($q$
  select count(*)::text from fn_respaldo_pendientes(500) where ruta = 'zz-prueba-91/archivo.pdf'$q$);

-- ============================================================ 3) el aviso cuando se cae
reset role;
update respaldo_drive_corridas set terminada_en = now(), resultado = 'autorizacion_vencida', detalle = 'prueba 91'
where id = (select id from turnos where n = 3);
insert into resultado (prueba, esperado, resultado)
select '3a autorización vencida: avisa a cada responsable de Configuración', 'true', pg_temp.valor($q$
  select ((select count(*) from notificaciones where tipo = 'respaldo_drive' and origen_id = (select id from turnos where n = 3))
          = (select count(*) from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id
             where pr.modulo_id = 'configuracion' and pr.nivel = 'responsable')
          and (select count(*) from notificaciones where tipo = 'respaldo_drive' and origen_id = (select id from turnos where n = 3)) > 0)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '3b … y el aviso es urgente', 'true', pg_temp.valor($q$
  select bool_and(urgente)::text from notificaciones where tipo = 'respaldo_drive' and origen_id = (select id from turnos where n = 3)$q$);

-- ============================================================ 4) desde la app: solo leer
set local role authenticated;
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '4a Jhojan (Configuración) ve el estado del respaldo', 'true', pg_temp.valor($q$
  select ((select count(*) from respaldo_drive_archivos where ruta = 'zz-prueba-91/archivo.pdf') = 1)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '4b … y el resumen', 'true', pg_temp.valor($q$select (respaldados >= 1)::text from v_respaldo_drive_resumen$q$);
insert into resultado (prueba, esperado, resultado)
select '4c desde la app no se escribe el respaldo (ni Jhojan)', 'contiene: permission denied', pg_temp.intentar($q$
  update respaldo_drive_archivos set estado = 'respaldado' where ruta = 'zz-prueba-91/archivo.pdf'$q$);
insert into resultado (prueba, esperado, resultado)
select '4d desde la app no se consulta la cola de Storage', 'contiene: permission denied', pg_temp.intentar($q$select * from fn_respaldo_pendientes(10)$q$);
insert into resultado (prueba, esperado, resultado)
select '4e desde la app no se toma el turno', 'contiene: permission denied', pg_temp.intentar($q$select fn_respaldo_tomar_turno()$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000091c0');
insert into resultado (prueba, esperado, resultado)
select '4f el técnico no ve nada del respaldo', '0 / 0', pg_temp.valor($q$
  select (select count(*) from respaldo_drive_archivos)::text || ' / ' || (select count(*) from respaldo_drive_corridas)::text$q$);

-- ============================================================ 5) estructura
reset role;
-- La regla de siempre: si una migración se olvida del revoke de PUBLIC, esto se cae.
insert into resultado (prueba, esperado, resultado)
select '5a funciones del respaldo ejecutables por anon o authenticated', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_respaldo_pendientes', 'fn_respaldo_tomar_turno', 'fn_respaldo_avisar')
  and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
insert into resultado (prueba, esperado, resultado)
select '5b privilegios de anon en las tablas y la vista', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('respaldo_drive_archivos', 'respaldo_drive_carpetas', 'respaldo_drive_corridas', 'v_respaldo_drive_resumen');

-- ============================================================ limpieza (admin)
delete from notificaciones where tipo = 'respaldo_drive' and origen_id in (select id from turnos);
delete from respaldo_drive_corridas where id in (select id from turnos where id is not null);
delete from respaldo_drive_archivos where ruta = 'zz-prueba-91/archivo.pdf';
set local storage.allow_delete_query = 'true';
delete from storage.objects where id = '00000000-0000-0000-0000-0000000091f1';
delete from perfiles where id = '00000000-0000-0000-0000-0000000091c0';
delete from auth.users where id = '00000000-0000-0000-0000-0000000091c0';

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

-- Verificación de la migración 73 (Registrar problema). Correr DESPUÉS de la migración, todo junto.
-- Prueba: cualquiera reporta a nombre propio y nace "nuevo"; el contexto solo acepta las claves de
-- depuración; la captura va en su carpeta; cada quien ve los suyos y su estado; solo quien
-- administra mueve el estado, con nota al cerrar; lo reportado no se edita y nada se borra.
-- Crea dos usuarios y reportes de prueba y BORRA todo antes de mostrar el resultado.
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
-- T = técnico. U = otro usuario. J = Jhojan (Administrador: Configuración "responsable").
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000073a0', 'authenticated', 'authenticated', 'tecnico.73@invalid.local'),
  ('00000000-0000-0000-0000-0000000073b0', 'authenticated', 'authenticated', 'otro.73@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000073a0', '__T 73__'), ('00000000-0000-0000-0000-0000000073b0', '__U 73__')) v(id, nombre)
join roles r on r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;

set local role authenticated;
-- ============================================================ 1) reportar
select pg_temp.como('00000000-0000-0000-0000-0000000073a0');
insert into resultado (prueba, esperado, resultado)
select '1a el técnico reporta: nace "nuevo" aunque mande otro estado', 'nuevo / bloquea',
  pg_temp.valor($q$with n as (insert into reportes_problema (id, ruta, que_paso, que_esperaba, gravedad, contexto, estado, captura_path) values
                  ('00000000-0000-0000-0000-0000000073c1', '/tecnico/visitas/123', 'No guarda la firma', 'Que guardara', 'bloquea',
                   '{"sin_senal": true, "ancho": 375, "alto": 812, "version": "abc123"}', 'resuelto',
                   '00000000-0000-0000-0000-0000000073a0/captura.jpg') returning estado, gravedad)
                  select estado || ' / ' || gravedad from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1b reportar a nombre de otro', 'contiene: a nombre propio', pg_temp.intentar($q$
  insert into reportes_problema (reportado_por, ruta, que_paso) values ('00000000-0000-0000-0000-0000000073b0', '/', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c sin decir qué pasó', 'contiene: reportes_problema_que_paso_check', pg_temp.intentar($q$
  insert into reportes_problema (ruta, que_paso) values ('/', '  ')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d el contexto no acepta otras claves (contenido de formularios)', 'contiene: reportes_problema_contexto', pg_temp.intentar($q$
  insert into reportes_problema (ruta, que_paso, contexto) values ('/', 'x', '{"ancho": 375, "formulario": {"cedula": "123"}}')$q$);
insert into resultado (prueba, esperado, resultado)
select '1e captura en la carpeta de otro', 'contiene: no corresponde a quien reporta', pg_temp.intentar($q$
  insert into reportes_problema (ruta, que_paso, captura_path) values ('/', 'x', '00000000-0000-0000-0000-0000000073b0/c.jpg')$q$);
insert into resultado (prueba, esperado, resultado)
select '1f sube su captura; no en la carpeta de otro', 'aceptado (1 filas) / RECHAZADO',
  pg_temp.intentar($q$insert into storage.objects (bucket_id, name) values ('reportes-problema', '00000000-0000-0000-0000-0000000073a0/captura.jpg')$q$) || ' / ' ||
  split_part(pg_temp.intentar($q$insert into storage.objects (bucket_id, name) values ('reportes-problema', '00000000-0000-0000-0000-0000000073b0/c.jpg')$q$), ' ', 1);
insert into resultado (prueba, esperado, resultado)
select '1g no edita lo que reportó', 'aceptado (0 filas)', pg_temp.intentar($q$
  update reportes_problema set que_paso = 'otra cosa' where id = '00000000-0000-0000-0000-0000000073c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1h no lo borra', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from reportes_problema where id = '00000000-0000-0000-0000-0000000073c1'$q$);

-- ============================================================ 2) cada quien ve los suyos
select pg_temp.como('00000000-0000-0000-0000-0000000073b0');
insert into reportes_problema (id, ruta, que_paso) values ('00000000-0000-0000-0000-0000000073c2', '/rrhh', 'Lento');
insert into resultado (prueba, esperado, resultado)
select '2a otro usuario ve solo el suyo (ni el reporte ni la captura del técnico)', '1 / 0',
  pg_temp.valor($q$select (select count(*) from reportes_problema where id::text like '00000000-0000-0000-0000-0000000073c%')::text || ' / ' ||
                  (select count(*) from storage.objects where bucket_id = 'reportes-problema' and name like '%73a0%')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '2b quien no administra no cambia el estado', 'aceptado (0 filas)', pg_temp.intentar($q$
  update reportes_problema set estado = 'resuelto', nota_cierre = 'x' where id = '00000000-0000-0000-0000-0000000073c2'$q$);

-- ============================================================ 3) quien administra
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3a Jhojan los ve todos (y la captura)', '2 / 1',
  pg_temp.valor($q$select (select count(*) from reportes_problema where id::text like '00000000-0000-0000-0000-0000000073c%')::text || ' / ' ||
                  (select count(*) from storage.objects where bucket_id = 'reportes-problema' and name like '%73a0%')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '3b lo pone en revisión (queda quién)', 'en_revision / J',
  pg_temp.valor($q$with n as (update reportes_problema set estado = 'en_revision' where id = '00000000-0000-0000-0000-0000000073c1' returning estado, revisado_por)
                  select estado || ' / ' || case when revisado_por = '696d9431-5c4d-4043-aee4-3e4597094f26' then 'J' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '3c cerrar sin nota', 'contiene: reportes_problema_cierre', pg_temp.intentar($q$
  update reportes_problema set estado = 'resuelto' where id = '00000000-0000-0000-0000-0000000073c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d cerrar con nota', 'aceptado (1 filas)', pg_temp.intentar($q$
  update reportes_problema set estado = 'resuelto', nota_cierre = 'Corregido en la versión del 27/10' where id = '00000000-0000-0000-0000-0000000073c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3e ni el administrador edita lo reportado', 'contiene: Lo reportado no se edita', pg_temp.intentar($q$
  update reportes_problema set gravedad = 'detalle' where id = '00000000-0000-0000-0000-0000000073c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f un cerrado se reabre (vuelve a en revisión)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update reportes_problema set estado = 'en_revision' where id = '00000000-0000-0000-0000-0000000073c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g marcar "no es un error" con nota', 'aceptado (1 filas)', pg_temp.intentar($q$
  update reportes_problema set estado = 'no_es_error', nota_cierre = 'Así funciona: la firma se guarda al salir' where id = '00000000-0000-0000-0000-0000000073c2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3h no pasa de "no es un error" a "resuelto" sin reabrir', 'contiene: no pasa de', pg_temp.intentar($q$
  update reportes_problema set estado = 'resuelto' where id = '00000000-0000-0000-0000-0000000073c2'$q$);

-- ============================================================ 4) el que reportó ve en qué va
select pg_temp.como('00000000-0000-0000-0000-0000000073b0');
insert into resultado (prueba, esperado, resultado)
select '4a el usuario ve el estado y la nota del suyo', 'no_es_error / Así funciona: la firma se guarda al salir',
  pg_temp.valor($q$select estado || ' / ' || nota_cierre from reportes_problema where id = '00000000-0000-0000-0000-0000000073c2'$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '4b anónimo no ve nada', 'false',
  pg_temp.valor($q$select has_table_privilege('anon', 'reportes_problema', 'select')::text$q$);

-- ============================================================ limpieza (admin)
delete from reportes_problema where id::text like '00000000-0000-0000-0000-0000000073c%';
delete from storage.objects where bucket_id = 'reportes-problema' and name like '00000000-0000-0000-0000-0000000073_0/%';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000073a0', '00000000-0000-0000-0000-0000000073b0');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000073a0', '00000000-0000-0000-0000-0000000073b0');

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

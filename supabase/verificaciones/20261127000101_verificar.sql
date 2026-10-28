-- Verificación de la migración 101 (documentos del cliente). Correr DESPUÉS de la migración, todo
-- junto. Crea usuarios, un cliente y documentos de prueba; BORRA todo al final. Todo debe decir OK.
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

create or replace function pg_temp.doc(p_id text, p_tipo text, p_archivo text, p_letra text)
returns text language sql as $$
  select format('insert into cliente_documentos (id, cliente_id, tipo, nombre, nombre_archivo, path, mime, bytes, sha256) '
                || 'values (%L, %L, %L, %L, %L, %L, %L, 1000, repeat(%L, 64))',
                p_id, '00000000-0000-0000-0000-0000001010e0', p_tipo, p_archivo, p_archivo,
                'clientes/00000000-0000-0000-0000-0000001010e0/docs/' || p_archivo, 'application/pdf', p_letra);
$$;

-- A = Administrativo "trabajar". C = Administrativo "consultar". T = rol Técnicos.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001010a0', 'authenticated', 'authenticated', 'adm-trab.101@invalid.local'),
  ('00000000-0000-0000-0000-0000001010b0', 'authenticated', 'authenticated', 'adm-cons.101@invalid.local'),
  ('00000000-0000-0000-0000-0000001010c0', 'authenticated', 'authenticated', 'tecnico.101@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Adm trab 101__'), ('__Adm cons 101__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'administrativo', v.nivel::nivel_permiso, false
from (values ('__Adm trab 101__', 'trabajar'), ('__Adm cons 101__', 'consultar')) v(rol, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000001010a0', '__Adm trab 101__', '__A 101__'),
             ('00000000-0000-0000-0000-0000001010b0', '__Adm cons 101__', '__C 101__'),
             ('00000000-0000-0000-0000-0000001010c0', 'Técnicos', '__T 101__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into clientes (id, nombre) values ('00000000-0000-0000-0000-0000001010e0', '__Cliente prueba 101__')
on conflict (id) do nothing;

set local role authenticated;

-- ============================================================ 1) subir y ver
select pg_temp.como('00000000-0000-0000-0000-0000001010a0');
insert into resultado (prueba, esperado, resultado)
select '1a A sube la cámara de comercio', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000001010d1', 'camara_comercio', 'camara.pdf', 'a'));
insert into resultado (prueba, esperado, resultado)
select '1b … quedó con quien lo subió', 'true',
  pg_temp.valor($q$select (subido_por = '00000000-0000-0000-0000-0000001010a0')::text from cliente_documentos where id = '00000000-0000-0000-0000-0000001010d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c el mismo archivo dos veces en el cliente', 'contiene: uq_cliente_documentos_sha',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000001010d8', 'otro', 'copia.pdf', 'a'));
insert into resultado (prueba, esperado, resultado)
select '1d un path fuera de la carpeta docs del cliente', 'contiene: cliente_documentos_path', pg_temp.intentar($q$
  insert into cliente_documentos (cliente_id, tipo, nombre, nombre_archivo, path, mime, bytes, sha256)
  values ('00000000-0000-0000-0000-0000001010e0', 'otro', 'x', 'x.pdf', 'clientes/00000000-0000-0000-0000-0000001010e0/rut/x.pdf', 'application/pdf', 1, repeat('y', 64))$q$);
insert into resultado (prueba, esperado, resultado)
select '1e un tipo que no está en el catálogo (el RUT va por su flujo)', 'contiene: cliente_documentos_tipo_check',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000001010d7', 'rut', 'rut.pdf', 'x'));
insert into resultado (prueba, esperado, resultado)
select '1f A puede subir el archivo a docs/ de un cliente que existe', 'true',
  pg_temp.valor($q$select fn_cliente_archivo('clientes/00000000-0000-0000-0000-0000001010e0/docs/nuevo.pdf', 'subir')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1g … pero no a la carpeta de un cliente que no existe', 'false',
  pg_temp.valor($q$select fn_cliente_archivo('clientes/00000000-0000-0000-0000-000000000bad/docs/nuevo.pdf', 'subir')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1h … ni fuera de docs/ (la carpeta rut/ sigue con su política de la 71)', 'false',
  pg_temp.valor($q$select fn_cliente_archivo('clientes/00000000-0000-0000-0000-0000001010e0/otra/nuevo.pdf', 'subir')::text$q$);

select pg_temp.como('00000000-0000-0000-0000-0000001010b0');
insert into resultado (prueba, esperado, resultado)
select '1i C ve el documento', '1', pg_temp.valor($q$select count(*)::text from cliente_documentos where cliente_id = '00000000-0000-0000-0000-0000001010e0'$q$);
insert into resultado (prueba, esperado, resultado)
select '1j C ve el archivo en el bucket', 'true',
  pg_temp.valor($q$select fn_cliente_archivo('clientes/00000000-0000-0000-0000-0000001010e0/docs/camara.pdf', 'ver')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1k C (solo consultar) no registra documentos', 'contiene: row-level security',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000001010d6', 'acta_consejo', 'acta.pdf', 'f'));
insert into resultado (prueba, esperado, resultado)
select '1l C no sube archivos al bucket', 'false',
  pg_temp.valor($q$select fn_cliente_archivo('clientes/00000000-0000-0000-0000-0000001010e0/docs/nuevo.pdf', 'subir')::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001010c0');
insert into resultado (prueba, esperado, resultado)
select '1m el técnico no ve ninguno', '0', pg_temp.valor($q$select count(*)::text from cliente_documentos where cliente_id = '00000000-0000-0000-0000-0000001010e0'$q$);

-- ============================================================ 2) no se cambia el archivo, se archiva con motivo
select pg_temp.como('00000000-0000-0000-0000-0000001010a0');
insert into resultado (prueba, esperado, resultado)
select '2a cambiar el archivo de un documento', 'contiene: no se cambia', pg_temp.intentar($q$
  update cliente_documentos set sha256 = repeat('c', 64) where id = '00000000-0000-0000-0000-0000001010d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b archivar sin motivo', 'contiene: Escribe el motivo', pg_temp.intentar($q$
  update cliente_documentos set archivado = true where id = '00000000-0000-0000-0000-0000001010d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c archivar con motivo', 'aceptado (1 filas)', pg_temp.intentar($q$
  update cliente_documentos set archivado = true, motivo_archivo = 'Era de otro cliente' where id = '00000000-0000-0000-0000-0000001010d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d … queda quién lo archivó', 'true', pg_temp.valor($q$
  select (archivado_por = '00000000-0000-0000-0000-0000001010a0' and archivado_en is not null)::text from cliente_documentos where id = '00000000-0000-0000-0000-0000001010d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e archivado, el mismo archivo se puede volver a subir', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000001010d2', 'camara_comercio', 'camara-bien.pdf', 'a'));
insert into resultado (prueba, esperado, resultado)
select '2f un documento no se borra', 'contiene: permission denied', pg_temp.intentar($q$
  delete from cliente_documentos where id = '00000000-0000-0000-0000-0000001010d2'$q$);

reset role;
-- ============================================================ 3) bucket y privilegios
insert into resultado (prueba, esperado, resultado)
select '3a el bucket documentos-clientes: privado, 15 MB, acepta Word', 'false / 15728640 / true',
  (select public::text || ' / ' || file_size_limit::text || ' / '
          || ('application/vnd.openxmlformats-officedocument.wordprocessingml.document' = any (allowed_mime_types))::text
     from storage.buckets where id = 'documentos-clientes');
insert into resultado (prueba, esperado, resultado)
select '3b anon no lee la tabla', 'false', has_table_privilege('anon', 'public.cliente_documentos', 'select')::text;
insert into resultado (prueba, esperado, resultado)
select '3c la función de reglas no la ejecuta nadie', 'false',
  has_function_privilege('authenticated', 'public.fn_cliente_documentos_reglas()', 'execute')::text;

-- ============================================================ limpieza (admin)
delete from cliente_documentos where cliente_id = '00000000-0000-0000-0000-0000001010e0';
delete from clientes where id = '00000000-0000-0000-0000-0000001010e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000001010_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Adm trab 101__', '__Adm cons 101__'));
delete from roles where nombre in ('__Adm trab 101__', '__Adm cons 101__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000001010_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

-- Verificación de la migración 102 (lecturas de documentos). Correr DESPUÉS de la migración, todo
-- junto. Crea usuarios, un proyecto y documentos de prueba; BORRA todo al final. Todo debe decir OK.
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

create or replace function pg_temp.leer(p_id text, p_documento text)
returns text language sql as $$
  select format('insert into documento_lecturas (id, documento_id, lectura, proveedor, modelo) values (%L, %L, %L, %L, %L)',
                p_id, p_documento, '{"valor_total": {"valor": 1000}}', 'OpenAI', 'prueba');
$$;

-- P = Proyectos "trabajar" sin datos sensibles. C = Proyectos "consultar". T = rol Técnicos.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001020a0', 'authenticated', 'authenticated', 'proy-trab.102@invalid.local'),
  ('00000000-0000-0000-0000-0000001020b0', 'authenticated', 'authenticated', 'proy-cons.102@invalid.local'),
  ('00000000-0000-0000-0000-0000001020c0', 'authenticated', 'authenticated', 'tecnico.102@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy trab 102__'), ('__Proy cons 102__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'proyectos', v.nivel::nivel_permiso, false
from (values ('__Proy trab 102__', 'trabajar'), ('__Proy cons 102__', 'consultar')) v(rol, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000001020a0', '__Proy trab 102__', '__P 102__'),
             ('00000000-0000-0000-0000-0000001020b0', '__Proy cons 102__', '__C 102__'),
             ('00000000-0000-0000-0000-0000001020c0', 'Técnicos', '__T 102__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000001020e0', '__PRY-102__', '__Obra prueba 102__')
on conflict (id) do nothing;
-- Dos documentos (como admin): el contrato firmado y una cotización reservada.
insert into proyecto_documentos (id, proyecto_id, tipo, nombre, nombre_archivo, path, mime, bytes, sha256, reservado) values
  ('00000000-0000-0000-0000-0000001020d1', '00000000-0000-0000-0000-0000001020e0', 'contrato_firmado', 'c', 'c.pdf',
   '00000000-0000-0000-0000-0000001020e0/c.pdf', 'application/pdf', 1, repeat('a', 64), false),
  ('00000000-0000-0000-0000-0000001020d2', '00000000-0000-0000-0000-0000001020e0', 'cotizacion', 'x', 'x.xlsm',
   '00000000-0000-0000-0000-0000001020e0/x.xlsm', 'application/pdf', 1, repeat('b', 64), true)
on conflict (id) do nothing;

set local role authenticated;

-- ============================================================ 1) leer y ver
select pg_temp.como('00000000-0000-0000-0000-0000001020a0');
insert into resultado (prueba, esperado, resultado)
select '1a P guarda la lectura del contrato', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.leer('00000000-0000-0000-0000-0000001020f1', '00000000-0000-0000-0000-0000001020d1'));
insert into resultado (prueba, esperado, resultado)
select '1b … quedó con quien la pidió', 'true',
  pg_temp.valor($q$select (leido_por = '00000000-0000-0000-0000-0000001020a0')::text from documento_lecturas where id = '00000000-0000-0000-0000-0000001020f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c P no lee un documento reservado que no ve', 'contiene: row-level security',
  pg_temp.intentar(pg_temp.leer('00000000-0000-0000-0000-0000001020f2', '00000000-0000-0000-0000-0000001020d2'));
insert into resultado (prueba, esperado, resultado)
select '1d una lectura que no es un objeto', 'contiene: documento_lecturas_lectura_check', pg_temp.intentar($q$
  insert into documento_lecturas (documento_id, lectura, proveedor, modelo)
  values ('00000000-0000-0000-0000-0000001020d1', '[]', 'OpenAI', 'prueba')$q$);
insert into resultado (prueba, esperado, resultado)
select '1e un proveedor que no existe', 'contiene: documento_lecturas_proveedor_check', pg_temp.intentar($q$
  insert into documento_lecturas (documento_id, lectura, proveedor, modelo)
  values ('00000000-0000-0000-0000-0000001020d1', '{}', 'Otro', 'prueba')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000001020b0');
insert into resultado (prueba, esperado, resultado)
select '1f C ve la lectura', '1', pg_temp.valor($q$select count(*)::text from documento_lecturas where documento_id = '00000000-0000-0000-0000-0000001020d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1g C (solo consultar) no pide lecturas', 'contiene: row-level security',
  pg_temp.intentar(pg_temp.leer('00000000-0000-0000-0000-0000001020f3', '00000000-0000-0000-0000-0000001020d1'));
select pg_temp.como('00000000-0000-0000-0000-0000001020c0');
insert into resultado (prueba, esperado, resultado)
select '1h el técnico no ve ninguna', '0', pg_temp.valor($q$select count(*)::text from documento_lecturas where documento_id = '00000000-0000-0000-0000-0000001020d1'$q$);

-- ============================================================ 2) no se cambia ni se borra
select pg_temp.como('00000000-0000-0000-0000-0000001020a0');
insert into resultado (prueba, esperado, resultado)
select '2a cambiar una lectura', 'contiene: permission denied', pg_temp.intentar($q$
  update documento_lecturas set modelo = 'otro' where id = '00000000-0000-0000-0000-0000001020f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b borrar una lectura', 'contiene: permission denied', pg_temp.intentar($q$
  delete from documento_lecturas where id = '00000000-0000-0000-0000-0000001020f1'$q$);

reset role;
-- ============================================================ 3) privilegios
insert into resultado (prueba, esperado, resultado)
select '3a anon no lee la tabla', 'false', has_table_privilege('anon', 'public.documento_lecturas', 'select')::text;
insert into resultado (prueba, esperado, resultado)
select '3b la función de reglas no la ejecuta nadie', 'false',
  has_function_privilege('authenticated', 'public.fn_documento_lecturas_reglas()', 'execute')::text;

-- ============================================================ limpieza (admin)
delete from documento_lecturas where documento_id in ('00000000-0000-0000-0000-0000001020d1', '00000000-0000-0000-0000-0000001020d2');
delete from proyecto_documentos where proyecto_id = '00000000-0000-0000-0000-0000001020e0';
delete from proyectos where id = '00000000-0000-0000-0000-0000001020e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000001020_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy trab 102__', '__Proy cons 102__'));
delete from roles where nombre in ('__Proy trab 102__', '__Proy cons 102__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000001020_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

-- Verificación de la migración 71 (RUT de clientes para Administrativo). Correr DESPUÉS de la
-- migración, todo junto. Prueba: Administrativo ve, sube y confirma RUT, pero no ve ni registra
-- facturas de proveedor ni sube fuera de la carpeta del RUT; "consultar" solo ve; Comercial sigue
-- igual. Crea un cliente, un proyecto y documentos de prueba y BORRA todo antes del resultado.
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
-- A = SOLO Administrativo "trabajar". Q = SOLO Administrativo "consultar". C = Comercial "trabajar".
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000071a0', 'authenticated', 'authenticated', 'administrativo.71@invalid.local'),
  ('00000000-0000-0000-0000-0000000071b0', 'authenticated', 'authenticated', 'consulta.71@invalid.local'),
  ('00000000-0000-0000-0000-0000000071c0', 'authenticated', 'authenticated', 'comercial.71@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Administrativo prueba 71__'), ('__Adm consulta prueba 71__'), ('__Comercial prueba 71__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, case when r.nombre = '__Comercial prueba 71__' then 'comercial' else 'administrativo' end,
       case when r.nombre = '__Adm consulta prueba 71__' then 'consultar' else 'trabajar' end::nivel_permiso, false
from roles r where r.nombre in ('__Administrativo prueba 71__', '__Adm consulta prueba 71__', '__Comercial prueba 71__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000071a0', '__Administrativo prueba 71__', '__A 71__'),
  ('00000000-0000-0000-0000-0000000071b0', '__Adm consulta prueba 71__', '__Q 71__'),
  ('00000000-0000-0000-0000-0000000071c0', '__Comercial prueba 71__', '__C 71__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- Un cliente con su RUT, y un proyecto con una factura de proveedor (plata).
insert into clientes (id, nombre) values ('00000000-0000-0000-0000-0000000071d1', '__Cliente 71__');
insert into proyectos (id, codigo, nombre, cliente_id) values ('00000000-0000-0000-0000-0000000071e1', '__P71__', '__Proyecto 71__', '00000000-0000-0000-0000-0000000071d1');
insert into documentos (id, tipo_documento, cliente_id, storage_path, nombre_archivo) values
  ('00000000-0000-0000-0000-0000000071f1', 'RUT', '00000000-0000-0000-0000-0000000071d1', 'clientes/00000000-0000-0000-0000-0000000071d1/rut/1-rut.pdf', 'rut.pdf');
insert into documentos (id, tipo_documento, proyecto_id, storage_path, nombre_archivo) values
  ('00000000-0000-0000-0000-0000000071f2', 'FACTURA_PROVEEDOR', '00000000-0000-0000-0000-0000000071e1', 'proyectos/x/factura.pdf', 'factura.pdf');
insert into storage.objects (bucket_id, name) values
  ('documentos-clientes', 'clientes/00000000-0000-0000-0000-0000000071d1/rut/1-rut.pdf'),
  ('documentos-clientes', 'proyectos/00000000-0000-0000-0000-0000000071e1/factura/1-factura.pdf');

set local role authenticated;
-- ============================================================ 1) solo Administrativo "trabajar"
select pg_temp.como('00000000-0000-0000-0000-0000000071a0');
insert into resultado (prueba, esperado, resultado)
select '1a ve el RUT (registro y archivo)', '1 / 1', pg_temp.valor($q$
  select (select count(*) from documentos where id::text like '00000000-0000-0000-0000-0000000071f%')::text || ' / ' ||
         (select count(*) from storage.objects where bucket_id = 'documentos-clientes' and name like '%71d1%')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1b NO ve la factura de proveedor (registro ni archivo)', '0 / 0', pg_temp.valor($q$
  select (select count(*) from documentos where id = '00000000-0000-0000-0000-0000000071f2')::text || ' / ' ||
         (select count(*) from storage.objects where bucket_id = 'documentos-clientes' and name like 'proyectos/%71e1%')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1c sube un RUT (archivo y registro)', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$insert into storage.objects (bucket_id, name) values ('documentos-clientes', 'clientes/00000000-0000-0000-0000-0000000071d1/rut/2-rut.pdf')$q$) || ' / ' ||
  pg_temp.intentar($q$insert into documentos (tipo_documento, cliente_id, storage_path, nombre_archivo) values
    ('RUT', '00000000-0000-0000-0000-0000000071d1', 'clientes/00000000-0000-0000-0000-0000000071d1/rut/2-rut.pdf', 'rut2.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d confirma el RUT', 'aceptado (1 filas)', pg_temp.intentar($q$
  update documentos set estado = 'CONFIRMADO', confirmado_en = now() where id = '00000000-0000-0000-0000-0000000071f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e no convierte un RUT en factura', 'contiene: row-level security', pg_temp.intentar($q$
  update documentos set tipo_documento = 'FACTURA_PROVEEDOR', proyecto_id = '00000000-0000-0000-0000-0000000071e1' where id = '00000000-0000-0000-0000-0000000071f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f no registra una factura de proveedor', 'contiene: row-level security', pg_temp.intentar($q$
  insert into documentos (tipo_documento, proyecto_id, storage_path, nombre_archivo) values ('FACTURA_PROVEEDOR', '00000000-0000-0000-0000-0000000071e1', 'x', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '1g no sube archivos fuera de la carpeta del RUT', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-clientes', 'proyectos/00000000-0000-0000-0000-0000000071e1/factura/2.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '1h no borra un RUT (registro ni archivo)', 'aceptado (0 filas) / aceptado (0 filas)',
  pg_temp.intentar($q$delete from documentos where id = '00000000-0000-0000-0000-0000000071f1'$q$) || ' / ' ||
  pg_temp.intentar($q$delete from storage.objects where name = 'clientes/00000000-0000-0000-0000-0000000071d1/rut/1-rut.pdf'$q$);
insert into resultado (prueba, esperado, resultado)
select '1i ve el RUT vigente del cliente', 'rut.pdf', pg_temp.valor($q$
  select nombre_archivo from v_rut_vigente_cliente where cliente_id = '00000000-0000-0000-0000-0000000071d1'$q$);

-- ============================================================ 2) Administrativo "consultar"
select pg_temp.como('00000000-0000-0000-0000-0000000071b0');
insert into resultado (prueba, esperado, resultado)
select '2a ve el RUT', '2', pg_temp.valor($q$select count(*)::text from documentos where cliente_id = '00000000-0000-0000-0000-0000000071d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b no sube RUT', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-clientes', 'clientes/00000000-0000-0000-0000-0000000071d1/rut/3-rut.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c no confirma RUT', 'aceptado (0 filas)', pg_temp.intentar($q$
  update documentos set estado = 'DESCARTADO' where id = '00000000-0000-0000-0000-0000000071f1'$q$);

-- ============================================================ 3) Comercial, como antes
select pg_temp.como('00000000-0000-0000-0000-0000000071c0');
insert into resultado (prueba, esperado, resultado)
select '3a Comercial sigue viendo el RUT y la factura', '3', pg_temp.valor($q$
  select count(*)::text from documentos where id::text like '00000000-0000-0000-0000-0000000071f%' or cliente_id = '00000000-0000-0000-0000-0000000071d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3b Comercial sigue subiendo al bucket', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-clientes', 'clientes/00000000-0000-0000-0000-0000000071d1/rut/4-rut.pdf')$q$);
reset role;

-- ============================================================ limpieza (admin)
delete from storage.objects where bucket_id = 'documentos-clientes' and (name like '%71d1%' or name like '%71e1%');
delete from documentos where cliente_id = '00000000-0000-0000-0000-0000000071d1' or proyecto_id = '00000000-0000-0000-0000-0000000071e1';
delete from proyectos where id = '00000000-0000-0000-0000-0000000071e1';
delete from clientes where id = '00000000-0000-0000-0000-0000000071d1';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000071_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Administrativo prueba 71__', '__Adm consulta prueba 71__', '__Comercial prueba 71__'));
delete from roles where nombre in ('__Administrativo prueba 71__', '__Adm consulta prueba 71__', '__Comercial prueba 71__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000071_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

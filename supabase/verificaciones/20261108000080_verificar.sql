-- Verificación de la migración 80 (responsabilidades fiscales: catálogo RUT casilla 53 y factura
-- electrónica, separados). Correr DESPUÉS de la migración, todo junto. Prueba: los dos catálogos
-- cargados desde la DIAN con su fuente, el mapeo entre ellos vacío, las sugerencias de IVA y renta,
-- que R-99-PN ya no queda en la columna del RUT, que lo leído del RUT se guarda completo, que SIIGO
-- llena la columna de FE, y quién ajusta el catálogo. Crea y BORRA todo lo de prueba.
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
-- A = Administrativo "trabajar". R = Administrativo "responsable".
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000080a0', 'authenticated', 'authenticated', 'adm.80@invalid.local'),
  ('00000000-0000-0000-0000-0000000080b0', 'authenticated', 'authenticated', 'admresp.80@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Adm prueba 80__'), ('__Adm resp prueba 80__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'administrativo', case r.nombre when '__Adm resp prueba 80__' then 'responsable' else 'trabajar' end::nivel_permiso, false
from roles r where r.nombre in ('__Adm prueba 80__', '__Adm resp prueba 80__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000080a0', '__Adm prueba 80__', '__A 80__'),
             ('00000000-0000-0000-0000-0000000080b0', '__Adm resp prueba 80__', '__R 80__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- ============================================================ 1) el catálogo, desde la DIAN
insert into resultado (prueba, esperado, resultado)
select '1a RUT casilla 53: 48 códigos; factura electrónica: 5', '48 / 5',
  pg_temp.valor($q$select (select count(*) from responsabilidades_fiscales where sistema = 'rut')::text || ' / ' || (select count(*) from responsabilidades_fiscales where sistema = 'fe')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1b los del cliente real NIZA VIII tienen nombre (07, 14, 42, 55)', 'Retención en la fuente a título de renta | Informante de Exógena | Obligado a llevar contabilidad | Informante de Beneficiarios Finales',
  pg_temp.valor($q$select string_agg(nombre, ' | ' order by codigo) from responsabilidades_fiscales where sistema = 'rut' and codigo in ('07', '14', '42', '55')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c factura electrónica: O-13 … R-99-PN', 'O-13 Gran contribuyente | O-15 Autorretenedor | O-23 Agente de retención IVA | O-47 Régimen simple de tributación | R-99-PN No responsable',
  pg_temp.valor($q$select string_agg(codigo || ' ' || nombre, ' | ' order by codigo) from responsabilidades_fiscales where sistema = 'fe'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d el mapeo RUT ↔ factura electrónica está VACÍO (lo confirma el contador)', '0',
  pg_temp.valor($q$select count(*)::text from responsabilidades_fiscales where equivalente_fe is not null$q$);
insert into resultado (prueba, esperado, resultado)
select '1e sugerencias: 48 → responsable de IVA, 49 y 53 → no; 04 y 05 → declarante', '48:true 49:false 53:false / 04 05',
  pg_temp.valor($q$select (select string_agg(codigo || ':' || sugiere_responsable_iva, ' ' order by codigo) from responsabilidades_fiscales where sugiere_responsable_iva is not null)
                  || ' / ' || (select string_agg(codigo, ' ' order by codigo) from responsabilidades_fiscales where sugiere_declarante_renta)$q$);
insert into resultado (prueba, esperado, resultado)
select '1f cada código dice de dónde salió', '0', pg_temp.valor($q$select count(*)::text from responsabilidades_fiscales where coalesce(fuente, '') not like 'DIAN%'$q$);

-- ============================================================ 2) clientes: dos columnas
insert into resultado (prueba, esperado, resultado)
select '2a ningún cliente queda con R-99-PN en la columna del RUT', '0', pg_temp.valor($q$select count(*)::text from clientes where 'R-99-PN' = any (responsabilidades_rut)$q$);
insert into resultado (prueba, esperado, resultado)
select '2b la columna de FE no acepta un código del RUT', 'contiene: clientes_responsabilidades_fe', pg_temp.intentar($q$
  insert into clientes (nombre, responsabilidades_fe) values ('__Cliente malo 80__', '{13}')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c lo leído del RUT se guarda completo, esté o no en el catálogo', '07,14,42,55,99',
  pg_temp.valor($q$with n as (insert into clientes (id, nombre, responsabilidades_rut, responsabilidades_fe) values
                  ('00000000-0000-0000-0000-0000000080c1', '__NIZA prueba 80__', '{07,14,42,55,99}', '{R-99-PN}') returning responsabilidades_rut)
                  select array_to_string(responsabilidades_rut, ',') from n$q$);

-- ============================================================ 3) importación de SIIGO: FE aparte
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000080a0');
insert into resultado (prueba, esperado, resultado)
select '3a SIIGO trae O-13 y O-23: van a la columna de FE tal cual; lo del RUT no se toca', 'aceptadoO-13,O-23 / 07,14,42,55,99',
  split_part(pg_temp.intentar($q$select fn_importar_clientes('[{"nit": "999000801", "nombre": "__SIIGO 80__", "responsabilidades_fe": ["O-13", "O-23"]}]', 'p80.xlsx', '{}')$q$), ' ', 0 + 1) || pg_temp.valor($q$select array_to_string(responsabilidades_fe, ',') from clientes where nit = '999000801'$q$)
  || ' / ' || pg_temp.valor($q$select array_to_string(responsabilidades_rut, ',') from clientes where id = '00000000-0000-0000-0000-0000000080c1'$q$);

-- ============================================================ 4) quién ajusta el catálogo
insert into resultado (prueba, esperado, resultado)
select '4a Administrativo "trabajar" lo lee pero no lo cambia', 'sí / aceptado (0 filas)',
  pg_temp.valor($q$select case when count(*) = 53 then 'sí' else count(*)::text end from responsabilidades_fiscales$q$) || ' / ' ||
  pg_temp.intentar($q$update responsabilidades_fiscales set afecta_facturacion = true where sistema = 'rut' and codigo = '14'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000080b0');
insert into resultado (prueba, esperado, resultado)
select '4b Administrativo "responsable" lo ajusta (queda quién)', 'true / R',
  pg_temp.valor($q$with n as (update responsabilidades_fiscales set afecta_facturacion = true where sistema = 'rut' and codigo = '14' returning afecta_facturacion, actualizado_por)
                  select afecta_facturacion::text || ' / ' || case when actualizado_por = '00000000-0000-0000-0000-0000000080b0' then 'R' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '4c el código no se cambia ni se borra', 'contiene: no se cambian / aceptado (0 filas)',
  case when pg_temp.intentar($q$update responsabilidades_fiscales set codigo = '99' where sistema = 'rut' and codigo = '14'$q$) like '%no se cambian%' then 'contiene: no se cambian' else 'NO' end
  || ' / ' || pg_temp.intentar($q$delete from responsabilidades_fiscales where sistema = 'rut' and codigo = '14'$q$);
reset role;
-- deja el 14 como vino de la migración
update responsabilidades_fiscales set afecta_facturacion = false, actualizado_por = null where sistema = 'rut' and codigo = '14';

-- ============================================================ limpieza (admin)
delete from importaciones_clientes where archivo_nombre = 'p80.xlsx';
delete from clientes where id = '00000000-0000-0000-0000-0000000080c1' or nit = '999000801';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000080_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Adm prueba 80__', '__Adm resp prueba 80__'));
delete from roles where nombre in ('__Adm prueba 80__', '__Adm resp prueba 80__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000080_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

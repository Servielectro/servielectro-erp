-- Verificación de la migración 70 (clientes: datos DIAN, sedes, importación de SIIGO). Correr
-- DESPUÉS de la migración, todo junto.
-- Prueba: el DV se separa, se calcula y se rechaza si no corresponde; el código DANE son 5 dígitos;
-- las sedes siguen los permisos de Comercial; importar exige "trabajar", crea los nuevos y al
-- actualizar NO borra lo que el ERP tiene (correo, ubicación GPS, sedes); no acepta campos fuera
-- de la lista; queda registro de la importación.
-- Usa NIT 999000701..705 (inventados) y BORRA todo antes de mostrar el resultado.
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
-- C = Comercial "trabajar". K = Comercial "consultar". T = técnico (sin Comercial).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000070a0', 'authenticated', 'authenticated', 'comercial.70@invalid.local'),
  ('00000000-0000-0000-0000-0000000070b0', 'authenticated', 'authenticated', 'consulta.70@invalid.local'),
  ('00000000-0000-0000-0000-0000000070c0', 'authenticated', 'authenticated', 'tecnico.70@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Comercial prueba 70__'), ('__consulta prueba 70__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'comercial', case r.nombre when '__Comercial prueba 70__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__Comercial prueba 70__', '__consulta prueba 70__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000070a0', '__Comercial prueba 70__', '__C 70__'),
  ('00000000-0000-0000-0000-0000000070b0', '__consulta prueba 70__', '__K 70__'),
  ('00000000-0000-0000-0000-0000000070c0', 'Técnicos', '__T 70__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- Un cliente que ya existe en el ERP, con ubicación GPS, correo y una sede.
insert into clientes (id, nombre, nit, email, contacto, latitud, longitud, ubicacion_tomada_en)
values ('00000000-0000-0000-0000-0000000070d1', '__Cliente existente 70__', '999000701', 'existe@invalid.local', 'Pedro', 4.6, -74.08, now());
insert into cliente_sedes (id, cliente_id, nombre, latitud, longitud)
values ('00000000-0000-0000-0000-0000000070e1', '00000000-0000-0000-0000-0000000070d1', 'Sede norte', 4.7, -74.05);

-- ============================================================ 1) NIT y DV
insert into resultado (prueba, esperado, resultado)
select '1a DV de la DIAN: 800197268 → 4 (y con guion igual)', '4 / 4',
  pg_temp.valor($q$select fn_dv_nit('800197268') || ' / ' || fn_dv_nit('800.197.268-4')$q$);

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000070a0');
insert into resultado (prueba, esperado, resultado)
select '1b NIT con el DV pegado: se separa', '999000702 / 7',
  pg_temp.valor($q$with n as (insert into clientes (id, nombre, tipo_documento, nit) values
                  ('00000000-0000-0000-0000-0000000070d2', '__NIT pegado 70__', '31', '999000702-7') returning nit, dv)
                  select nit || ' / ' || dv from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1c NIT sin DV: se calcula', '999000703 / 4',
  pg_temp.valor($q$with n as (insert into clientes (id, nombre, tipo_documento, nit) values
                  ('00000000-0000-0000-0000-0000000070d3', '__NIT sin DV 70__', '31', '999000703') returning nit, dv)
                  select nit || ' / ' || dv from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1d DV que no corresponde: se rechaza', 'contiene: no corresponde al NIT', pg_temp.intentar($q$
  insert into clientes (nombre, tipo_documento, nit, dv) values ('__DV malo 70__', '31', '999000704', '5')$q$);
insert into resultado (prueba, esperado, resultado)
select '1e cédula (13): no se le calcula DV', '(vacío)',
  pg_temp.valor($q$with n as (insert into clientes (id, nombre, tipo_documento, nit, tipo_persona) values
                  ('00000000-0000-0000-0000-0000000070d4', '__Cédula 70__', '13', '999000704', 'natural') returning dv)
                  select dv from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1f código DANE de 4 dígitos', 'contiene: clientes_municipio_dane', pg_temp.intentar($q$
  update clientes set municipio_dane = '1100' where id = '00000000-0000-0000-0000-0000000070d4'$q$);
insert into resultado (prueba, esperado, resultado)
select '1g tipo de documento fuera de la lista DIAN', 'contiene: clientes_tipo_documento', pg_temp.intentar($q$
  update clientes set tipo_documento = '99' where id = '00000000-0000-0000-0000-0000000070d4'$q$);

-- ============================================================ 2) sedes
insert into resultado (prueba, esperado, resultado)
select '2a Comercial "trabajar" agrega una sede', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into cliente_sedes (cliente_id, nombre, municipio_dane) values ('00000000-0000-0000-0000-0000000070d2', 'Bodega', '11001')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000070b0');
insert into resultado (prueba, esperado, resultado)
select '2b Comercial "consultar" ve las sedes', '2', pg_temp.valor($q$select count(*)::text from cliente_sedes
  where cliente_id::text like '00000000-0000-0000-0000-0000000070d%'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c Comercial "consultar" no agrega sedes', 'contiene: row-level security', pg_temp.intentar($q$
  insert into cliente_sedes (cliente_id, nombre) values ('00000000-0000-0000-0000-0000000070d2', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d Comercial "consultar" no edita sedes', 'aceptado (0 filas)', pg_temp.intentar($q$
  update cliente_sedes set nombre = 'x' where id = '00000000-0000-0000-0000-0000000070e1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000070c0');
insert into resultado (prueba, esperado, resultado)
select '2e el técnico (sin Comercial) no ve sedes', '0', pg_temp.valor($q$select count(*)::text from cliente_sedes$q$);
insert into resultado (prueba, esperado, resultado)
select '2f nadie borra sedes (se desactivan)', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from cliente_sedes where id = '00000000-0000-0000-0000-0000000070e1'$q$);

-- ============================================================ 3) importación
select pg_temp.como('00000000-0000-0000-0000-0000000070b0');
insert into resultado (prueba, esperado, resultado)
select '3a Comercial "consultar" no importa', 'contiene: requiere Comercial', pg_temp.intentar($q$
  select fn_importar_clientes('[{"nit": "999000705", "nombre": "x"}]', 'siigo.xlsx', '{}')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000070a0');
insert into resultado (prueba, esperado, resultado)
select '3b un campo que no es importable (la ubicación): se rechaza', 'contiene: no es un campo importable', pg_temp.intentar($q$
  select fn_importar_clientes('[{"nit": "999000701", "latitud": "1"}]', 'siigo.xlsx', '{}')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c un cliente nuevo sin nombre: se rechaza', 'contiene: necesita nombre', pg_temp.intentar($q$
  select fn_importar_clientes('[{"nit": "999000705", "telefono": "300"}]', 'siigo.xlsx', '{}')$q$);
insert into resultado (prueba, esperado, resultado)
select '3d importa: el existente (con DV pegado) se actualiza, el nuevo se crea', '{"filas": 2, "creados": 1, "actualizados": 1}',
  pg_temp.valor($q$select fn_importar_clientes(
    '[{"nit": "999000701-1", "nombre": "  Cliente existente SIIGO  ", "telefono": "6015550000", "email": "", "contacto": null,
       "tipo_documento": "31", "dv": "1", "declarante_renta": true, "responsabilidades_rut": ["O-13", "O-23"]},
      {"nit": "999000705", "nombre": "Cliente nuevo SIIGO", "tipo_documento": "31", "municipio_dane": "11001", "responsabilidades_rut": []}]',
    'clientes_siigo.xlsx', '{"Identificación": "nit", "Nombre": "nombre"}')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '3e lo que SIIGO trae se escribe (sin espacios sobrantes)', 'Cliente existente SIIGO / 6015550000 / 31 / 1 / true / {O-13,O-23}',
  pg_temp.valor($q$select nombre || ' / ' || telefono || ' / ' || tipo_documento || ' / ' || dv || ' / ' || declarante_renta || ' / ' || responsabilidades_rut::text
                  from clientes where id = '00000000-0000-0000-0000-0000000070d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f lo que SIIGO no trae NO se borra (correo vacío, contacto nulo, ubicación)', 'existe@invalid.local / Pedro / 4.600000 / -74.080000',
  pg_temp.valor($q$select email || ' / ' || contacto || ' / ' || latitud::text || ' / ' || longitud::text
                  from clientes where id = '00000000-0000-0000-0000-0000000070d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g la sede del existente sigue igual', 'Sede norte / 4.700000',
  pg_temp.valor($q$select nombre || ' / ' || latitud::text from cliente_sedes where id = '00000000-0000-0000-0000-0000000070e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3h el nuevo queda con DV calculado y lista RUT vacía sin inventar', '999000705 / 9 / 11001 / (sin)',
  pg_temp.valor($q$select nit || ' / ' || dv || ' / ' || municipio_dane || ' / ' || coalesce(responsabilidades_rut::text, '(sin)')
                  from clientes where nit = '999000705'$q$);
insert into resultado (prueba, esperado, resultado)
select '3i queda registro de quién importó qué', 'clientes_siigo.xlsx / 2 / 1 / 1 / C / nit',
  pg_temp.valor($q$select archivo_nombre || ' / ' || filas || ' / ' || creados || ' / ' || actualizados || ' / '
                  || case when importado_por = '00000000-0000-0000-0000-0000000070a0' then 'C' else '?' end || ' / ' || (mapeo ->> 'Identificación')
                  from importaciones_clientes where archivo_nombre = 'clientes_siigo.xlsx'$q$);
insert into resultado (prueba, esperado, resultado)
select '3j el registro no se cambia', 'aceptado (0 filas)', pg_temp.intentar($q$
  update importaciones_clientes set filas = 0 where archivo_nombre = 'clientes_siigo.xlsx'$q$);
insert into resultado (prueba, esperado, resultado)
select '3k una fila con DV malo frena TODA la importación (nada a medias)', 'contiene: no corresponde al NIT', pg_temp.intentar($q$
  select fn_importar_clientes('[{"nit": "999000703", "telefono": "1"}, {"nit": "999000702", "tipo_documento": "31", "dv": "0"}]', 'malo.xlsx', '{}')$q$);
insert into resultado (prueba, esperado, resultado)
select '3l ... y la primera fila no quedó escrita', '(vacío) / 0',
  pg_temp.valor($q$select coalesce(telefono, '(vacío)') || ' / ' || (select count(*) from importaciones_clientes where archivo_nombre = 'malo.xlsx')
                  from clientes where id = '00000000-0000-0000-0000-0000000070d3'$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '3m anónimo no ejecuta la importación', 'false',
  pg_temp.valor($q$select has_function_privilege('anon', 'fn_importar_clientes(jsonb, text, jsonb)', 'execute')::text$q$);

-- ============================================================ limpieza (admin)
delete from importaciones_clientes where importado_por = '00000000-0000-0000-0000-0000000070a0';
delete from cliente_sedes where cliente_id::text like '00000000-0000-0000-0000-0000000070d%';
delete from clientes where id::text like '00000000-0000-0000-0000-0000000070d%' or nit like '99900070%';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000070_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Comercial prueba 70__', '__consulta prueba 70__'));
delete from roles where nombre in ('__Comercial prueba 70__', '__consulta prueba 70__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000070_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

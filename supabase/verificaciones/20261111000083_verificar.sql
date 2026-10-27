-- Verificación de la migración 83 (SG-SST: firman todos los técnicos que estuvieron en la obra).
-- Correr DESPUÉS de la migración. Crea una plantilla, dos formatos y dos usuarios de prueba y
-- BORRA todo al final. Todas las filas deben decir OK.
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

-- El insert de una firma de prueba.
create or replace function pg_temp.firma(p_formato text, p_rol text, p_nombre text, p_doc text, p_n int)
returns text language sql as $$
  select format('insert into sst_formato_firmas (formato_id, rol, nombre, documento, empresa, imagen_path, imagen_sha256, firmada_en_dispositivo) '
                || 'values (%L, %L, %L, %L, %L, %L, repeat(%L, 64), now())',
                p_formato, p_rol, p_nombre, p_doc, 'Servielectro', 'formatos/' || p_formato || '/firma-' || p_n || '.png', 'a');
$$;

-- ============================================================ personas de prueba (admin)
-- G = gestión SST ("responsable"). S = SST en obra ("trabajar").
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000083a0', 'authenticated', 'authenticated', 'gestion.83@invalid.local'),
  ('00000000-0000-0000-0000-0000000083b0', 'authenticated', 'authenticated', 'obra.83@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__SST gestion 83__'), ('__SST obra 83__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'sgsst', case r.nombre when '__SST gestion 83__' then 'responsable' else 'trabajar' end::nivel_permiso, false
from roles r where r.nombre in ('__SST gestion 83__', '__SST obra 83__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000083a0', '__SST gestion 83__', '__G 83__'),
             ('00000000-0000-0000-0000-0000000083b0', '__SST obra 83__', '__S 83__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- Plantilla publicada y un formato "de antes" (sin lista) que ya tiene la firma de un técnico,
-- con el hash calculado como lo hacía la 75. Se siembran como admin.
insert into sst_plantillas (id, codigo, nombre, estado, publicada_en, campos, firmas) values
  ('00000000-0000-0000-0000-0000000083e1', '__SST-83__', 'ATS prueba 83', 'publicada', now(),
   '[{"id": "trabajo", "tipo": "texto", "etiqueta": "Trabajo a realizar", "obligatorio": true}]',
   '[{"rol": "tecnico", "etiqueta": "Técnicos"}, {"rol": "responsable_sst", "etiqueta": "Responsable SST"}, {"rol": "sst_cliente", "etiqueta": "SST del cliente"}]')
on conflict (id) do nothing;
insert into sst_formatos (id, plantilla_id, respuestas, creado_por) values
  ('00000000-0000-0000-0000-0000000083f9', '00000000-0000-0000-0000-0000000083e1', '{"trabajo": "antes"}', '00000000-0000-0000-0000-0000000083b0')
on conflict (id) do nothing;
insert into sst_formato_firmas (formato_id, rol, nombre, documento, imagen_path, imagen_sha256, firmada_en_dispositivo, registrada_por, hash_contenido)
select f.id, 'tecnico', 'Viejo', '500', 'formatos/00000000-0000-0000-0000-0000000083f9/firma-1.png', repeat('a', 64), now(), f.creado_por,
       encode(sha256(convert_to(jsonb_build_object('plantilla', f.plantilla_id, 'proyecto', f.proyecto_id, 'cliente', f.cliente_id,
              'lugar', f.lugar, 'fecha', f.fecha, 'respuestas', f.respuestas, 'archivos', '[]'::jsonb)::text, 'UTF8')), 'hex')
from sst_formatos f where f.id = '00000000-0000-0000-0000-0000000083f9';

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000083b0');

-- ============================================================ 1) la lista
insert into resultado (prueba, esperado, resultado)
select '1a el hash de un formato sin lista no cambió (lo ya sellado sigue íntegro)', 'sí',
  pg_temp.valor($q$select case when fn_sst_hash_formato('00000000-0000-0000-0000-0000000083f9') =
    (select hash_contenido from sst_formato_firmas where formato_id = '00000000-0000-0000-0000-0000000083f9') then 'sí' else 'no' end$q$);
insert into resultado (prueba, esperado, resultado)
select '1b formato nuevo, con lo obligatorio lleno', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into sst_formatos (id, plantilla_id, respuestas) values ('00000000-0000-0000-0000-0000000083f1', '00000000-0000-0000-0000-0000000083e1', '{"trabajo": "Cambio de cámara"}')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c firmar sin la lista de técnicos', 'contiene: anota los técnicos que estuvieron en la obra',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f1', 'responsable_sst', 'Laura', '2000', 1));
insert into resultado (prueba, esperado, resultado)
select '1d lista con una cédula repetida (una con puntos)', 'contiene: está repetida', pg_temp.intentar($q$
  update sst_formatos set tecnicos_en_obra = '[{"nombre": "Camilo", "documento": "1.000"}, {"nombre": "Otro", "documento": "1000"}]'
  where id = '00000000-0000-0000-0000-0000000083f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e lista sin cédula', 'contiene: Falta la cédula de Pedro', pg_temp.intentar($q$
  update sst_formatos set tecnicos_en_obra = '[{"nombre": "Pedro", "documento": " "}]' where id = '00000000-0000-0000-0000-0000000083f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f lista de dos técnicos', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_formatos set tecnicos_en_obra = '[{"nombre": "Camilo García", "documento": "1.000"}, {"nombre": "Pedro Ruiz", "documento": "1001"}]'
  where id = '00000000-0000-0000-0000-0000000083f1'$q$);

-- ============================================================ 2) las firmas
insert into resultado (prueba, esperado, resultado)
select '2a firma un técnico que no está en la lista', 'contiene: no está en la lista',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f1', 'tecnico', 'Intruso', '9999', 1));
insert into resultado (prueba, esperado, resultado)
select '2b firma Camilo (cédula escrita sin puntos)', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f1', 'tecnico', 'Camilo García', '1000', 2));
insert into resultado (prueba, esperado, resultado)
select '2c Camilo no firma dos veces', 'contiene: ya firmó',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f1', 'tecnico', 'Camilo García', '1000', 3));
insert into resultado (prueba, esperado, resultado)
select '2d con una firma, la lista quedó sellada', 'contiene: la lista de técnicos quedó sellada', pg_temp.intentar($q$
  update sst_formatos set tecnicos_en_obra = '[{"nombre": "Camilo García", "documento": "1000"}]' where id = '00000000-0000-0000-0000-0000000083f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e firman el responsable SST y el SST del cliente', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f1', 'responsable_sst', 'Laura SST', '2000', 4)) || ' / ' ||
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f1', 'sst_cliente', 'Ana Cliente', '3000', 5));
insert into resultado (prueba, esperado, resultado)
select '2f cerrar sin la firma de Pedro: dice quién falta', 'contiene: Faltan firmas de técnicos que estuvieron en la obra: Pedro Ruiz', pg_temp.intentar($q$
  update sst_formatos set estado = 'firmado' where id = '00000000-0000-0000-0000-0000000083f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g firma Pedro', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f1', 'tecnico', 'Pedro Ruiz', '1001', 6));
insert into resultado (prueba, esperado, resultado)
select '2h con todos, se cierra y queda íntegro', 'aceptado (1 filas) / true',
  pg_temp.intentar($q$update sst_formatos set estado = 'firmado' where id = '00000000-0000-0000-0000-0000000083f1'$q$)
  || ' / ' || pg_temp.valor($q$select fn_sst_formato_integro('00000000-0000-0000-0000-0000000083f1')::text$q$);

-- La lista entra al hash: si alguien la cambia por fuera de las reglas (aquí, como admin), se nota.
reset role;
update sst_formatos set tecnicos_en_obra = '[{"nombre": "Camilo García", "documento": "1000"}]' where id = '00000000-0000-0000-0000-0000000083f1';
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000083b0');
insert into resultado (prueba, esperado, resultado)
select '2i cambiada la lista por fuera, el formato ya no es íntegro', 'false',
  pg_temp.valor($q$select fn_sst_formato_integro('00000000-0000-0000-0000-0000000083f1')::text$q$);

-- ============================================================ 3) formatos de antes
insert into resultado (prueba, esperado, resultado)
select '3a formato de antes (sin lista): sigue la regla de la 75, recibe firmas y cierra', 'aceptado (1 filas) / aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f9', 'responsable_sst', 'Laura SST', '2000', 2)) || ' / ' ||
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000083f9', 'sst_cliente', 'Ana Cliente', '3000', 3)) || ' / ' ||
  pg_temp.intentar($q$update sst_formatos set estado = 'firmado' where id = '00000000-0000-0000-0000-0000000083f9'$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '3b anónimo no lee la lista de técnicos', 'false',
  pg_temp.valor($q$select has_function_privilege('anon', 'fn_sst_tecnicos_de(uuid)', 'execute')::text$q$);

-- ============================================================ limpieza (admin)
delete from sst_formato_firmas where formato_id::text like '00000000-0000-0000-0000-0000000083f%';
delete from sst_formatos where id::text like '00000000-0000-0000-0000-0000000083f%';
delete from sst_plantillas where codigo = '__SST-83__';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000083_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__SST gestion 83__', '__SST obra 83__'));
delete from roles where nombre in ('__SST gestion 83__', '__SST obra 83__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000083_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

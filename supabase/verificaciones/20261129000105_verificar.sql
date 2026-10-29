-- Verificación de la migración 105 (actas de obra para SG-SST).
-- OJO al tocar fn_sst_hash_formato: el cuerpo del hash quedó byte a byte igual al de la 88 (solo
-- cambió el where). Cambiar una coma de ese jsonb_build_object marca como alteradas todas las actas
-- ya selladas. Al aplicarla (2026-10-30) no había actas selladas: la de Tintalá seguía en borrador. Correr DESPUÉS de la migración,
-- todo junto. Crea una obra, una plantilla de Proyectos y tres actas (firmada, borrador, anulada)
-- con una firma y una foto, y usuarios de prueba; BORRA todo al final. Todo debe decir OK.
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

-- S = SG-SST "consultar" (como Victoria, sin Proyectos). P = Proyectos "consultar". T = Técnicos.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001050a0', 'authenticated', 'authenticated', 'sst.105@invalid.local'),
  ('00000000-0000-0000-0000-0000001050b0', 'authenticated', 'authenticated', 'proy.105@invalid.local'),
  ('00000000-0000-0000-0000-0000001050c0', 'authenticated', 'authenticated', 'tecnico.105@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__SST 105__'), ('__Proy 105__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, v.modulo, 'consultar', false
from (values ('__SST 105__', 'sgsst'), ('__Proy 105__', 'proyectos')) v(rol, modulo)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000001050a0', '__SST 105__', '__S 105__'),
             ('00000000-0000-0000-0000-0000001050b0', '__Proy 105__', '__P 105__'),
             ('00000000-0000-0000-0000-0000001050c0', 'Técnicos', '__T 105__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- Obra, plantilla de Proyectos y tres actas (como admin: los disparadores dejan pasar a postgres).
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000001050e0', '__PRY-105__', '__Obra prueba 105__')
on conflict (id) do nothing;
insert into sst_plantillas (id, codigo, nombre, ambito, estado, campos, firmas) values
  ('00000000-0000-0000-0000-0000001050f0', '__PRY-105__', '__Acta prueba 105__', 'proyectos', 'publicada',
   '[{"id": "a", "tipo": "texto", "etiqueta": "Observaciones"}]', '[]')
on conflict (id) do nothing;
insert into sst_formatos (id, plantilla_id, proyecto_id, ambito, fecha, lugar, respuestas, estado, creado_por, hash_contenido, motivo_anulacion) values
  ('00000000-0000-0000-0000-0000001050d1', '00000000-0000-0000-0000-0000001050f0', '00000000-0000-0000-0000-0000001050e0', 'proyectos', '2026-10-27', 'Obra', '{"a": "ok"}', 'firmado', '00000000-0000-0000-0000-0000001050b0', 'x', null),
  ('00000000-0000-0000-0000-0000001050d2', '00000000-0000-0000-0000-0000001050f0', '00000000-0000-0000-0000-0000001050e0', 'proyectos', '2026-10-28', 'Obra', '{}', 'borrador', '00000000-0000-0000-0000-0000001050b0', null, null),
  ('00000000-0000-0000-0000-0000001050d3', '00000000-0000-0000-0000-0000001050f0', '00000000-0000-0000-0000-0000001050e0', 'proyectos', '2026-10-26', 'Obra', '{}', 'anulado', '00000000-0000-0000-0000-0000001050b0', 'y', 'Se llenó sobre la obra equivocada')
on conflict (id) do nothing;
insert into sst_formato_firmas (id, formato_id, rol, nombre, documento, cargo, imagen_path, imagen_sha256, firmada_en_dispositivo, registrada_por, hash_contenido) values
  ('00000000-0000-0000-0000-0000001050c1', '00000000-0000-0000-0000-0000001050d1', 'sst_cliente', 'Contratante', '123', 'Administrador',
   'formatos/00000000-0000-0000-0000-0000001050d1/firma-1.png', repeat('a', 64), now() - interval '1 hour', '00000000-0000-0000-0000-0000001050b0', 'x')
on conflict (id) do nothing;
insert into sst_formato_archivos (id, formato_id, campo_id, path, sha256, mime, subido_por)
select '00000000-0000-0000-0000-0000001050c2', '00000000-0000-0000-0000-0000001050d1', 'a',
       'formatos/00000000-0000-0000-0000-0000001050d1/foto.jpg', repeat('b', 64), 'image/jpeg', '00000000-0000-0000-0000-0000001050b0'
where not exists (select 1 from sst_formato_archivos where id = '00000000-0000-0000-0000-0000001050c2');

set local role authenticated;

-- ============================================================ 1) SG-SST ve lo firmado, nada más
select pg_temp.como('00000000-0000-0000-0000-0000001050a0');
insert into resultado (prueba, esperado, resultado)
select '1a S ve la firmada y la anulada, NO el borrador', 'anulado, firmado',
  pg_temp.valor($q$select string_agg(estado, ', ' order by estado) from sst_formatos where proyecto_id = '00000000-0000-0000-0000-0000001050e0'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b S ve la firma del acta', '1', pg_temp.valor($q$select count(*)::text from sst_formato_firmas where formato_id = '00000000-0000-0000-0000-0000001050d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c S ve el archivo del acta', '1', pg_temp.valor($q$select count(*)::text from sst_formato_archivos where formato_id = '00000000-0000-0000-0000-0000001050d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d S ve la plantilla con que se llenó', '1', pg_temp.valor($q$select count(*)::text from sst_plantillas where id = '00000000-0000-0000-0000-0000001050f0'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e S ve el nombre de la obra (y solo ese dato)', '__PRY-105__ · __Obra prueba 105__',
  pg_temp.valor($q$select codigo || ' · ' || nombre from fn_sgsst_obras_de_actas() where id = '00000000-0000-0000-0000-0000001050e0'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f S no lee la tabla proyectos', '0', pg_temp.valor($q$select count(*)::text from proyectos where id = '00000000-0000-0000-0000-0000001050e0'$q$);
insert into resultado (prueba, esperado, resultado)
select '1g fotos y firmas en Storage: del acta firmada sí, del borrador no', 'true / false',
  pg_temp.valor($q$select fn_sst_archivo_visible('formatos/00000000-0000-0000-0000-0000001050d1/foto.jpg')::text || ' / ' ||
                          fn_sst_archivo_visible('formatos/00000000-0000-0000-0000-0000001050d2/foto.jpg')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1h S puede calcular el sello (antes de la 105: vacío)', 'calculado',
  pg_temp.valor($q$select case when fn_sst_hash_formato('00000000-0000-0000-0000-0000001050d1') is not null then 'calculado' end$q$);
insert into resultado (prueba, esperado, resultado)
select '1i la integridad le responde (aquí false: el sello de prueba es falso)', 'false',
  pg_temp.valor($q$select fn_sst_formato_integro('00000000-0000-0000-0000-0000001050d1')::text$q$);

-- ============================================================ 2) solo lectura
insert into resultado (prueba, esperado, resultado)
select '2a S no aprueba ni cambia el acta (sin política de update para ella: 0 filas, ver 2e)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update sst_formatos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000001050d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b S no agrega firmas al acta (la regla de firma de la 95 lo frena)', 'contiene: No tienes permiso para firmar', pg_temp.intentar($q$
  insert into sst_formato_firmas (formato_id, rol, nombre, documento, imagen_path, imagen_sha256, firmada_en_dispositivo)
  values ('00000000-0000-0000-0000-0000001050d1', 'otro', 'x', '1', 'formatos/00000000-0000-0000-0000-0000001050d1/firma-9.png', repeat('c', 64), now())$q$);
insert into resultado (prueba, esperado, resultado)
select '2c S no sube archivos al acta', 'false',
  pg_temp.valor($q$select fn_sst_archivo_subible('formatos/00000000-0000-0000-0000-0000001050d1/otra.jpg')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '2d S no crea actas de Proyectos', 'contiene: row-level security', pg_temp.intentar($q$
  insert into sst_formatos (plantilla_id, proyecto_id, fecha, lugar) values ('00000000-0000-0000-0000-0000001050f0', '00000000-0000-0000-0000-0000001050e0', '2026-10-29', 'x')$q$);

insert into resultado (prueba, esperado, resultado)
select '2e … y es porque ninguna política de update de sst_formatos la incluye (eso frena, no el 0)', 'false',
  pg_temp.valor($q$select fn_plantillas_permiso('proyectos', 'trabajar')::text$q$);

-- ============================================================ 3) a los demás no les cambia nada
select pg_temp.como('00000000-0000-0000-0000-0000001050b0');
insert into resultado (prueba, esperado, resultado)
select '3a Proyectos sigue viendo las tres (borrador incluido)', '3',
  pg_temp.valor($q$select count(*)::text from sst_formatos where proyecto_id = '00000000-0000-0000-0000-0000001050e0'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001050c0');
insert into resultado (prueba, esperado, resultado)
select '3b el técnico sigue sin ver ninguna', '0',
  pg_temp.valor($q$select count(*)::text from sst_formatos where proyecto_id = '00000000-0000-0000-0000-0000001050e0'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c el técnico no ve las obras de las actas', '0', pg_temp.valor($q$select count(*)::text from fn_sgsst_obras_de_actas()$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '3d anon no ejecuta las funciones nuevas', 'false / false',
  has_function_privilege('anon', 'public.fn_sgsst_obras_de_actas()', 'execute')::text || ' / ' ||
  has_function_privilege('anon', 'public.fn_sgsst_ve_acta_id(uuid)', 'execute')::text;

-- ============================================================ limpieza (admin)
delete from sst_formato_archivos where formato_id::text like '00000000-0000-0000-0000-0000001050d_';
delete from sst_formato_firmas where formato_id::text like '00000000-0000-0000-0000-0000001050d_';
delete from sst_formatos where id::text like '00000000-0000-0000-0000-0000001050d_';
delete from sst_plantillas where id = '00000000-0000-0000-0000-0000001050f0';
delete from proyectos where id = '00000000-0000-0000-0000-0000001050e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000001050_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__SST 105__', '__Proy 105__'));
delete from roles where nombre in ('__SST 105__', '__Proy 105__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000001050_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

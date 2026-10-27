-- Verificación de la migración 75 (SG-SST: plantillas, formatos sellados con firmas, plan de trabajo).
-- Correr DESPUÉS de la migración, todo junto. Prueba: solo la gestión arma y publica plantillas, la
-- base valida los campos y una publicada no se edita (versión nueva); el SST de obra llena, la base
-- exige lo obligatorio antes de la primera firma, y desde ahí el contenido queda sellado; cada firma
-- guarda quién, cuándo (dispositivo y servidor), desde dónde y el hash; cerrar exige todas las
-- firmas; si alguien altera el contenido por fuera, el sello lo delata; nada se borra; el plan
-- arranca vacío. Crea personas, plantillas y formatos de prueba y BORRA todo antes del resultado.
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
-- G = gestión SST (sgsst "responsable"). S = SST en obra ("trabajar"). K = "consultar". T = técnico (sin SG-SST).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000075a0', 'authenticated', 'authenticated', 'gestion.75@invalid.local'),
  ('00000000-0000-0000-0000-0000000075b0', 'authenticated', 'authenticated', 'obra.75@invalid.local'),
  ('00000000-0000-0000-0000-0000000075c0', 'authenticated', 'authenticated', 'consulta.75@invalid.local'),
  ('00000000-0000-0000-0000-0000000075d0', 'authenticated', 'authenticated', 'tecnico.75@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__SST gestion 75__'), ('__SST obra 75__'), ('__SST consulta 75__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'sgsst', case r.nombre when '__SST gestion 75__' then 'responsable' when '__SST obra 75__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__SST gestion 75__', '__SST obra 75__', '__SST consulta 75__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000075a0', '__SST gestion 75__', '__G 75__'),
  ('00000000-0000-0000-0000-0000000075b0', '__SST obra 75__', '__S 75__'),
  ('00000000-0000-0000-0000-0000000075c0', '__SST consulta 75__', '__K 75__'),
  ('00000000-0000-0000-0000-0000000075d0', 'Técnicos', '__T 75__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

insert into resultado (prueba, esperado, resultado)
select '0a el rol Administrador tiene SG-SST', 'sí',
  pg_temp.valor($q$select case when exists (select 1 from permisos_rol pr join roles r on r.id = pr.rol_id
                  where r.nombre = 'Administrador' and pr.modulo_id = 'sgsst') then 'sí' else 'no' end$q$);

set local role authenticated;
-- ============================================================ 1) plantillas
select pg_temp.como('00000000-0000-0000-0000-0000000075b0');
insert into resultado (prueba, esperado, resultado)
select '1a el SST de obra no arma plantillas', 'contiene: row-level security', pg_temp.intentar($q$
  insert into sst_plantillas (codigo, nombre) values ('X', 'X')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000075a0');
insert into resultado (prueba, esperado, resultado)
select '1b un campo de un tipo que no existe', 'contiene: tipo que no existe', pg_temp.intentar($q$
  insert into sst_plantillas (codigo, nombre, campos) values ('__SST-75__', 'ATS prueba', '[{"id": "a", "tipo": "video", "etiqueta": "A"}]')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c una lista sin opciones', 'contiene: no tiene opciones', pg_temp.intentar($q$
  insert into sst_plantillas (codigo, nombre, campos) values ('__SST-75__', 'ATS prueba', '[{"id": "a", "tipo": "lista", "etiqueta": "Riesgos"}]')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d la gestión arma la plantilla en borrador (aunque la mande publicada)', 'borrador / 1',
  pg_temp.valor($q$with n as (insert into sst_plantillas (id, codigo, nombre, estado, campos) values
    ('00000000-0000-0000-0000-0000000075e1', '__SST-75__', 'ATS prueba', 'publicada',
     '[{"id": "sec1", "tipo": "seccion", "etiqueta": "Datos del trabajo"},
       {"id": "trabajo", "tipo": "texto", "etiqueta": "Trabajo a realizar", "obligatorio": true},
       {"id": "riesgos", "tipo": "lista", "etiqueta": "Riesgos", "opciones": ["Altura", "Eléctrico"], "multiple": true},
       {"id": "foto_area", "tipo": "foto", "etiqueta": "Foto del área", "obligatorio": true},
       {"id": "epp", "tipo": "tabla", "etiqueta": "EPP", "columnas": [{"id": "elemento", "tipo": "texto", "etiqueta": "Elemento"}, {"id": "ok", "tipo": "si_no", "etiqueta": "Bueno"}]}]')
    returning estado, version) select estado || ' / ' || version from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1e publicar sin pedir firmas', 'contiene: no pide ninguna firma', pg_temp.intentar($q$
  update sst_plantillas set estado = 'publicada' where id = '00000000-0000-0000-0000-0000000075e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f con firmas, se publica (queda quién)', 'publicada / G',
  pg_temp.valor($q$with n as (update sst_plantillas set estado = 'publicada', firmas =
    '[{"rol": "tecnico", "etiqueta": "Técnico que ejecuta"}, {"rol": "responsable_sst", "etiqueta": "Responsable SST"}, {"rol": "sst_cliente", "etiqueta": "SST del cliente"}]'
    where id = '00000000-0000-0000-0000-0000000075e1' returning estado, publicada_por)
    select estado || ' / ' || case when publicada_por = '00000000-0000-0000-0000-0000000075a0' then 'G' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1g publicada no se edita', 'contiene: Crea una versión nueva', pg_temp.intentar($q$
  update sst_plantillas set nombre = 'Otro' where id = '00000000-0000-0000-0000-0000000075e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1h versión nueva: mismo código, versión 2, en borrador', '__SST-75__ / 2 / borrador',
  pg_temp.valor($q$with n as (insert into sst_plantillas (id, codigo, nombre, plantilla_anterior_id, campos, firmas) select
    '00000000-0000-0000-0000-0000000075e2', 'cualquiera', nombre, id, campos, firmas from sst_plantillas where id = '00000000-0000-0000-0000-0000000075e1'
    returning codigo, version, estado) select codigo || ' / ' || version || ' / ' || estado from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1i una plantilla no se borra', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from sst_plantillas where id = '00000000-0000-0000-0000-0000000075e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '1j archivar sin motivo', 'contiene: Escribe por qué se archiva', pg_temp.intentar($q$
  update sst_plantillas set estado = 'archivada' where id = '00000000-0000-0000-0000-0000000075e2'$q$);

-- ============================================================ 2) formato llenado en obra
select pg_temp.como('00000000-0000-0000-0000-0000000075b0');
insert into resultado (prueba, esperado, resultado)
select '2a no se llena una plantilla en borrador', 'contiene: Solo se llenan plantillas publicadas', pg_temp.intentar($q$
  insert into sst_formatos (plantilla_id) values ('00000000-0000-0000-0000-0000000075e2')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b el SST de obra crea el formato (nace borrador, a su nombre)', 'borrador / S',
  pg_temp.valor($q$with n as (insert into sst_formatos (id, plantilla_id, lugar, estado) values
    ('00000000-0000-0000-0000-0000000075f1', '00000000-0000-0000-0000-0000000075e1', 'Torre 2, piso 8', 'aprobado') returning estado, creado_por)
    select estado || ' / ' || case when creado_por = '00000000-0000-0000-0000-0000000075b0' then 'S' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2c firmar con lo obligatorio vacío: dice qué falta', 'contiene: falta llenar: Trabajo a realizar, Foto del área', pg_temp.intentar($q$
  insert into sst_formato_firmas (formato_id, rol, nombre, documento, imagen_path, imagen_sha256, firmada_en_dispositivo)
  values ('00000000-0000-0000-0000-0000000075f1', 'tecnico', 'Camilo', '1000', 'formatos/00000000-0000-0000-0000-0000000075f1/firma-1.png', repeat('a', 64), now())$q$);
insert into resultado (prueba, esperado, resultado)
select '2d llena las respuestas y sube la foto', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$update sst_formatos set respuestas = '{"trabajo": "Cambio de cámara en fachada", "riesgos": ["Altura"], "epp": [{"elemento": "Arnés", "ok": true}]}'
    where id = '00000000-0000-0000-0000-0000000075f1'$q$) || ' / ' ||
  pg_temp.intentar($q$insert into sst_formato_archivos (formato_id, campo_id, path, sha256) values
    ('00000000-0000-0000-0000-0000000075f1', 'foto_area', 'formatos/00000000-0000-0000-0000-0000000075f1/foto_area-1.jpg', repeat('b', 64))$q$);
-- Desde la migración 83, antes de firmar se anotan los técnicos que estuvieron en la obra.
do $g$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sst_formatos' and column_name = 'tecnicos_en_obra') then
    execute $x$update sst_formatos set tecnicos_en_obra = '[{"nombre": "Camilo García", "documento": "1000"}]' where id = '00000000-0000-0000-0000-0000000075f1'$x$;
  end if;
end $g$;
insert into resultado (prueba, esperado, resultado)
select '2e firma el técnico: la base pone quién, cuándo y el hash del contenido', 'S / sí / sí',
  pg_temp.valor($q$with n as (insert into sst_formato_firmas (formato_id, rol, nombre, documento, imagen_path, imagen_sha256, firmada_en_dispositivo, dispositivo, gps_estado, lat, lng, registrada_por, hash_contenido)
    values ('00000000-0000-0000-0000-0000000075f1', 'tecnico', 'Camilo García', '1000', 'formatos/00000000-0000-0000-0000-0000000075f1/firma-1.png', repeat('a', 64), now() - interval '2 hours', 'Android Chrome', 'concedido', 4.6, -74.08,
            '00000000-0000-0000-0000-0000000075a0', 'inventado')
    returning registrada_por, recibida_en, hash_contenido)
    select case when registrada_por = '00000000-0000-0000-0000-0000000075b0' then 'S' else '?' end || ' / ' ||
           case when recibida_en >= now() - interval '1 minute' then 'sí' else 'no' end || ' / ' ||
           case when hash_contenido = fn_sst_hash_formato('00000000-0000-0000-0000-0000000075f1') then 'sí' else 'no' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2f con una firma, el contenido queda sellado', 'contiene: quedó sellado', pg_temp.intentar($q$
  update sst_formatos set respuestas = respuestas || '{"trabajo": "Otra cosa"}' where id = '00000000-0000-0000-0000-0000000075f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g ni recibe fotos nuevas', 'contiene: quedó sellado', pg_temp.intentar($q$
  insert into sst_formato_archivos (formato_id, campo_id, path, sha256) values
    ('00000000-0000-0000-0000-0000000075f1', 'foto_area', 'formatos/00000000-0000-0000-0000-0000000075f1/foto_area-2.jpg', repeat('c', 64))$q$);
insert into resultado (prueba, esperado, resultado)
select '2h cerrar sin la firma del SST del cliente', 'contiene: Faltan firmas para cerrarlo: Responsable SST, SST del cliente', pg_temp.intentar($q$
  update sst_formatos set estado = 'firmado' where id = '00000000-0000-0000-0000-0000000075f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2h2 firman el responsable SST y el SST del cliente', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into sst_formato_firmas (formato_id, rol, nombre, documento, empresa, imagen_path, imagen_sha256, firmada_en_dispositivo) values
  ('00000000-0000-0000-0000-0000000075f1', 'responsable_sst', 'Laura SST', '2000', 'Servielectro', 'formatos/00000000-0000-0000-0000-0000000075f1/firma-2.png', repeat('d', 64), now()),
  ('00000000-0000-0000-0000-0000000075f1', 'sst_cliente', 'Ana Cliente', '3000', 'Conjunto Tintalá', 'formatos/00000000-0000-0000-0000-0000000075f1/firma-3.png', repeat('e', 64), now())$q$);
insert into resultado (prueba, esperado, resultado)
select '2i con todas las firmas se cierra, sellado e íntegro', 'firmado / sí / true',
  pg_temp.valor($q$with n as (update sst_formatos set estado = 'firmado' where id = '00000000-0000-0000-0000-0000000075f1' returning estado, sellado_en)
    select estado || ' / ' || case when sellado_en is not null then 'sí' else 'no' end from n$q$)
  || ' / ' || pg_temp.valor($q$select fn_sst_formato_integro('00000000-0000-0000-0000-0000000075f1')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '2j cerrado no recibe más firmas', 'contiene: ya está cerrado', pg_temp.intentar($q$
  insert into sst_formato_firmas (formato_id, rol, nombre, documento, imagen_path, imagen_sha256, firmada_en_dispositivo)
  values ('00000000-0000-0000-0000-0000000075f1', 'otro', 'X', '9', 'formatos/00000000-0000-0000-0000-0000000075f1/firma-9.png', repeat('f', 64), now())$q$);
insert into resultado (prueba, esperado, resultado)
select '2k una firma no se cambia ni se borra', 'aceptado (0 filas) / aceptado (0 filas)',
  pg_temp.intentar($q$update sst_formato_firmas set nombre = 'Otro' where formato_id = '00000000-0000-0000-0000-0000000075f1'$q$) || ' / ' ||
  pg_temp.intentar($q$delete from sst_formato_firmas where formato_id = '00000000-0000-0000-0000-0000000075f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2l el SST de obra no aprueba', 'contiene: Solo la gestión SST aprueba', pg_temp.intentar($q$
  update sst_formatos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000075f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2l2 otro formato, listo para firmar', 'aceptado (1 filas) / aceptado (1 filas)', pg_temp.intentar($q$
  insert into sst_formatos (id, plantilla_id, respuestas) values ('00000000-0000-0000-0000-0000000075f2', '00000000-0000-0000-0000-0000000075e1', '{"trabajo": "x"}')$q$) || ' / ' || pg_temp.intentar($q$
  insert into sst_formato_archivos (formato_id, campo_id, path, sha256) values
  ('00000000-0000-0000-0000-0000000075f2', 'foto_area', 'formatos/00000000-0000-0000-0000-0000000075f2/a.jpg', repeat('1', 64))$q$);
-- Desde la migración 83, antes de firmar se anotan los técnicos que estuvieron en la obra.
do $g$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sst_formatos' and column_name = 'tecnicos_en_obra') then
    execute $x$update sst_formatos set tecnicos_en_obra = '[{"nombre": "X", "documento": "9"}]' where id = '00000000-0000-0000-0000-0000000075f2'$x$;
  end if;
end $g$;
insert into resultado (prueba, esperado, resultado)
select '2m firma con la hora del celular adelantada', 'contiene: está adelantada', pg_temp.intentar($q$
  insert into sst_formato_firmas (formato_id, rol, nombre, documento, imagen_path, imagen_sha256, firmada_en_dispositivo)
  values ('00000000-0000-0000-0000-0000000075f2', 'tecnico', 'X', '9', 'formatos/00000000-0000-0000-0000-0000000075f2/firma-1.png', repeat('f', 64), now() + interval '1 day')$q$);
insert into resultado (prueba, esperado, resultado)
select '2n sube archivos al formato en borrador; al cerrado no', 'aceptado (1 filas) / RECHAZADO',
  pg_temp.intentar($q$insert into storage.objects (bucket_id, name) values ('sgsst', 'formatos/00000000-0000-0000-0000-0000000075f2/x.jpg')$q$) || ' / ' ||
  split_part(pg_temp.intentar($q$insert into storage.objects (bucket_id, name) values ('sgsst', 'formatos/00000000-0000-0000-0000-0000000075f1/x.jpg')$q$), ' ', 1);
insert into resultado (prueba, esperado, resultado)
select '2o un formato no se borra', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from sst_formatos where id = '00000000-0000-0000-0000-0000000075f2'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000075a0');
insert into resultado (prueba, esperado, resultado)
select '2p la gestión aprueba (queda quién)', 'aprobado / G',
  pg_temp.valor($q$with n as (update sst_formatos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000075f1' returning estado, aprobado_por)
    select estado || ' / ' || case when aprobado_por = '00000000-0000-0000-0000-0000000075a0' then 'G' else '?' end from n$q$);
reset role;
-- Alguien con acceso directo a la base cambia el contenido a escondidas (saltándose las reglas).
update sst_formatos set respuestas = respuestas || '{"trabajo": "Alterado"}' where id = '00000000-0000-0000-0000-0000000075f1';
set local role authenticated;
insert into resultado (prueba, esperado, resultado)
select '2q si alguien altera el contenido por fuera, el sello lo delata', 'false',
  pg_temp.valor($q$select fn_sst_formato_integro('00000000-0000-0000-0000-0000000075f1')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '2r anular sin motivo', 'contiene: Escribe por qué se anula', pg_temp.intentar($q$
  update sst_formatos set estado = 'anulado' where id = '00000000-0000-0000-0000-0000000075f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2s anular con motivo; anulado ya no cambia', 'aceptado (1 filas) / contiene',
  pg_temp.intentar($q$update sst_formatos set estado = 'anulado', motivo_anulacion = 'Contenido alterado fuera del ERP' where id = '00000000-0000-0000-0000-0000000075f1'$q$) || ' / ' ||
  case when pg_temp.intentar($q$update sst_formatos set motivo_anulacion = 'x' where id = '00000000-0000-0000-0000-0000000075f1'$q$) like '%anulado: no cambia%' then 'contiene' else 'NO' end;

-- ============================================================ 3) plan de trabajo
insert into resultado (prueba, esperado, resultado)
select '3a la gestión agrega un ítem (vacío de estándares hasta que lo armen)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into sst_plan_items (id, estandar, responsable_id, fecha_limite) values
    ('00000000-0000-0000-0000-0000000075a1', '__Estándar de prueba__', '00000000-0000-0000-0000-0000000075b0', '2026-12-31')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000075b0');
insert into resultado (prueba, esperado, resultado)
select '3b el SST de obra no agrega ítems', 'contiene: row-level security', pg_temp.intentar($q$
  insert into sst_plan_items (estandar) values ('x')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c ... pero sí carga el avance', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_plan_items set avance = 40 where id = '00000000-0000-0000-0000-0000000075a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d ... y no mueve la fecha límite', 'contiene: los cambia la gestión SST', pg_temp.intentar($q$
  update sst_plan_items set fecha_limite = '2027-06-30' where id = '00000000-0000-0000-0000-0000000075a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3e sube una evidencia y la anula con motivo', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$insert into sst_plan_evidencias (id, item_id, descripcion, path) values
    ('00000000-0000-0000-0000-0000000075a2', '00000000-0000-0000-0000-0000000075a1', 'Acta', 'plan/00000000-0000-0000-0000-0000000075a1/acta.pdf')$q$) || ' / ' ||
  pg_temp.intentar($q$update sst_plan_evidencias set motivo_anulacion = 'Era otra acta' where id = '00000000-0000-0000-0000-0000000075a2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f una evidencia anulada no cambia', 'contiene: anulada: no cambia', pg_temp.intentar($q$
  update sst_plan_evidencias set descripcion = 'x' where id = '00000000-0000-0000-0000-0000000075a2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g el SST de obra no archiva ítems', 'contiene: Solo la gestión SST archiva', pg_temp.intentar($q$
  update sst_plan_items set archivado_en = now(), motivo_archivo = 'x' where id = '00000000-0000-0000-0000-0000000075a1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000075a0');
insert into resultado (prueba, esperado, resultado)
select '3h la gestión archiva con motivo; archivado no cambia', 'aceptado (1 filas) / contiene',
  pg_temp.intentar($q$update sst_plan_items set archivado_en = now(), motivo_archivo = 'Ya no aplica' where id = '00000000-0000-0000-0000-0000000075a1'$q$) || ' / ' ||
  case when pg_temp.intentar($q$update sst_plan_items set avance = 90 where id = '00000000-0000-0000-0000-0000000075a1'$q$) like '%archivado: no cambia%' then 'contiene' else 'NO' end;
insert into resultado (prueba, esperado, resultado)
select '3i el plan no se borra', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from sst_plan_items where id = '00000000-0000-0000-0000-0000000075a1'$q$);

-- ============================================================ 4) quién ve
select pg_temp.como('00000000-0000-0000-0000-0000000075c0');
insert into resultado (prueba, esperado, resultado)
select '4a "consultar" ve plantillas y formatos, no llena', '2 / 2 / RECHAZADO',
  pg_temp.valor($q$select (select count(*) from sst_plantillas where codigo = '__SST-75__')::text || ' / ' ||
                  (select count(*) from sst_formatos where id::text like '00000000-0000-0000-0000-0000000075f%')::text$q$) || ' / ' ||
  split_part(pg_temp.intentar($q$insert into sst_formatos (plantilla_id) values ('00000000-0000-0000-0000-0000000075e1')$q$), ' ', 1);
select pg_temp.como('00000000-0000-0000-0000-0000000075d0');
insert into resultado (prueba, esperado, resultado)
select '4b el técnico sin SG-SST no ve nada', '0 / 0',
  pg_temp.valor($q$select (select count(*) from sst_plantillas)::text || ' / ' || (select count(*) from sst_formatos)::text$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '4c anónimo no ve formatos', 'false',
  pg_temp.valor($q$select has_table_privilege('anon', 'sst_formatos', 'select')::text$q$);

-- ============================================================ limpieza (admin)
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'sgsst' and name like 'formatos/00000000-0000-0000-0000-0000000075f%';
delete from sst_plan_evidencias where item_id = '00000000-0000-0000-0000-0000000075a1';
delete from sst_plan_items where id = '00000000-0000-0000-0000-0000000075a1';
delete from sst_formato_firmas where formato_id::text like '00000000-0000-0000-0000-0000000075f%';
delete from sst_formato_archivos where formato_id::text like '00000000-0000-0000-0000-0000000075f%';
delete from sst_formatos where id::text like '00000000-0000-0000-0000-0000000075f%';
delete from sst_plantillas where plantilla_anterior_id is not null and codigo = '__SST-75__';
delete from sst_plantillas where codigo = '__SST-75__';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000075_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__SST gestion 75__', '__SST obra 75__', '__SST consulta 75__'));
delete from roles where nombre in ('__SST gestion 75__', '__SST obra 75__', '__SST consulta 75__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000075_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

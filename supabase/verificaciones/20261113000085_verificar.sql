-- Verificación de la migración 85 (motor de plantillas por ámbito: actas de Proyectos).
-- Correr DESPUÉS de la migración (y de la 83). Además de esta, volver a correr las de la 75 y la 83:
-- lo de SG-SST no puede cambiar. Crea usuarios, un proyecto, plantillas y actas de prueba y BORRA
-- todo al final. Todas las filas deben decir OK.
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

create or replace function pg_temp.firma(p_formato text, p_rol text, p_nombre text, p_doc text, p_n int)
returns text language sql as $$
  select format('insert into sst_formato_firmas (formato_id, rol, nombre, documento, empresa, imagen_path, imagen_sha256, firmada_en_dispositivo) '
                || 'values (%L, %L, %L, %L, %L, %L, repeat(%L, 64), now())',
                p_formato, p_rol, p_nombre, p_doc, 'Servielectro', 'formatos/' || p_formato || '/firma-' || p_n || '.png', 'a');
$$;

-- ============================================================ 0) lo de antes no cambió
insert into resultado (prueba, esperado, resultado)
-- (Se excluye la plantilla "Acta de reunión" que siembra la migración 86, si ya corrió. Si alguien ya
-- armó plantillas o llenó actas de Proyectos, esta fila deja de aplicar: es para correr recién migrada.)
select '0a lo que ya existía quedó en el ámbito SG-SST', '0 / 0',
  pg_temp.valor($q$select (select count(*) from sst_plantillas where ambito <> 'sgsst' and id <> '00000000-0000-4000-8000-0000000086a1')::text || ' / ' ||
                          (select count(*) from sst_formatos where ambito <> 'sgsst')::text$q$);

-- ============================================================ personas, proyecto (admin)
-- P = Proyectos "responsable" (arma y aprueba). Q = Proyectos "trabajar" (llena). S = SG-SST "responsable".
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000085a0', 'authenticated', 'authenticated', 'proy-resp.85@invalid.local'),
  ('00000000-0000-0000-0000-0000000085b0', 'authenticated', 'authenticated', 'proy-trab.85@invalid.local'),
  ('00000000-0000-0000-0000-0000000085c0', 'authenticated', 'authenticated', 'sst.85@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy resp 85__'), ('__Proy trab 85__'), ('__SST 85__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, v.modulo, v.nivel::nivel_permiso, false
from (values ('__Proy resp 85__', 'proyectos', 'responsable'), ('__Proy trab 85__', 'proyectos', 'trabajar'), ('__SST 85__', 'sgsst', 'responsable')) v(rol, modulo, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000085a0', '__Proy resp 85__', '__P 85__'),
             ('00000000-0000-0000-0000-0000000085b0', '__Proy trab 85__', '__Q 85__'),
             ('00000000-0000-0000-0000-0000000085c0', '__SST 85__', '__S 85__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000085e0', '__PRY-85__', '__Obra prueba 85__')
on conflict (id) do nothing;

set local role authenticated;
-- ============================================================ 1) plantillas de actas
select pg_temp.como('00000000-0000-0000-0000-0000000085a0');
insert into resultado (prueba, esperado, resultado)
select '1a Proyectos arma la plantilla del acta de inicio', 'proyectos / borrador',
  pg_temp.valor($q$with n as (insert into sst_plantillas (id, ambito, codigo, nombre, campos, firmas) values
    ('00000000-0000-0000-0000-0000000085d1', 'proyectos', '__ACTA-85__', 'Acta de inicio prueba',
     '[{"id": "objeto", "tipo": "texto", "etiqueta": "Objeto del contrato", "obligatorio": true}]',
     '[{"rol": "tecnico", "etiqueta": "Técnicos"}, {"rol": "responsable_sst", "etiqueta": "Por Servielectro"}, {"rol": "sst_cliente", "etiqueta": "Por el cliente"}]')
    returning ambito, estado) select ambito || ' / ' || estado from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1b Proyectos no ve las plantillas de SG-SST', '0',
  pg_temp.valor($q$select count(*)::text from sst_plantillas where ambito = 'sgsst'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c Proyectos no arma plantillas de SG-SST', 'contiene: row-level security', pg_temp.intentar($q$
  insert into sst_plantillas (ambito, codigo, nombre) values ('sgsst', '__X-85__', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d la publica', 'publicada', pg_temp.valor($q$with n as (update sst_plantillas set estado = 'publicada'
  where id = '00000000-0000-0000-0000-0000000085d1' returning estado) select estado from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1e el ámbito no cambia', 'contiene: El ámbito de una plantilla no cambia', pg_temp.intentar($q$
  update sst_plantillas set ambito = 'sgsst' where id = '00000000-0000-0000-0000-0000000085d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f una versión nueva hereda el ámbito', 'proyectos / 2',
  pg_temp.valor($q$with n as (insert into sst_plantillas (id, ambito, codigo, nombre, plantilla_anterior_id, campos, firmas)
    select '00000000-0000-0000-0000-0000000085d2', 'proyectos', 'x', nombre, id, campos, firmas from sst_plantillas where id = '00000000-0000-0000-0000-0000000085d1'
    returning ambito, version) select ambito || ' / ' || version from n$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000085c0');
insert into resultado (prueba, esperado, resultado)
select '1g SG-SST no ve las plantillas de Proyectos', '0',
  pg_temp.valor($q$select count(*)::text from sst_plantillas where ambito = 'proyectos'$q$);
insert into resultado (prueba, esperado, resultado)
select '1h SG-SST no arma plantillas de Proyectos', 'contiene: row-level security', pg_temp.intentar($q$
  insert into sst_plantillas (ambito, codigo, nombre) values ('proyectos', '__Y-85__', 'y')$q$);

-- ============================================================ 2) el acta en la obra
select pg_temp.como('00000000-0000-0000-0000-0000000085b0');
insert into resultado (prueba, esperado, resultado)
select '2a un acta sin obra, no', 'contiene: elige el proyecto', pg_temp.intentar($q$
  insert into sst_formatos (plantilla_id) values ('00000000-0000-0000-0000-0000000085d1')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b el acta toma el ámbito de su plantilla (aunque mande otro)', 'proyectos / borrador',
  pg_temp.valor($q$with n as (insert into sst_formatos (id, plantilla_id, proyecto_id, ambito, respuestas, tecnicos_en_obra) values
    ('00000000-0000-0000-0000-0000000085f1', '00000000-0000-0000-0000-0000000085d1', '00000000-0000-0000-0000-0000000085e0', 'sgsst',
     '{"objeto": "CCTV torre 2"}', '[{"nombre": "Camilo", "documento": "1000"}]')
    returning ambito, estado) select ambito || ' / ' || estado from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2c firman los tres y se cierra', 'aceptado (1 filas) / aceptado (1 filas) / aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000085f1', 'tecnico', 'Camilo', '1000', 1)) || ' / ' ||
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000085f1', 'responsable_sst', 'Jhojan', '2000', 2)) || ' / ' ||
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000085f1', 'sst_cliente', 'Administradora', '3000', 3)) || ' / ' ||
  pg_temp.intentar($q$update sst_formatos set estado = 'firmado' where id = '00000000-0000-0000-0000-0000000085f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d sellado e íntegro', 'true', pg_temp.valor($q$select fn_sst_formato_integro('00000000-0000-0000-0000-0000000085f1')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '2e quien llena no aprueba', 'contiene: Solo el responsable de Proyectos aprueba', pg_temp.intentar($q$
  update sst_formatos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000085f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f el ámbito de un acta no cambia', 'contiene: El ámbito de un formato no cambia', pg_temp.intentar($q$
  update sst_formatos set ambito = 'sgsst' where id = '00000000-0000-0000-0000-0000000085f1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000085a0');
insert into resultado (prueba, esperado, resultado)
select '2g el responsable de Proyectos la aprueba', 'aprobado', pg_temp.valor($q$with n as (update sst_formatos set estado = 'aprobado'
  where id = '00000000-0000-0000-0000-0000000085f1' returning estado) select estado from n$q$);

-- ============================================================ 3) ni una cosa ve la otra
select pg_temp.como('00000000-0000-0000-0000-0000000085c0');
insert into resultado (prueba, esperado, resultado)
select '3a SG-SST no ve el acta, ni sus firmas, ni su hash, ni su lista de técnicos', '0 / 0 / (vacío) / (vacío)',
  pg_temp.valor($q$select (select count(*) from sst_formatos where id = '00000000-0000-0000-0000-0000000085f1')::text || ' / ' ||
                          (select count(*) from sst_formato_firmas where formato_id = '00000000-0000-0000-0000-0000000085f1')::text$q$) || ' / ' ||
  pg_temp.valor($q$select fn_sst_hash_formato('00000000-0000-0000-0000-0000000085f1')$q$) || ' / ' ||
  pg_temp.valor($q$select fn_sst_tecnicos_de('00000000-0000-0000-0000-0000000085f1')::text$q$);
-- Otra acta, en borrador, para probar los archivos. La crea quien llena actas (Proyectos
-- "trabajar"), como en la obra, no el admin.
select pg_temp.como('00000000-0000-0000-0000-0000000085b0');
insert into resultado (prueba, esperado, resultado)
select '3b0 Proyectos crea otra acta: queda en borrador y en Proyectos', 'borrador / proyectos',
  pg_temp.valor($q$with n as (insert into sst_formatos (id, plantilla_id, proyecto_id) values
    ('00000000-0000-0000-0000-0000000085f2', '00000000-0000-0000-0000-0000000085d1', '00000000-0000-0000-0000-0000000085e0')
    returning estado, ambito) select estado || ' / ' || ambito from n$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000085c0');
-- El aislamiento por ámbito se prueba con lo que SG-SST VE: el acta en borrador no le aparece.
insert into resultado (prueba, esperado, resultado)
select '3b1 SG-SST no ve el acta en borrador de Proyectos', '0',
  pg_temp.valor($q$select count(*)::text from sst_formatos where id = '00000000-0000-0000-0000-0000000085f2'$q$);
-- La firma se rechaza. Con la 85 el mensaje es "El formato ya está cerrado" (mentira: está en
-- borrador; fn_sst_firma_reglas corre como quien firma y no lo ve). La 88 lo cambia por
-- "No tienes permiso para firmar formatos de Proyectos" y su verificación aprieta el esperado.
insert into resultado (prueba, esperado, resultado)
select '3b SG-SST no firma un acta de Proyectos en borrador', 'contiene: RECHAZADO',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000085f2', 'otro', 'X', '9', 9));
insert into resultado (prueba, esperado, resultado)
select '3c SG-SST no sube archivos a un acta (borrador) de Proyectos', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('sgsst', 'formatos/00000000-0000-0000-0000-0000000085f2/x.jpg')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000085b0');
insert into resultado (prueba, esperado, resultado)
select '3d quien llena actas sí sube al acta en borrador', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('sgsst', 'formatos/00000000-0000-0000-0000-0000000085f2/x.jpg')$q$);
insert into resultado (prueba, esperado, resultado)
select '3e Proyectos no ve los formatos ni los archivos de SG-SST', '0 / 0',
  pg_temp.valor($q$select (select count(*) from sst_formatos where ambito = 'sgsst')::text || ' / ' ||
                          (select count(*) from storage.objects o where o.bucket_id = 'sgsst' and o.name like 'formatos/%'
                             and not exists (select 1 from sst_formatos f where f.id::text = split_part(o.name, '/', 2) and f.ambito = 'proyectos'))::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000085c0');
insert into resultado (prueba, esperado, resultado)
select '3f SG-SST no ve el archivo del acta', '0',
  pg_temp.valor($q$select count(*)::text from storage.objects where bucket_id = 'sgsst' and name like 'formatos/00000000-0000-0000-0000-0000000085f2/%'$q$);
reset role;

-- ============================================================ limpieza (admin)
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'sgsst' and name like 'formatos/00000000-0000-0000-0000-0000000085f%';
delete from sst_formato_firmas where formato_id::text like '00000000-0000-0000-0000-0000000085f%';
delete from sst_formatos where id::text like '00000000-0000-0000-0000-0000000085f%';
delete from sst_plantillas where plantilla_anterior_id is not null and codigo = '__ACTA-85__';
delete from sst_plantillas where codigo = '__ACTA-85__';
delete from proyectos where id = '00000000-0000-0000-0000-0000000085e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000085_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy resp 85__', '__Proy trab 85__', '__SST 85__'));
delete from roles where nombre in ('__Proy resp 85__', '__Proy trab 85__', '__SST 85__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000085_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

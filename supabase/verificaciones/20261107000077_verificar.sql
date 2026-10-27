-- Verificación de la migración 77 (SG-SST: reporte de acto o condición insegura, accidentes e
-- incidentes, plazos como parámetro). Correr DESPUÉS de la 75, la 76 y la 77, todo junto. Prueba:
-- ningún plazo viene cargado y solo la gestión los carga; cualquiera reporta con foto, ve el suyo y
-- en qué va, sin poder editarlo; SG-SST lo atiende y cierra con la acción; el accidente usa la misma
-- persona de RRHH (sin abrir la ficha), su reporte a la ARL queda una vez, no se cierra sin la
-- investigación firmada; avisos sin datos sensibles; nada se borra. Crea y BORRA todo lo de prueba.
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
-- T = técnico (sin SG-SST). S = SST en obra ("trabajar"). G = gestión SST ("responsable").
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000077a0', 'authenticated', 'authenticated', 'tecnico.77@invalid.local'),
  ('00000000-0000-0000-0000-0000000077b0', 'authenticated', 'authenticated', 'obra.77@invalid.local'),
  ('00000000-0000-0000-0000-0000000077c0', 'authenticated', 'authenticated', 'gestion.77@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__SST obra 77__'), ('__SST gestion 77__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'sgsst', case r.nombre when '__SST gestion 77__' then 'responsable' else 'trabajar' end::nivel_permiso, false
from roles r where r.nombre in ('__SST obra 77__', '__SST gestion 77__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000077a0', 'Técnicos', 'Camilo Prueba77'),
             ('00000000-0000-0000-0000-0000000077b0', '__SST obra 77__', 'Laura Prueba77'),
             ('00000000-0000-0000-0000-0000000077c0', '__SST gestion 77__', 'Gestión Prueba77')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into empleados (id, perfil_id, primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base) values
  ('00000000-0000-0000-0000-0000000077e0', '00000000-0000-0000-0000-0000000077a0', 'Camilo', 'Prueba77', '1000000771', '2026-01-15', 1);

set local role authenticated;
-- ============================================================ 1) plazos: nombres sí, números no
select pg_temp.como('00000000-0000-0000-0000-0000000077b0');
insert into resultado (prueba, esperado, resultado)
select '1a la migración no trae ningún plazo cargado', '3 / 0',
  pg_temp.valor($q$select count(*)::text || ' / ' || count(dias)::text from fn_sst_plazos()$q$);
insert into resultado (prueba, esperado, resultado)
select '1b el SST de obra no carga plazos', 'contiene: row-level security', pg_temp.intentar($q$
  insert into sst_parametro_valores (clave, vigente_desde, dias, tipo_dias) values ('plazo_reporte_arl', '2026-01-01', 2, 'habiles')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000077c0');
insert into resultado (prueba, esperado, resultado)
select '1c la gestión lo carga con vigencia y tipo de días', 'aceptado (1 filas) / 2 habiles',
  pg_temp.intentar($q$insert into sst_parametro_valores (clave, vigente_desde, dias, tipo_dias, nota) values ('plazo_reporte_arl', '2026-01-01', 2, 'habiles', 'Prueba 77')$q$)
  || ' / ' || pg_temp.valor($q$select dias::text || ' ' || tipo_dias from fn_sst_plazos() where clave = 'plazo_reporte_arl'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d un plazo registrado no se cambia (ni por la gestión)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update sst_parametro_valores set dias = 5 where nota = 'Prueba 77'$q$);

-- ============================================================ 2) reporte de condición insegura
select pg_temp.como('00000000-0000-0000-0000-0000000077a0');
insert into resultado (prueba, esperado, resultado)
select '2a el técnico (sin SG-SST) reporta; nace "nuevo" a su nombre', 'nuevo / T',
  pg_temp.valor($q$with n as (insert into sst_reportes_inseguros (id, tipo, descripcion, lugar, gps_estado, lat, lng, estado, reportado_por)
                  values ('00000000-0000-0000-0000-0000000077d1', 'condicion', 'Escalera con peldaño roto', 'Torre 2', 'concedido', 4.6, -74.1, 'cerrado', '00000000-0000-0000-0000-0000000077b0')
                  returning estado, reportado_por) select estado || ' / ' || case when reportado_por = '00000000-0000-0000-0000-0000000077a0' then 'T' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2b agrega su foto (archivo y registro)', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$insert into storage.objects (bucket_id, name) values ('sgsst', 'reportes/00000000-0000-0000-0000-0000000077d1/f1.jpg')$q$) || ' / ' ||
  pg_temp.intentar($q$insert into sst_reporte_fotos (reporte_id, path, sha256) values ('00000000-0000-0000-0000-0000000077d1', 'reportes/00000000-0000-0000-0000-0000000077d1/f1.jpg', repeat('a', 64))$q$);
insert into resultado (prueba, esperado, resultado)
select '2c no lo edita ni lo cierra él mismo', 'aceptado (0 filas)', pg_temp.intentar($q$
  update sst_reportes_inseguros set descripcion = 'otra' where id = '00000000-0000-0000-0000-0000000077d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d ve el suyo y su foto', '1 / 1',
  pg_temp.valor($q$select (select count(*) from sst_reportes_inseguros)::text || ' / ' ||
                  (select count(*) from storage.objects where bucket_id = 'sgsst' and name like 'reportes/%77d1%')::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000077b0');
insert into resultado (prueba, esperado, resultado)
select '2e a SG-SST le llega el aviso, sin datos sensibles', 'Reportaron una condición insegura / Torre 2 · Camilo Prueba77',
  pg_temp.valor($q$select titulo || ' / ' || cuerpo from notificaciones where origen_id = '00000000-0000-0000-0000-0000000077d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f SG-SST no edita lo reportado', 'contiene: Lo reportado no se edita', pg_temp.intentar($q$
  update sst_reportes_inseguros set descripcion = 'otra' where id = '00000000-0000-0000-0000-0000000077d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g cerrar sin decir qué se hizo', 'contiene: sst_reporte_cierre', pg_temp.intentar($q$
  update sst_reportes_inseguros set estado = 'cerrado' where id = '00000000-0000-0000-0000-0000000077d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2h en gestión y luego cerrado con la acción', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$update sst_reportes_inseguros set estado = 'en_gestion' where id = '00000000-0000-0000-0000-0000000077d1'$q$) || ' / ' ||
  pg_temp.intentar($q$update sst_reportes_inseguros set estado = 'cerrado', accion_tomada = 'Se cambió la escalera' where id = '00000000-0000-0000-0000-0000000077d1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000077a0');
insert into resultado (prueba, esperado, resultado)
select '2i quien reportó ve en qué va (dos avisos) y la acción', 'Cerraron tu reporte de SST | Están atendiendo tu reporte de SST / Se cambió la escalera',
  pg_temp.valor($q$select (select string_agg(titulo, ' | ' order by titulo) from notificaciones where origen_id = '00000000-0000-0000-0000-0000000077d1')
                  || ' / ' || (select accion_tomada from sst_reportes_inseguros where id = '00000000-0000-0000-0000-0000000077d1')$q$);
insert into resultado (prueba, esperado, resultado)
select '2j cerrado ya no recibe fotos', 'contiene: Solo quien reportó agrega fotos', pg_temp.intentar($q$
  insert into sst_reporte_fotos (reporte_id, path, sha256) values ('00000000-0000-0000-0000-0000000077d1', 'reportes/00000000-0000-0000-0000-0000000077d1/f2.jpg', repeat('b', 64))$q$);
insert into resultado (prueba, esperado, resultado)
select '2k un reporte no se borra', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from sst_reportes_inseguros where id = '00000000-0000-0000-0000-0000000077d1'$q$);

-- ============================================================ 3) accidentes e incidentes
insert into resultado (prueba, esperado, resultado)
select '3a el técnico sin SG-SST no registra accidentes', 'contiene: row-level security', pg_temp.intentar($q$
  insert into sst_eventos (tipo, ocurrido_en, descripcion, afectado_nombre) values ('accidente', now(), 'x', 'x')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000077b0');
insert into resultado (prueba, esperado, resultado)
select '3b un accidente sin a quién le pasó', 'contiene: sst_evento_afectado', pg_temp.intentar($q$
  insert into sst_eventos (tipo, ocurrido_en, descripcion) values ('accidente', now(), 'Caída')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c el SST registra el accidente de un empleado (la misma ficha de RRHH)', 'abierto',
  pg_temp.valor($q$with n as (insert into sst_eventos (id, tipo, ocurrido_en, descripcion, empleado_id, lugar, estado)
                  values ('00000000-0000-0000-0000-0000000077f1', 'accidente', now() - interval '1 day', 'Golpe con escalera', '00000000-0000-0000-0000-0000000077e0', 'Torre 2', 'cerrado')
                  returning estado) select estado from n$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000077c0');
insert into resultado (prueba, esperado, resultado)
select '3d a la gestión le llega urgente (al que lo registró no: fue él)', 'Se registró un accidente de trabajo / URGENTE',
  pg_temp.valor($q$select titulo || ' / ' || case when urgente then 'URGENTE' else 'normal' end from notificaciones
                  where origen_id = '00000000-0000-0000-0000-0000000077f1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000077b0');
insert into resultado (prueba, esperado, resultado)
select '3e el SST ve el nombre del afectado por la función de personal, no la ficha', 'Camilo Prueba77 / 0',
  pg_temp.valor($q$select (select nombre from fn_sst_personal() where id = '00000000-0000-0000-0000-0000000077e0') || ' / ' ||
                  (select count(*) from empleados where id = '00000000-0000-0000-0000-0000000077e0')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '3f registra el reporte a la ARL', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_eventos set reportado_arl_en = now(), radicado_arl = 'ARL-123' where id = '00000000-0000-0000-0000-0000000077f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g el reporte a la ARL no se cambia', 'contiene: ya quedó registrado', pg_temp.intentar($q$
  update sst_eventos set radicado_arl = 'ARL-999' where id = '00000000-0000-0000-0000-0000000077f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3h reporte a la EPS anterior al evento', 'contiene: anterior al evento', pg_temp.intentar($q$
  update sst_eventos set reportado_eps_en = now() - interval '3 days' where id = '00000000-0000-0000-0000-0000000077f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3i cerrar sin investigar', 'contiene: Primero la investigación', pg_temp.intentar($q$
  update sst_eventos set estado = 'cerrado', nota_cierre = 'x' where id = '00000000-0000-0000-0000-0000000077f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3j investigado sin el formato firmado', 'contiene: formato de investigación ya firmado', pg_temp.intentar($q$
  update sst_eventos set estado = 'investigado' where id = '00000000-0000-0000-0000-0000000077f1'$q$);
reset role;
-- La plantilla de investigación la cargaría la SST; aquí una mínima de prueba, ya firmada (admin).
insert into sst_plantillas (id, codigo, nombre, campos, firmas, estado, publicada_en) values
  ('00000000-0000-0000-0000-0000000077a1', '__INV-77__', 'Investigación prueba', '[{"id": "causas", "tipo": "texto", "etiqueta": "Causas"}]',
   '[{"rol": "responsable_sst", "etiqueta": "Responsable SST"}]', 'publicada', now());
insert into sst_formatos (id, plantilla_id, respuestas, estado, creado_por, sellado_en, hash_contenido) values
  ('00000000-0000-0000-0000-0000000077a2', '00000000-0000-0000-0000-0000000077a1', '{"causas": "x"}', 'firmado', '00000000-0000-0000-0000-0000000077b0', now(), 'x');
set local role authenticated;
insert into resultado (prueba, esperado, resultado)
select '3k con el formato firmado queda investigado; luego se cierra con nota', 'aceptado (1 filas) / cerrado',
  pg_temp.intentar($q$update sst_eventos set estado = 'investigado', investigacion_formato_id = '00000000-0000-0000-0000-0000000077a2' where id = '00000000-0000-0000-0000-0000000077f1'$q$) || ' / ' ||
  pg_temp.valor($q$with n as (update sst_eventos set estado = 'cerrado', nota_cierre = 'Acciones cumplidas' where id = '00000000-0000-0000-0000-0000000077f1' returning estado) select estado from n$q$);
insert into resultado (prueba, esperado, resultado)
select '3l cerrado no cambia y no se borra', 'contiene / aceptado (0 filas)',
  case when pg_temp.intentar($q$update sst_eventos set descripcion = 'x' where id = '00000000-0000-0000-0000-0000000077f1'$q$) like '%no cambia%' then 'contiene' else 'NO' end
  || ' / ' || pg_temp.intentar($q$delete from sst_eventos where id = '00000000-0000-0000-0000-0000000077f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3m incidente sin afectado sí se registra; el SST de obra no lo anula', 'aceptado (1 filas) / contiene',
  pg_temp.intentar($q$insert into sst_eventos (id, tipo, ocurrido_en, descripcion) values ('00000000-0000-0000-0000-0000000077f2', 'incidente', now(), 'Casi cae una herramienta')$q$) || ' / ' ||
  case when pg_temp.intentar($q$update sst_eventos set estado = 'anulado', motivo_anulacion = 'x' where id = '00000000-0000-0000-0000-0000000077f2'$q$) like '%Solo la gestión SST anula%' then 'contiene' else 'NO' end;
select pg_temp.como('00000000-0000-0000-0000-0000000077a0');
insert into resultado (prueba, esperado, resultado)
select '3n el técnico no ve accidentes ni el personal', '0 / 0',
  pg_temp.valor($q$select (select count(*) from sst_eventos)::text || ' / ' || (select count(*) from fn_sst_personal())::text$q$);
reset role;

-- ============================================================ limpieza (admin)
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'sgsst' and name like 'reportes/00000000-0000-0000-0000-0000000077%';
delete from notificaciones where origen_id::text like '00000000-0000-0000-0000-000000007%';
delete from sst_evento_archivos where evento_id::text like '00000000-0000-0000-0000-0000000077f%';
delete from sst_eventos where id::text like '00000000-0000-0000-0000-0000000077f%';
delete from sst_formatos where id = '00000000-0000-0000-0000-0000000077a2';
delete from sst_plantillas where id = '00000000-0000-0000-0000-0000000077a1';
delete from sst_reporte_fotos where reporte_id = '00000000-0000-0000-0000-0000000077d1';
delete from sst_reportes_inseguros where id = '00000000-0000-0000-0000-0000000077d1';
delete from sst_parametro_valores where nota = 'Prueba 77';
delete from empleados where id = '00000000-0000-0000-0000-0000000077e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000077_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__SST obra 77__', '__SST gestion 77__'));
delete from roles where nombre in ('__SST obra 77__', '__SST gestion 77__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000077_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

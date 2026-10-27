-- Verificación de la migración 90 (documentos de proyecto, pólizas y amparos). Correr DESPUÉS de
-- la migración, todo junto. Crea usuarios, un proyecto, documentos, una póliza y archivos de
-- prueba; BORRA todo al final. Todas las filas deben decir OK.
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

-- Un documento de prueba (sha256 de relleno distinto por letra).
create or replace function pg_temp.doc(p_id text, p_tipo text, p_archivo text, p_letra text, p_reservado boolean)
returns text language sql as $$
  select format('insert into proyecto_documentos (id, proyecto_id, tipo, nombre, nombre_archivo, path, mime, bytes, sha256, reservado) '
                || 'values (%L, %L, %L, %L, %L, %L, %L, 1000, repeat(%L, 64), %L)',
                p_id, '00000000-0000-0000-0000-0000000090e0', p_tipo, p_archivo, p_archivo,
                '00000000-0000-0000-0000-0000000090e0/' || p_archivo, 'application/pdf', p_letra, p_reservado);
$$;

-- P = Proyectos "trabajar" SIN datos sensibles. R = Proyectos "responsable" CON datos sensibles.
-- T = rol Técnicos (sin Proyectos ni Comercial).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000090a0', 'authenticated', 'authenticated', 'proy-trab.90@invalid.local'),
  ('00000000-0000-0000-0000-0000000090b0', 'authenticated', 'authenticated', 'proy-resp.90@invalid.local'),
  ('00000000-0000-0000-0000-0000000090c0', 'authenticated', 'authenticated', 'tecnico.90@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy trab 90__'), ('__Proy resp 90__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'proyectos', v.nivel::nivel_permiso, v.sens
from (values ('__Proy trab 90__', 'trabajar', false), ('__Proy resp 90__', 'responsable', true)) v(rol, nivel, sens)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000090a0', '__Proy trab 90__', '__P 90__'),
             ('00000000-0000-0000-0000-0000000090b0', '__Proy resp 90__', '__R 90__'),
             ('00000000-0000-0000-0000-0000000090c0', 'Técnicos', '__T 90__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000090e0', '__PRY-90__', '__Obra prueba 90__')
on conflict (id) do nothing;

set local role authenticated;

-- ============================================================ 1) subir y ver
select pg_temp.como('00000000-0000-0000-0000-0000000090a0');
insert into resultado (prueba, esperado, resultado)
select '1a P sube el contrato firmado', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000000090d1', 'contrato_firmado', 'contrato.pdf', 'a', false));
insert into resultado (prueba, esperado, resultado)
select '1b … quedó con quien lo subió', 'true',
  pg_temp.valor($q$select (subido_por = '00000000-0000-0000-0000-0000000090a0')::text from proyecto_documentos where id = '00000000-0000-0000-0000-0000000090d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c P (sin datos sensibles) NO sube un documento reservado', 'RECHAZADO',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000000090d9', 'cotizacion', 'costos.xlsm', 'z', true));
insert into resultado (prueba, esperado, resultado)
select '1d el mismo archivo dos veces en el proyecto', 'contiene: uq_proyecto_documentos_sha',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000000090d8', 'otro', 'copia.pdf', 'a', false));
insert into resultado (prueba, esperado, resultado)
select '1e un path fuera de la carpeta del proyecto', 'contiene: proyecto_documentos_path', pg_temp.intentar($q$
  insert into proyecto_documentos (proyecto_id, tipo, nombre, nombre_archivo, path, mime, bytes, sha256)
  values ('00000000-0000-0000-0000-0000000090e0', 'otro', 'x', 'x.pdf', 'otra-carpeta/x.pdf', 'application/pdf', 1, repeat('y', 64))$q$);
insert into resultado (prueba, esperado, resultado)
select '1f un tipo que no está en el catálogo', 'RECHAZADO',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000000090d7', 'factura_inventada', 'f.pdf', 'x', false));

select pg_temp.como('00000000-0000-0000-0000-0000000090b0');
insert into resultado (prueba, esperado, resultado)
select '1g R (con datos sensibles) sube la cotización en Excel como reservada', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000000090d2', 'cotizacion', 'cotizacion.xlsm', 'b', true));
insert into resultado (prueba, esperado, resultado)
select '1h R ve los dos', '2', pg_temp.valor($q$select count(*)::text from proyecto_documentos where proyecto_id = '00000000-0000-0000-0000-0000000090e0'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000090a0');
insert into resultado (prueba, esperado, resultado)
select '1i P ve solo el no reservado', '1', pg_temp.valor($q$select count(*)::text from proyecto_documentos where proyecto_id = '00000000-0000-0000-0000-0000000090e0'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000090c0');
insert into resultado (prueba, esperado, resultado)
select '1j el técnico no ve ninguno', '0', pg_temp.valor($q$select count(*)::text from proyecto_documentos where proyecto_id = '00000000-0000-0000-0000-0000000090e0'$q$);

-- ============================================================ 2) no se cambia el archivo, se archiva con motivo
select pg_temp.como('00000000-0000-0000-0000-0000000090a0');
insert into resultado (prueba, esperado, resultado)
select '2a cambiar el archivo de un documento', 'contiene: no se cambia', pg_temp.intentar($q$
  update proyecto_documentos set sha256 = repeat('c', 64) where id = '00000000-0000-0000-0000-0000000090d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b P destapa un documento reservado', 'aceptado (0 filas)', pg_temp.intentar($q$
  update proyecto_documentos set reservado = false where id = '00000000-0000-0000-0000-0000000090d2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c P marca como reservado uno suyo', 'contiene: Solo quien ve datos sensibles', pg_temp.intentar($q$
  update proyecto_documentos set reservado = true where id = '00000000-0000-0000-0000-0000000090d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d archivar sin motivo', 'contiene: Escribe el motivo', pg_temp.intentar($q$
  update proyecto_documentos set archivado = true where id = '00000000-0000-0000-0000-0000000090d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e archivar con motivo', 'aceptado (1 filas)', pg_temp.intentar($q$
  update proyecto_documentos set archivado = true, motivo_archivo = 'Subido al proyecto equivocado' where id = '00000000-0000-0000-0000-0000000090d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f … queda quién lo archivó', 'true', pg_temp.valor($q$
  select (archivado_por = '00000000-0000-0000-0000-0000000090a0' and archivado_en is not null)::text from proyecto_documentos where id = '00000000-0000-0000-0000-0000000090d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g archivado, el mismo archivo se puede volver a subir', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000000090d3', 'contrato_firmado', 'contrato-bien.pdf', 'a', false));
insert into resultado (prueba, esperado, resultado)
select '2h un documento no se borra', 'RECHAZADO', pg_temp.intentar($q$
  delete from proyecto_documentos where id = '00000000-0000-0000-0000-0000000090d3'$q$);

-- ============================================================ 3) pólizas y amparos
insert into resultado (prueba, esperado, resultado)
select '3a P sube la póliza y su comprobante de pago', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000000090d4', 'poliza', 'poliza-cu.pdf', 'd', false)) || ' / ' ||
  pg_temp.intentar(pg_temp.doc('00000000-0000-0000-0000-0000000090d5', 'comprobante_pago_poliza', 'recibo.pdf', 'e', false));
insert into resultado (prueba, esperado, resultado)
select '3b una póliza sobre un documento que no es póliza', 'contiene: de tipo póliza', pg_temp.intentar($q$
  insert into proyecto_polizas (documento_id, aseguradora, numero) values ('00000000-0000-0000-0000-0000000090d3', 'Seguros del Estado', '63-45-X')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c el "pago" no es un comprobante', 'contiene: comprobante de pago de póliza', pg_temp.intentar($q$
  insert into proyecto_polizas (documento_id, aseguradora, numero, pago_documento_id)
  values ('00000000-0000-0000-0000-0000000090d4', 'Seguros del Estado', '63-45-X', '00000000-0000-0000-0000-0000000090d3')$q$);
insert into resultado (prueba, esperado, resultado)
select '3d la póliza con su pago', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into proyecto_polizas (id, documento_id, aseguradora, numero, ramo, prima_neta, gastos_expedicion, iva, total_pagar, valor_asegurado_total, pago_documento_id)
  values ('00000000-0000-0000-0000-0000000090f1', '00000000-0000-0000-0000-0000000090d4', 'Seguros del Estado', '63-45-PRUEBA-90', 'Cumplimiento particular',
          120000, 8000, 24320, 152320, 35638123.50, '00000000-0000-0000-0000-0000000090d5')$q$);
insert into resultado (prueba, esperado, resultado)
select '3e amparo con fechas pero sin fechas', 'contiene: proyecto_amparos_vigencia', pg_temp.intentar($q$
  insert into proyecto_poliza_amparos (poliza_id, amparo, valor_asegurado) values ('00000000-0000-0000-0000-0000000090f1', 'Cumplimiento', 5091160.50)$q$);
insert into resultado (prueba, esperado, resultado)
select '3f amparo con fechas', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into proyecto_poliza_amparos (poliza_id, amparo, valor_asegurado, vigencia_desde, vigencia_hasta)
  values ('00000000-0000-0000-0000-0000000090f1', 'Cumplimiento', 5091160.50, '2026-10-22', '2027-05-15')$q$);
insert into resultado (prueba, esperado, resultado)
select '3g amparo que empieza con el acta de entrega, sin duración', 'contiene: proyecto_amparos_vigencia', pg_temp.intentar($q$
  insert into proyecto_poliza_amparos (poliza_id, amparo, valor_asegurado, inicia_con)
  values ('00000000-0000-0000-0000-0000000090f1', 'Estabilidad de la obra', 6788214, 'acta_entrega')$q$);
insert into resultado (prueba, esperado, resultado)
select '3h … con su duración y sin fechas todavía', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into proyecto_poliza_amparos (poliza_id, amparo, valor_asegurado, inicia_con, duracion)
  values ('00000000-0000-0000-0000-0000000090f1', 'Estabilidad de la obra', 6788214, 'acta_entrega', '1 año, 0 meses y 24 días desde el acta de entrega')$q$);
insert into resultado (prueba, esperado, resultado)
select '3i la vista de vigencias: 2 amparos, 1 con días para vencer, póliza pagada', '2 / 1 / true', pg_temp.valor($q$
  select count(*)::text || ' / ' || count(dias_para_vencer)::text || ' / ' || bool_and(pagada)::text
  from v_proyecto_amparos_vigencia where poliza_id = '00000000-0000-0000-0000-0000000090f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3j un amparo no se borra', 'RECHAZADO', pg_temp.intentar($q$
  delete from proyecto_poliza_amparos where poliza_id = '00000000-0000-0000-0000-0000000090f1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000090c0');
insert into resultado (prueba, esperado, resultado)
select '3k el técnico no ve pólizas ni amparos', '0 / 0', pg_temp.valor($q$
  select (select count(*) from proyecto_polizas)::text || ' / ' || (select count(*) from proyecto_poliza_amparos)::text$q$);

-- ============================================================ 4) archivos del bucket
select pg_temp.como('00000000-0000-0000-0000-0000000090a0');
insert into resultado (prueba, esperado, resultado)
select '4a P sube a la carpeta de un proyecto que existe', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-proyectos', '00000000-0000-0000-0000-0000000090e0/contrato-bien.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '4b … a la carpeta de un proyecto que no existe', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-proyectos', '00000000-0000-0000-0000-0000000090ff/x.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '4c P ve el archivo de un documento visible', '1', pg_temp.valor($q$
  select count(*)::text from storage.objects where bucket_id = 'documentos-proyectos' and name = '00000000-0000-0000-0000-0000000090e0/contrato-bien.pdf'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000090b0');
insert into resultado (prueba, esperado, resultado)
select '4d R sube el Excel reservado', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-proyectos', '00000000-0000-0000-0000-0000000090e0/cotizacion.xlsm')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000090a0');
insert into resultado (prueba, esperado, resultado)
select '4e P NO ve el archivo del documento reservado', '0', pg_temp.valor($q$
  select count(*)::text from storage.objects where bucket_id = 'documentos-proyectos' and name = '00000000-0000-0000-0000-0000000090e0/cotizacion.xlsm'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000090c0');
insert into resultado (prueba, esperado, resultado)
select '4f el técnico no sube', 'contiene: row-level security', pg_temp.intentar($q$
  insert into storage.objects (bucket_id, name) values ('documentos-proyectos', '00000000-0000-0000-0000-0000000090e0/t.pdf')$q$);

-- ============================================================ 5) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '5a funciones de documentos de proyecto ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_proyecto_documento_visible', 'fn_proyecto_documentos_trabajar', 'fn_proyecto_archivo', 'fn_proyecto_documento_tipo',
                    'fn_proyecto_documentos_reglas', 'fn_proyecto_polizas_reglas', 'fn_proyecto_amparos_reglas')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '5b privilegios de anon en tablas y vista', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('proyecto_documentos', 'proyecto_polizas', 'proyecto_poliza_amparos', 'v_proyecto_amparos_vigencia');
insert into resultado (prueba, esperado, resultado)
select '5c el bucket es privado y de 15 MB', 'false / 15728640',
  (select public::text || ' / ' || file_size_limit::text from storage.buckets where id = 'documentos-proyectos');

-- ============================================================ limpieza (admin)
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'documentos-proyectos' and name like '00000000-0000-0000-0000-0000000090e0/%';
delete from proyecto_poliza_amparos where poliza_id = '00000000-0000-0000-0000-0000000090f1';
delete from proyecto_polizas where id = '00000000-0000-0000-0000-0000000090f1';
delete from proyecto_documentos where proyecto_id = '00000000-0000-0000-0000-0000000090e0';
delete from proyectos where id = '00000000-0000-0000-0000-0000000090e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000090_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy trab 90__', '__Proy resp 90__'));
delete from roles where nombre in ('__Proy trab 90__', '__Proy resp 90__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000090_0';

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

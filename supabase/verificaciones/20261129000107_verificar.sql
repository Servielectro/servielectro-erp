-- Verificación de la migración 107 (personal en SG-SST). Correr DESPUÉS de la migración, todo junto.
-- Crea usuarios, un empleado, un contratista y registros de prueba; BORRA todo al final. Todo OK.
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

-- S = SG-SST "trabajar" SIN datos sensibles. V = SG-SST "responsable" CON datos sensibles (como Victoria).
-- R = RRHH "trabajar". T = rol Técnicos.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001070a0', 'authenticated', 'authenticated', 'sst.107@invalid.local'),
  ('00000000-0000-0000-0000-0000001070b0', 'authenticated', 'authenticated', 'victoria.107@invalid.local'),
  ('00000000-0000-0000-0000-0000001070c0', 'authenticated', 'authenticated', 'rrhh.107@invalid.local'),
  ('00000000-0000-0000-0000-0000001070d0', 'authenticated', 'authenticated', 'tecnico.107@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__SST 107__'), ('__Victoria 107__'), ('__RRHH 107__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, v.modulo, v.nivel::nivel_permiso, v.sens
from (values ('__SST 107__', 'sgsst', 'trabajar', false), ('__Victoria 107__', 'sgsst', 'responsable', true),
             ('__RRHH 107__', 'rrhh', 'trabajar', false)) v(rol, modulo, nivel, sens)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000001070a0', '__SST 107__', '__S 107__'),
             ('00000000-0000-0000-0000-0000001070b0', '__Victoria 107__', '__V 107__'),
             ('00000000-0000-0000-0000-0000001070c0', '__RRHH 107__', '__R 107__'),
             ('00000000-0000-0000-0000-0000001070d0', 'Técnicos', '__T 107__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- Empleado, contratista y dos entregas (una de EPP y una herramienta), como admin.
insert into empleados (id, primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base, eps, arl) values
  ('00000000-0000-0000-0000-0000001070e1', '__Prueba', '107__', '__107__', '2026-01-01', 9999999, 'EPS X', 'ARL Y')
on conflict (id) do nothing;
insert into contratistas (id, nombre, numero_documento) values ('00000000-0000-0000-0000-0000001070f1', '__Contratista 107__', '__C107__')
on conflict (id) do nothing;
insert into dotacion_entregas (id, empleado_id, categoria, nombre, fecha_entrega) values
  ('00000000-0000-0000-0000-000000107d01', '00000000-0000-0000-0000-0000001070e1', 'epp', 'Arnés', '2026-10-01'),
  ('00000000-0000-0000-0000-000000107d02', '00000000-0000-0000-0000-0000001070e1', 'herramienta', 'Taladro', '2026-10-01')
on conflict (id) do nothing;

set local role authenticated;

-- ============================================================ 1) la ficha sin plata
select pg_temp.como('00000000-0000-0000-0000-0000001070a0');
insert into resultado (prueba, esperado, resultado)
select '1a S ve al empleado por la ficha de SG-SST (con su EPS y ARL)', '__Prueba 107__ / EPS X / ARL Y',
  pg_temp.valor($q$select nombre || ' / ' || eps || ' / ' || arl from fn_sst_personal_ficha() where id = '00000000-0000-0000-0000-0000001070e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b S NO lee la tabla de RRHH (ni el salario)', '0',
  pg_temp.valor($q$select count(*)::text from empleados where id = '00000000-0000-0000-0000-0000001070e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c la ficha de SG-SST no trae columnas de plata', 'false',
  pg_temp.valor($q$select (pg_get_function_result('public.fn_sst_personal_ficha()'::regprocedure) ~ 'salario|bonificacion|rodamiento')::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001070d0');
insert into resultado (prueba, esperado, resultado)
select '1d el técnico no ve el personal', '0', pg_temp.valor($q$select count(*)::text from fn_sst_personal_ficha()$q$);

-- ============================================================ 2) documentos: cada área lo suyo
select pg_temp.como('00000000-0000-0000-0000-0000001070a0');
insert into resultado (prueba, esperado, resultado)
select '2a S registra la aptitud (periódico, apto, énfasis alturas)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into persona_documentos (id, empleado_id, tipo, entidad, fecha_documento, vigente_desde, vence_en, examen, resultado, enfasis, custodia_ips)
  values ('00000000-0000-0000-0000-000000107a01', '00000000-0000-0000-0000-0000001070e1', 'aptitud_ocupacional', 'IPS prueba',
          '2026-10-01', '2026-10-01', '2027-10-01', 'periodico', 'apto', '{alturas}', 'IPS prueba')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b aptitud sin resultado', 'contiene: persona_documentos_aptitud', pg_temp.intentar($q$
  insert into persona_documentos (empleado_id, tipo, examen) values ('00000000-0000-0000-0000-0000001070e1', 'aptitud_ocupacional', 'ingreso')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c apto con restricciones sin recomendaciones', 'contiene: persona_documentos_restricciones', pg_temp.intentar($q$
  insert into persona_documentos (empleado_id, tipo, examen, resultado) values ('00000000-0000-0000-0000-0000001070e1', 'aptitud_ocupacional', 'ingreso', 'apto_con_restricciones')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d vence antes de empezar', 'contiene: persona_documentos_vigencia', pg_temp.intentar($q$
  insert into persona_documentos (empleado_id, tipo, nivel, vigente_desde, vence_en) values ('00000000-0000-0000-0000-0000001070e1', 'certificado_alturas', 'avanzado', '2026-10-01', '2026-01-01')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001070c0');
insert into resultado (prueba, esperado, resultado)
select '2e RRHH no registra exámenes médicos', 'contiene: row-level security', pg_temp.intentar($q$
  insert into persona_documentos (empleado_id, tipo, examen, resultado) values ('00000000-0000-0000-0000-0000001070e1', 'aptitud_ocupacional', 'ingreso', 'apto')$q$);
insert into resultado (prueba, esperado, resultado)
select '2f RRHH registra la afiliación a la ARL', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into persona_documentos (id, empleado_id, tipo, subsistema, entidad, fecha_documento)
  values ('00000000-0000-0000-0000-000000107a02', '00000000-0000-0000-0000-0000001070e1', 'certificado_afiliacion', 'arl', 'ARL Y', '2026-01-01')$q$);
insert into resultado (prueba, esperado, resultado)
select '2g RRHH ve la aptitud (dato de gestión)', 'apto', pg_temp.valor($q$select resultado from persona_documentos where id = '00000000-0000-0000-0000-000000107a01'$q$);
insert into resultado (prueba, esperado, resultado)
select '2h RRHH no verifica (eso es de SG-SST)', 'contiene: Verificar un documento es de SG-SST', pg_temp.intentar($q$
  update persona_documentos set verificado_en = now() where id = '00000000-0000-0000-0000-000000107a02'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001070a0');
insert into resultado (prueba, esperado, resultado)
select '2i S verifica la afiliación (queda quién)', 'S', pg_temp.valor($q$
  with n as (update persona_documentos set verificado_en = now() where id = '00000000-0000-0000-0000-000000107a02' returning verificado_por)
  select case when verificado_por = '00000000-0000-0000-0000-0000001070a0' then 'S' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2j lo registrado no se cambia', 'contiene: Lo registrado no se cambia', pg_temp.intentar($q$
  update persona_documentos set resultado = 'no_apto' where id = '00000000-0000-0000-0000-000000107a01'$q$);
insert into resultado (prueba, esperado, resultado)
select '2k archivar sin motivo', 'contiene: Escribe por qué se archiva', pg_temp.intentar($q$
  update persona_documentos set archivado = true where id = '00000000-0000-0000-0000-000000107a01'$q$);
insert into resultado (prueba, esperado, resultado)
select '2l un documento no se borra', 'contiene: permission denied', pg_temp.intentar($q$
  delete from persona_documentos where id = '00000000-0000-0000-0000-000000107a01'$q$);

-- ============================================================ 3) historia clínica: reservada
insert into resultado (prueba, esperado, resultado)
select '3a S (sin datos sensibles) no sube una historia clínica', 'contiene: row-level security', pg_temp.intentar($q$
  insert into persona_documentos (empleado_id, tipo) values ('00000000-0000-0000-0000-0000001070e1', 'historia_clinica')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001070b0');
insert into resultado (prueba, esperado, resultado)
select '3b V la registra "abierta" y la base la deja reservada', 'true', pg_temp.valor($q$
  with n as (insert into persona_documentos (id, empleado_id, tipo, reservado) values ('00000000-0000-0000-0000-000000107a03', '00000000-0000-0000-0000-0000001070e1', 'historia_clinica', false) returning reservado)
  select reservado::text from n$q$);
insert into resultado (prueba, esperado, resultado)
select '3c V la ve', '1', pg_temp.valor($q$select count(*)::text from persona_documentos where id = '00000000-0000-0000-0000-000000107a03'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001070a0');
insert into resultado (prueba, esperado, resultado)
select '3d S (SG-SST sin datos sensibles) no la ve', '0', pg_temp.valor($q$select count(*)::text from persona_documentos where id = '00000000-0000-0000-0000-000000107a03'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001070c0');
insert into resultado (prueba, esperado, resultado)
select '3e RRHH no la ve', '0', pg_temp.valor($q$select count(*)::text from persona_documentos where id = '00000000-0000-0000-0000-000000107a03'$q$);

-- ============================================================ 4) trabajadores de contratistas
select pg_temp.como('00000000-0000-0000-0000-0000001070a0');
insert into resultado (prueba, esperado, resultado)
select '4a S ve el nombre del contratista (sin tarifas)', '__Contratista 107__',
  pg_temp.valor($q$select nombre from fn_sst_contratistas() where id = '00000000-0000-0000-0000-0000001070f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4b S registra un trabajador del contratista', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into contratista_trabajadores (id, contratista_id, nombre, numero_documento, cargo)
  values ('00000000-0000-0000-0000-0000001070f2', '00000000-0000-0000-0000-0000001070f1', '__Trabajador 107__', '__T107__', 'Ayudante')$q$);
insert into resultado (prueba, esperado, resultado)
select '4c y su certificado de alturas', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into persona_documentos (contratista_trabajador_id, tipo, nivel, vigente_desde, vence_en)
  values ('00000000-0000-0000-0000-0000001070f2', 'certificado_alturas', 'avanzado', '2026-06-01', '2027-06-01')$q$);
insert into resultado (prueba, esperado, resultado)
select '4d un documento sin persona (o con dos)', 'contiene: persona_documentos_duenio', pg_temp.intentar($q$
  insert into persona_documentos (tipo, tema) values ('capacitacion', 'Inducción')$q$);

-- ============================================================ 5) EPP
insert into resultado (prueba, esperado, resultado)
select '5a S ve la entrega de EPP y no la de herramienta', 'epp',
  pg_temp.valor($q$select string_agg(categoria, ',') from dotacion_entregas where empleado_id = '00000000-0000-0000-0000-0000001070e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '5b S registra una entrega de EPP', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into dotacion_entregas (id, empleado_id, categoria, nombre, fecha_entrega)
  values ('00000000-0000-0000-0000-000000107d03', '00000000-0000-0000-0000-0000001070e1', 'epp', 'Casco', '2026-10-29')$q$);
insert into resultado (prueba, esperado, resultado)
select '5c S no registra una entrega de herramienta', 'contiene: row-level security', pg_temp.intentar($q$
  insert into dotacion_entregas (empleado_id, categoria, nombre, fecha_entrega)
  values ('00000000-0000-0000-0000-0000001070e1', 'herramienta', 'Pulidora', '2026-10-29')$q$);
insert into resultado (prueba, esperado, resultado)
select '5d S completa el seguimiento del arnés', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into epp_seguimiento (entrega_id, capacitacion_uso_en, vida_util_meses, reponer_en)
  values ('00000000-0000-0000-0000-000000107d01', '2026-10-01', 60, '2031-10-01')$q$);
insert into resultado (prueba, esperado, resultado)
select '5e … pero no el de una herramienta', 'contiene: row-level security', pg_temp.intentar($q$
  insert into epp_seguimiento (entrega_id) values ('00000000-0000-0000-0000-000000107d02')$q$);
insert into resultado (prueba, esperado, resultado)
select '5f S registra una inspección', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into epp_inspecciones (id, entrega_id, estado, en_uso) values ('00000000-0000-0000-0000-000000107b01', '00000000-0000-0000-0000-000000107d01', 'bueno', true)$q$);
insert into resultado (prueba, esperado, resultado)
-- OJO: epp_inspecciones no tiene política de update, así que la RLS tapa la fila ANTES del trigger
-- y el update no rebota: afecta 0 filas. Eso prueba la RLS, no la regla del trigger (que se prueba
-- como admin en 5h).
select '5g una inspección no se cambia (la RLS no deja tocarla: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update epp_inspecciones set estado = 'malo' where id = '00000000-0000-0000-0000-000000107b01'$q$);

insert into resultado (prueba, esperado, resultado)
select '5h … porque NADIE tiene política de update en inspecciones (eso es lo que frena, no el 0)', '0',
  (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'epp_inspecciones' and cmd in ('UPDATE', 'ALL'));

-- ============================================================ 6) archivos
insert into resultado (prueba, esperado, resultado)
select '6a S sube a la carpeta del empleado; no a reservado', 'true / false',
  pg_temp.valor($q$select fn_sst_personal_archivo('personas/e-00000000-0000-0000-0000-0000001070e1/x.pdf', 'subir')::text || ' / ' ||
                          fn_sst_personal_archivo('personas/e-00000000-0000-0000-0000-0000001070e1/reservado/x.pdf', 'subir')::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001070b0');
insert into resultado (prueba, esperado, resultado)
select '6b V sí sube a reservado', 'true',
  pg_temp.valor($q$select fn_sst_personal_archivo('personas/e-00000000-0000-0000-0000-0000001070e1/reservado/x.pdf', 'subir')::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000001070d0');
insert into resultado (prueba, esperado, resultado)
select '6c el técnico no sube', 'false',
  pg_temp.valor($q$select fn_sst_personal_archivo('personas/e-00000000-0000-0000-0000-0000001070e1/x.pdf', 'subir')::text$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '6d anon no lee nada', 'false / false',
  has_table_privilege('anon', 'public.persona_documentos', 'select')::text || ' / ' ||
  has_function_privilege('anon', 'public.fn_sst_personal_ficha()', 'execute')::text;

-- ============================================================ limpieza (admin)
delete from epp_inspecciones where entrega_id::text like '00000000-0000-0000-0000-000000107d0_';
delete from epp_seguimiento where entrega_id::text like '00000000-0000-0000-0000-000000107d0_';
delete from dotacion_entregas where empleado_id = '00000000-0000-0000-0000-0000001070e1';
delete from persona_documentos where empleado_id = '00000000-0000-0000-0000-0000001070e1'
   or contratista_trabajador_id = '00000000-0000-0000-0000-0000001070f2';
delete from contratista_trabajadores where contratista_id = '00000000-0000-0000-0000-0000001070f1';
delete from contratistas where id = '00000000-0000-0000-0000-0000001070f1';
delete from empleados where id = '00000000-0000-0000-0000-0000001070e1';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000001070_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__SST 107__', '__Victoria 107__', '__RRHH 107__'));
delete from roles where nombre in ('__SST 107__', '__Victoria 107__', '__RRHH 107__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000001070_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

-- Verificación de la migración 92 (descartar un borrador vacío). Correr DESPUÉS de la migración,
-- todo junto. Crea usuarios, un proyecto, una plantilla, actas y reuniones de prueba; BORRA todo al
-- final. Todas las filas deben decir OK.
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

-- P = Proyectos "responsable" (arma la plantilla). Q = Proyectos "trabajar" (llena). T = Técnicos.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000092a0', 'authenticated', 'authenticated', 'proy-resp.92@invalid.local'),
  ('00000000-0000-0000-0000-0000000092b0', 'authenticated', 'authenticated', 'proy-trab.92@invalid.local'),
  ('00000000-0000-0000-0000-0000000092c0', 'authenticated', 'authenticated', 'tecnico.92@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy resp 92__'), ('__Proy trab 92__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'proyectos', v.nivel::nivel_permiso, false
from (values ('__Proy resp 92__', 'responsable'), ('__Proy trab 92__', 'trabajar')) v(rol, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000092a0', '__Proy resp 92__', '__P 92__'),
             ('00000000-0000-0000-0000-0000000092b0', '__Proy trab 92__', '__Q 92__'),
             ('00000000-0000-0000-0000-0000000092c0', 'Técnicos', '__T 92__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000092e0', '__PRY-92__', '__Obra prueba 92__')
on conflict (id) do nothing;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000092a0');
insert into sst_plantillas (id, ambito, codigo, nombre, campos, firmas) values
  ('00000000-0000-0000-0000-0000000092d1', 'proyectos', '__ACTA-92__', 'Acta prueba 92',
   '[{"id": "objeto", "tipo": "texto", "etiqueta": "Objeto", "obligatorio": true}]',
   '[{"rol": "responsable_sst", "etiqueta": "Por Servielectro"}]');
update sst_plantillas set estado = 'publicada' where id = '00000000-0000-0000-0000-0000000092d1';

-- Q crea tres actas: f1 vacía, f2 con una foto, f3 que se firma.
select pg_temp.como('00000000-0000-0000-0000-0000000092b0');
insert into sst_formatos (id, plantilla_id, proyecto_id, respuestas) values
  ('00000000-0000-0000-0000-0000000092f1', '00000000-0000-0000-0000-0000000092d1', '00000000-0000-0000-0000-0000000092e0', '{"objeto": "Prueba"}'),
  ('00000000-0000-0000-0000-0000000092f2', '00000000-0000-0000-0000-0000000092d1', '00000000-0000-0000-0000-0000000092e0', '{}'),
  ('00000000-0000-0000-0000-0000000092f3', '00000000-0000-0000-0000-0000000092d1', '00000000-0000-0000-0000-0000000092e0', '{"objeto": "Prueba"}');
insert into storage.objects (bucket_id, name) values ('sgsst', 'formatos/00000000-0000-0000-0000-0000000092f2/foto.jpg');
insert into sst_formato_firmas (formato_id, rol, nombre, documento, empresa, imagen_path, imagen_sha256, firmada_en_dispositivo)
values ('00000000-0000-0000-0000-0000000092f3', 'responsable_sst', 'Q', '92', 'Servielectro',
        'formatos/00000000-0000-0000-0000-0000000092f3/firma-1.png', repeat('a', 64), now());

-- ============================================================ 1) actas
select pg_temp.como('00000000-0000-0000-0000-0000000092a0');
insert into resultado (prueba, esperado, resultado)
select '1a otro (aunque sea responsable) no descarta el borrador de Q', 'contiene: Solo quien lo creó',
  pg_temp.intentar($q$select fn_descartar_formato('00000000-0000-0000-0000-0000000092f1')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000092b0');
insert into resultado (prueba, esperado, resultado)
select '1b borrar a mano sigue sin poder (sin política de delete: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from sst_formatos where id = '00000000-0000-0000-0000-0000000092f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c el borrador vacío de Q se puede descartar (con respuestas escritas)', '(vacío)',
  pg_temp.valor($q$select fn_formato_por_que_no_descartar('00000000-0000-0000-0000-0000000092f1')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d … y se descarta', 'aceptado (1 filas)',
  pg_temp.intentar($q$select fn_descartar_formato('00000000-0000-0000-0000-0000000092f1')$q$);
insert into resultado (prueba, esperado, resultado)
select '1e se fue de verdad', '0', pg_temp.valor($q$select count(*)::text from sst_formatos where id = '00000000-0000-0000-0000-0000000092f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f con una foto en su carpeta, no', 'contiene: fotos o archivos',
  pg_temp.intentar($q$select fn_descartar_formato('00000000-0000-0000-0000-0000000092f2')$q$);
insert into resultado (prueba, esperado, resultado)
select '1g con una firma, no (nunca)', 'contiene: Ya tiene firmas',
  pg_temp.intentar($q$select fn_descartar_formato('00000000-0000-0000-0000-0000000092f3')$q$);
insert into resultado (prueba, esperado, resultado)
select '1h el que tiene firma sigue ahí', '1', pg_temp.valor($q$select count(*)::text from sst_formatos where id = '00000000-0000-0000-0000-0000000092f3'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000092c0');
insert into resultado (prueba, esperado, resultado)
select '1i el técnico (sin Proyectos) no ve el formato', 'contiene: no existe',
  pg_temp.intentar($q$select fn_descartar_formato('00000000-0000-0000-0000-0000000092f2')$q$);

-- ============================================================ 2) reuniones
select pg_temp.como('00000000-0000-0000-0000-0000000092b0');
insert into reuniones (id, proyecto_id, titulo) values
  ('00000000-0000-0000-0000-000000009201', '00000000-0000-0000-0000-0000000092e0', 'Reunión de prueba 92 (vacía)');
insert into reuniones (id, proyecto_id, titulo, aviso_grabacion, asistentes) values
  ('00000000-0000-0000-0000-000000009202', '00000000-0000-0000-0000-0000000092e0', 'Reunión de prueba 92 (con aviso)', true,
   '[{"nombre": "Prueba", "parte": "servielectro"}]');
select pg_temp.como('00000000-0000-0000-0000-0000000092a0');
insert into resultado (prueba, esperado, resultado)
select '2a otro no descarta la reunión de Q', 'contiene: Solo quien la creó',
  pg_temp.intentar($q$select fn_descartar_reunion('00000000-0000-0000-0000-000000009201')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000092b0');
insert into resultado (prueba, esperado, resultado)
select '2b Q descarta su reunión vacía', 'aceptado (1 filas)',
  pg_temp.intentar($q$select fn_descartar_reunion('00000000-0000-0000-0000-000000009201')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c con el aviso de grabación dado, no', 'contiene: aviso de grabación',
  pg_temp.intentar($q$select fn_descartar_reunion('00000000-0000-0000-0000-000000009202')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d borrar a mano una reunión sigue sin poder (0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from reuniones where id = '00000000-0000-0000-0000-000000009202'$q$);

-- ============================================================ 3) la huella
select pg_temp.como('00000000-0000-0000-0000-0000000092c0');
insert into resultado (prueba, esperado, resultado)
select '3a el técnico no ve los descartes', '0', pg_temp.valor($q$select count(*)::text from registros_descartados$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '3b quedó la huella de los dos descartes, a nombre de Q', '2', pg_temp.valor($q$
  select count(*)::text from registros_descartados
  where registro_id in ('00000000-0000-0000-0000-0000000092f1', '00000000-0000-0000-0000-000000009201')
    and descartado_por = '00000000-0000-0000-0000-0000000092b0'$q$);

-- ============================================================ 4) estructura
insert into resultado (prueba, esperado, resultado)
select '4a funciones de descarte ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_formato_por_que_no_descartar', 'fn_descartar_formato', 'fn_reunion_por_que_no_descartar', 'fn_descartar_reunion')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- ============================================================ limpieza (admin)
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'sgsst' and name like 'formatos/00000000-0000-0000-0000-0000000092f%';
delete from registros_descartados where registro_id in ('00000000-0000-0000-0000-0000000092f1', '00000000-0000-0000-0000-000000009201');
delete from reuniones where id::text like '00000000-0000-0000-0000-00000000920_';
delete from sst_formato_firmas where formato_id::text like '00000000-0000-0000-0000-0000000092f_';
delete from sst_formatos where id::text like '00000000-0000-0000-0000-0000000092f_';
delete from sst_plantillas where codigo = '__ACTA-92__';
delete from proyectos where id = '00000000-0000-0000-0000-0000000092e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000092_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy resp 92__', '__Proy trab 92__'));
delete from roles where nombre in ('__Proy resp 92__', '__Proy trab 92__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000092_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

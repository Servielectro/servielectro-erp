-- Verificación de la migración 88 (triggers sin filtro de permiso, mensajes ciertos, reintento de
-- firma). Correr DESPUÉS de la migración, todo junto. Además, volver a correr las de la 83 y la
-- 85: lo que probaban no puede cambiar. Crea usuarios, un proyecto, una plantilla y un acta de
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

-- Una firma con id fijo (para el reintento). p_conflicto: agrega ON CONFLICT (id) DO NOTHING,
-- como la manda la app (ignoreDuplicates).
create or replace function pg_temp.firma(p_id text, p_formato text, p_rol text, p_nombre text, p_doc text, p_conflicto boolean)
returns text language sql as $$
  select format('insert into sst_formato_firmas (id, formato_id, rol, nombre, documento, empresa, imagen_path, imagen_sha256, firmada_en_dispositivo) '
                || 'values (%L, %L, %L, %L, %L, %L, %L, repeat(%L, 64), now())',
                p_id, p_formato, p_rol, p_nombre, p_doc, 'Servielectro', 'formatos/' || p_formato || '/firma-' || p_id || '.png', 'a')
         || case when p_conflicto then ' on conflict (id) do nothing' else '' end;
$$;

-- ============================================================ personas, proyecto (admin)
-- P = Proyectos "responsable" (arma). Q = Proyectos "trabajar" (llena y firma). S = SG-SST "responsable".
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000088a0', 'authenticated', 'authenticated', 'proy-resp.88@invalid.local'),
  ('00000000-0000-0000-0000-0000000088b0', 'authenticated', 'authenticated', 'proy-trab.88@invalid.local'),
  ('00000000-0000-0000-0000-0000000088c0', 'authenticated', 'authenticated', 'sst.88@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy resp 88__'), ('__Proy trab 88__'), ('__SST 88__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, v.modulo, v.nivel::nivel_permiso, false
from (values ('__Proy resp 88__', 'proyectos', 'responsable'), ('__Proy trab 88__', 'proyectos', 'trabajar'), ('__SST 88__', 'sgsst', 'responsable')) v(rol, modulo, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000088a0', '__Proy resp 88__', '__P 88__'),
             ('00000000-0000-0000-0000-0000000088b0', '__Proy trab 88__', '__Q 88__'),
             ('00000000-0000-0000-0000-0000000088c0', '__SST 88__', '__S 88__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000088e0', '__PRY-88__', '__Obra prueba 88__')
on conflict (id) do nothing;

set local role authenticated;

-- Plantilla de acta (P) con firma de técnicos, publicada; el acta la llena Q con la lista.
select pg_temp.como('00000000-0000-0000-0000-0000000088a0');
insert into sst_plantillas (id, ambito, codigo, nombre, campos, firmas) values
  ('00000000-0000-0000-0000-0000000088d1', 'proyectos', '__ACTA-88__', 'Acta prueba 88',
   '[{"id": "objeto", "tipo": "texto", "etiqueta": "Objeto", "obligatorio": true}]',
   '[{"rol": "tecnico", "etiqueta": "Técnicos"}]');
update sst_plantillas set estado = 'publicada' where id = '00000000-0000-0000-0000-0000000088d1';
select pg_temp.como('00000000-0000-0000-0000-0000000088b0');
insert into resultado (prueba, esperado, resultado)
select '0a Q crea el acta en borrador (Proyectos)', 'borrador / proyectos',
  pg_temp.valor($q$with n as (insert into sst_formatos (id, plantilla_id, proyecto_id, respuestas, tecnicos_en_obra) values
    ('00000000-0000-0000-0000-0000000088f1', '00000000-0000-0000-0000-0000000088d1', '00000000-0000-0000-0000-0000000088e0',
     '{"objeto": "CCTV"}', '[{"nombre": "Camilo", "documento": "1000"}]')
    returning estado, ambito) select estado || ' / ' || ambito from n$q$);

-- ============================================================ 1) mensajes ciertos y lecturas que siguen filtrando desde la app
select pg_temp.como('00000000-0000-0000-0000-0000000088c0');
insert into resultado (prueba, esperado, resultado)
select '1a SG-SST firma un acta de Proyectos en borrador: dice que no tiene permiso (no "cerrado")',
  'contiene: No tienes permiso para firmar formatos de Proyectos',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000088a9', '00000000-0000-0000-0000-0000000088f1', 'otro', 'X', '9', false));
insert into resultado (prueba, esperado, resultado)
select '1b SG-SST sigue sin ver el acta', '0',
  pg_temp.valor($q$select count(*)::text from sst_formatos where id = '00000000-0000-0000-0000-0000000088f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c desde la app, fn_sst_tecnicos_de sigue filtrando para SG-SST', '(vacío)',
  pg_temp.valor($q$select fn_sst_tecnicos_de('00000000-0000-0000-0000-0000000088f1')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1d desde la app, fn_sst_hash_formato sigue filtrando para SG-SST', '(vacío)',
  pg_temp.valor($q$select fn_sst_hash_formato('00000000-0000-0000-0000-0000000088f1')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000088b0');
insert into resultado (prueba, esperado, resultado)
select '1e desde la app, fn_sst_formato_estado_ambito no devuelve nada (ni a quien ve el acta)', '(vacío)',
  pg_temp.valor($q$select estado from fn_sst_formato_estado_ambito('00000000-0000-0000-0000-0000000088f1')$q$);
insert into resultado (prueba, esperado, resultado)
select '1f firmar un formato que no existe', 'contiene: Ese formato no existe',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000088a8', '00000000-0000-0000-0000-0000000088ff', 'tecnico', 'Camilo', '1000', false));

-- ============================================================ 2) la lista de técnicos y el reintento
insert into resultado (prueba, esperado, resultado)
select '2a cédula que no está en la lista', 'contiene: no está en la lista',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000088a2', '00000000-0000-0000-0000-0000000088f1', 'tecnico', 'Otro', '9999', false));
insert into resultado (prueba, esperado, resultado)
select '2b firma Camilo', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000088a1', '00000000-0000-0000-0000-0000000088f1', 'tecnico', 'Camilo', '1000', true));
insert into resultado (prueba, esperado, resultado)
select '2c reintento de la MISMA firma (como la app, con ON CONFLICT): sin error, sin duplicar', 'aceptado (0 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000088a1', '00000000-0000-0000-0000-0000000088f1', 'tecnico', 'Camilo', '1000', true));
insert into resultado (prueba, esperado, resultado)
select '2d la misma firma sin ON CONFLICT: la rechaza la clave primaria', 'contiene: duplicate key',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000088a1', '00000000-0000-0000-0000-0000000088f1', 'tecnico', 'Camilo', '1000', false));
insert into resultado (prueba, esperado, resultado)
select '2e Camilo otra vez con otra firma (otro id)', 'contiene: Ese técnico ya firmó',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000088a3', '00000000-0000-0000-0000-0000000088f1', 'tecnico', 'Camilo', '1000', true));
insert into resultado (prueba, esperado, resultado)
select '2f queda una sola firma', '1',
  pg_temp.valor($q$select count(*)::text from sst_formato_firmas where formato_id = '00000000-0000-0000-0000-0000000088f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g la firma quedó con el hash del formato', 'true',
  pg_temp.valor($q$select (hash_contenido is not null and length(hash_contenido) = 64)::text from sst_formato_firmas where id = '00000000-0000-0000-0000-0000000088a1'$q$);

-- ============================================================ 3) cierre
insert into resultado (prueba, esperado, resultado)
select '3a se cierra y se sella', 'firmado / true',
  pg_temp.valor($q$with n as (update sst_formatos set estado = 'firmado' where id = '00000000-0000-0000-0000-0000000088f1'
    returning estado, hash_contenido) select estado || ' / ' || (hash_contenido is not null)::text from n$q$);
insert into resultado (prueba, esperado, resultado)
select '3b íntegro', 'true', pg_temp.valor($q$select fn_sst_formato_integro('00000000-0000-0000-0000-0000000088f1')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '3c firmar un formato cerrado: ahora sí "cerrado"', 'contiene: El formato ya está cerrado',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000088a4', '00000000-0000-0000-0000-0000000088f1', 'otro', 'Y', '8', false));

-- ============================================================ 4) estructura
reset role;
-- La regla de siempre: si una migración se olvida del revoke de PUBLIC, esto se cae.
insert into resultado (prueba, esperado, resultado)
select '4a funciones de SST ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_sst_tecnicos_de', 'fn_sst_hash_formato', 'fn_sst_formato_estado_ambito', 'fn_sst_firma_existe',
                    'fn_sst_personal', 'fn_sst_firma_reglas', 'fn_sst_tecnicos_firma', 'fn_sst_formato_integro',
                    'fn_sst_pide_tecnicos', 'fn_sst_formato_tiene_firmas', 'fn_sst_faltantes', 'fn_sst_formato_ambito',
                    'fn_sst_doc', 'fn_sst_tecnicos_problema', 'fn_sst_tecnicos_formato')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '4b fn_sst_personal ya no es de PUBLIC (ni queda con los permisos por defecto)', 'true',
  (select (p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))::text
   from pg_proc p where p.proname = 'fn_sst_personal' and p.pronamespace = 'public'::regnamespace);

-- ============================================================ limpieza (admin)
delete from sst_formato_firmas where formato_id = '00000000-0000-0000-0000-0000000088f1';
delete from sst_formatos where id = '00000000-0000-0000-0000-0000000088f1';
delete from sst_plantillas where codigo = '__ACTA-88__';
delete from proyectos where id = '00000000-0000-0000-0000-0000000088e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000088_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy resp 88__', '__Proy trab 88__', '__SST 88__'));
delete from roles where nombre in ('__Proy resp 88__', '__Proy trab 88__', '__SST 88__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000088_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

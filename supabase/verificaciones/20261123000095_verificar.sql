-- Verificación de la migración 95 (reintento de una firma). Correr DESPUÉS de la migración, todo
-- junto. Después de esta, volver a correr la de la 88: sus casos 2c y 2d tienen que dar OK.
-- Crea usuarios, un proyecto, una plantilla y un acta de prueba; BORRA todo al final.
-- Todas las filas deben decir OK.
begin;

create temporary table resultado (orden serial, prueba text, esperado text, resultado text) on commit drop;
grant all on resultado to authenticated;
grant usage on sequence resultado_orden_seq to authenticated;
-- Lo que quedó registrado en la primera firma (para ver que el reintento no lo toca).
create temporary table original (hash text, recibida timestamptz, registrada uuid) on commit drop;
grant all on original to authenticated;

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

-- La firma como la manda la app (ignoreDuplicates = ON CONFLICT (id) DO NOTHING), o sin ON CONFLICT.
create or replace function pg_temp.firma(p_id text, p_doc text, p_conflicto boolean)
returns text language sql as $$
  select format('insert into sst_formato_firmas (id, formato_id, rol, nombre, documento, empresa, imagen_path, imagen_sha256, firmada_en_dispositivo) '
                || 'values (%L, %L, %L, %L, %L, %L, %L, repeat(%L, 64), now())',
                p_id, '00000000-0000-0000-0000-0000000095f1', 'tecnico', 'Camilo', p_doc, 'Servielectro',
                'formatos/00000000-0000-0000-0000-0000000095f1/firma-' || p_id || '.png', 'a')
         || case when p_conflicto then ' on conflict (id) do nothing' else '' end;
$$;

-- P = Proyectos "responsable" (arma la plantilla). Q = Proyectos "trabajar" (llena, firma y cierra).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000095a0', 'authenticated', 'authenticated', 'proy-resp.95@invalid.local'),
  ('00000000-0000-0000-0000-0000000095b0', 'authenticated', 'authenticated', 'proy-trab.95@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy resp 95__'), ('__Proy trab 95__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'proyectos', v.nivel::nivel_permiso, false
from (values ('__Proy resp 95__', 'responsable'), ('__Proy trab 95__', 'trabajar')) v(rol, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000095a0', '__Proy resp 95__', '__P 95__'),
             ('00000000-0000-0000-0000-0000000095b0', '__Proy trab 95__', '__Q 95__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000095e0', '__PRY-95__', '__Obra prueba 95__')
on conflict (id) do nothing;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000095a0');
insert into sst_plantillas (id, ambito, codigo, nombre, campos, firmas) values
  ('00000000-0000-0000-0000-0000000095d1', 'proyectos', '__ACTA-95__', 'Acta prueba 95',
   '[{"id": "objeto", "tipo": "texto", "etiqueta": "Objeto", "obligatorio": true}]',
   '[{"rol": "tecnico", "etiqueta": "Técnicos"}]');
update sst_plantillas set estado = 'publicada' where id = '00000000-0000-0000-0000-0000000095d1';
select pg_temp.como('00000000-0000-0000-0000-0000000095b0');
insert into sst_formatos (id, plantilla_id, proyecto_id, respuestas, tecnicos_en_obra) values
  ('00000000-0000-0000-0000-0000000095f1', '00000000-0000-0000-0000-0000000095d1', '00000000-0000-0000-0000-0000000095e0',
   '{"objeto": "CCTV"}', '[{"nombre": "Camilo", "documento": "1000"}]');

-- ============================================================ 1) reintento con el formato abierto
insert into resultado (prueba, esperado, resultado)
select '1a firma Camilo', 'aceptado (1 filas)', pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000095a1', '1000', true));
insert into original select hash_contenido, recibida_en, registrada_por from sst_formato_firmas where id = '00000000-0000-0000-0000-0000000095a1';
insert into resultado (prueba, esperado, resultado)
select '1b reintento de la MISMA firma, como la app: sin error y sin duplicar', 'aceptado (0 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000095a1', '1000', true));
insert into resultado (prueba, esperado, resultado)
select '1c la misma firma sin ON CONFLICT: la rechaza la clave primaria', 'contiene: duplicate key',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000095a1', '1000', false));

-- ============================================================ 2) el caso real: se cerró entre el intento y el reintento
insert into resultado (prueba, esperado, resultado)
select '2a alguien cierra el acta', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_formatos set estado = 'firmado' where id = '00000000-0000-0000-0000-0000000095f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b el celular reintenta la firma con el acta ya cerrada: sin error, sin duplicar', 'aceptado (0 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000095a1', '1000', true));
insert into resultado (prueba, esperado, resultado)
select '2c la firma sigue siendo una, con su hash, su hora y su registro originales', '1 / true', pg_temp.valor($q$
  select count(*)::text || ' / ' || bool_and(f.hash_contenido = o.hash and f.recibida_en = o.recibida and f.registrada_por = o.registrada)::text
  from sst_formato_firmas f cross join original o
  where f.formato_id = '00000000-0000-0000-0000-0000000095f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d una firma NUEVA (otro id) con el acta cerrada, no', 'contiene: El formato ya está cerrado',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000000095a2', '1000', true));
insert into resultado (prueba, esperado, resultado)
select '2e el acta sigue íntegra (lo sellado es lo que se firmó)', 'true',
  pg_temp.valor($q$select fn_sst_formato_integro('00000000-0000-0000-0000-0000000095f1')::text$q$);

-- ============================================================ 3) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '3a funciones de la firma ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_sst_firma_registro', 'fn_sst_firma_reglas', 'fn_sst_firma_existe')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '3b fn_sst_firma_registro no devuelve nada desde la app', '(vacío)', pg_temp.valor($q$
  select hash_contenido from fn_sst_firma_registro('00000000-0000-0000-0000-0000000095a1')$q$);

-- ============================================================ limpieza (admin)
delete from sst_formato_firmas where formato_id = '00000000-0000-0000-0000-0000000095f1';
delete from sst_formatos where id = '00000000-0000-0000-0000-0000000095f1';
delete from sst_plantillas where codigo = '__ACTA-95__';
delete from proyectos where id = '00000000-0000-0000-0000-0000000095e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000095_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy resp 95__', '__Proy trab 95__'));
delete from roles where nombre in ('__Proy resp 95__', '__Proy trab 95__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000095_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

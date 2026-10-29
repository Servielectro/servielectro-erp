-- Verificación de la migración 112 (ATS y alturas 2026). Correr DESPUÉS de la migración, todo junto.
-- Crea un usuario de SG-SST, un ATS de prueba con su lista y firmas de varios días, y una plantilla
-- sin firma diaria para comprobar que ahí sigue la regla de siempre; BORRA todo al final.
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

-- Una firma de prueba: rol, cédula, cuántos días atrás (en el dispositivo) y un número para el path.
create or replace function pg_temp.firma(p_formato text, p_rol text, p_doc text, p_dias int, p_n int)
returns text language sql as $$
  select format('insert into sst_formato_firmas (formato_id, rol, nombre, documento, cargo, imagen_path, imagen_sha256, firmada_en_dispositivo) '
                || 'values (%L, %L, %L, %L, %L, %L, repeat(%L, 64), now() - make_interval(days => %s))',
                p_formato, p_rol, 'Firmante ' || p_doc, p_doc, 'Técnico', 'formatos/' || p_formato || '/firma-' || p_n || '.png', 'a', p_dias);
$$;

-- T = SG-SST "trabajar".
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001120a0', 'authenticated', 'authenticated', 'sst.112@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__SST 112__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'sgsst', 'trabajar', false from roles r where r.nombre = '__SST 112__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000001120a0', r.id, '__T 112__' from roles r where r.nombre = '__SST 112__'
on conflict (id) do update set rol_id = excluded.rol_id;

-- Una plantilla SIN firma diaria (la regla de siempre), como admin.
insert into sst_plantillas (id, codigo, nombre, estado, ambito, publicada_en, campos, firmas) values
  ('00000000-0000-0000-0000-0000001120f1', '__SST-112__', '__Sin diaria 112__', 'publicada', 'sgsst', now(),
   '[{"id": "a", "tipo": "texto", "etiqueta": "A"}]', '[{"rol": "tecnico", "etiqueta": "Técnicos", "obligatoria": true}]')
on conflict (id) do nothing;

-- ============================================================ 1) las plantillas y su forma
insert into resultado (prueba, esperado, resultado)
select '1a FOR-14 y FOR-15 publicadas en SG-SST con su control del papel', 'FOR-14 02 2026-04-08 publicada | FOR-15 02 2026-06-05 publicada',
  pg_temp.valor($q$select string_agg(codigo || ' ' || (control ->> 'version') || ' ' || (control ->> 'fecha') || ' ' || estado, ' | ' order by codigo)
                   from sst_plantillas where id in ('00000000-0000-4000-8000-000000112a14', '00000000-0000-4000-8000-000000112a15')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b las dos pasan la validación de la base', '(vacío) / (vacío)',
  pg_temp.valor($q$select coalesce(fn_sst_campos_problema(campos, firmas), '(vacío)') from sst_plantillas where id = '00000000-0000-4000-8000-000000112a14'$q$)
  || ' / ' ||
  pg_temp.valor($q$select coalesce(fn_sst_campos_problema(campos, firmas), '(vacío)') from sst_plantillas where id = '00000000-0000-4000-8000-000000112a15'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c una fila fija repetida', 'contiene: fila fija repetida',
  pg_temp.valor($q$select fn_sst_campos_problema('[{"id": "t", "tipo": "tabla", "etiqueta": "T", "columnas": [{"id": "x", "tipo": "texto", "etiqueta": "X"}],
                   "filas": [{"id": "f", "etiqueta": "F"}, {"id": "f", "etiqueta": "G"}]}]', '[]')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d datos por persona fuera del bloque de técnicos', 'contiene: solo van en el bloque de técnicos',
  pg_temp.valor($q$select fn_sst_campos_problema('[{"id": "a", "tipo": "texto", "etiqueta": "A"}]',
                   '[{"rol": "otro", "etiqueta": "Otro", "columnas": [{"id": "x", "tipo": "si_no", "etiqueta": "X"}]}]')$q$);
insert into resultado (prueba, esperado, resultado)
select '1e un dato por persona que no es sí/no', 'contiene: no es sí/no',
  pg_temp.valor($q$select fn_sst_campos_problema('[{"id": "a", "tipo": "texto", "etiqueta": "A"}]',
                   '[{"rol": "tecnico", "etiqueta": "T", "columnas": [{"id": "x", "tipo": "texto", "etiqueta": "X"}]}]')$q$);
insert into resultado (prueba, esperado, resultado)
select '1f texto_largo ya vale como columna de tabla', '(vacío)',
  pg_temp.valor($q$select coalesce(fn_sst_campos_problema('[{"id": "t", "tipo": "tabla", "etiqueta": "T", "columnas": [{"id": "x", "tipo": "texto_largo", "etiqueta": "X"}]}]', '[]'), '(vacío)')$q$);

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000001120a0');

-- ============================================================ 2) firma diaria en el ATS
insert into resultado (prueba, esperado, resultado)
select '2a T abre un ATS con dos trabajadores en la lista', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into sst_formatos (id, plantilla_id, fecha, lugar, respuestas, tecnicos_en_obra) values
    ('00000000-0000-0000-0000-0000001120d1', '00000000-0000-4000-8000-000000112a14', current_date - 3, 'Torre 2',
     '{"area": "Seguridad electrónica", "herramientas": "Taladro, escalera", "valido_hasta": "2026-12-31", "tipo_actividad": "Rutinaria",
       "descripcion_actividad": "Cableado de cámaras", "pasos": {"alistamiento": {"tarea": "Revisar herramienta"}}, "epp": {"casco": {"uso": "SI"}}}',
     '[{"nombre": "Ana", "documento": "111"}, {"nombre": "Beto", "documento": "222"}]')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b Ana firma el primer día', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000001120d1', 'tecnico', '111', 2, 1));
insert into resultado (prueba, esperado, resultado)
select '2c Ana otra vez ESE día', 'contiene: Ese técnico ya firmó este formato el',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000001120d1', 'tecnico', '111', 2, 2));
insert into resultado (prueba, esperado, resultado)
select '2d Ana al día siguiente (revalida)', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000001120d1', 'tecnico', '111', 1, 3));
insert into resultado (prueba, esperado, resultado)
select '2e alguien que no está en la lista', 'contiene: no está en la lista',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000001120d1', 'tecnico', '999', 1, 4));
insert into resultado (prueba, esperado, resultado)
select '2f el que autoriza firma el primer día', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000001120d1', 'responsable_sst', '555', 2, 5));
insert into resultado (prueba, esperado, resultado)
select '2g … y otra firma de "autoriza" ese mismo día', 'contiene: Ese bloque ya tiene su firma del',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000001120d1', 'responsable_sst', '556', 2, 6));
insert into resultado (prueba, esperado, resultado)
select '2h el contenido quedó sellado con la primera firma', 'contiene: su contenido quedó sellado', pg_temp.intentar($q$
  update sst_formatos set respuestas = respuestas || '{"area": "Otra"}' where id = '00000000-0000-0000-0000-0000001120d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2i todas las firmas guardan la misma huella', '1',
  pg_temp.valor($q$select count(distinct hash_contenido)::text from sst_formato_firmas where formato_id = '00000000-0000-0000-0000-0000001120d1'$q$);

-- ============================================================ 3) sin firma diaria, la regla de siempre
insert into resultado (prueba, esperado, resultado)
select '3a un formato de la plantilla sin firma diaria', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into sst_formatos (id, plantilla_id, fecha, respuestas, tecnicos_en_obra) values
    ('00000000-0000-0000-0000-0000001120d2', '00000000-0000-0000-0000-0000001120f1', current_date - 3, '{"a": "x"}',
     '[{"nombre": "Ana", "documento": "111"}]')$q$);
insert into resultado (prueba, esperado, resultado)
select '3b Ana firma', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000001120d2', 'tecnico', '111', 2, 1));
insert into resultado (prueba, esperado, resultado)
select '3c Ana otro día: aquí no se revalida', 'contiene: Ese técnico ya firmó este formato.',
  pg_temp.intentar(pg_temp.firma('00000000-0000-0000-0000-0000001120d2', 'tecnico', '111', 1, 2));

reset role;
insert into resultado (prueba, esperado, resultado)
select '4 la función de la firma diaria no responde fuera de un trigger', 'false',
  coalesce(fn_sst_firma_diaria('00000000-0000-0000-0000-0000001120d1', 'tecnico')::text, '(vacío)');

-- ============================================================ limpieza (admin)
delete from sst_formato_firmas where formato_id in ('00000000-0000-0000-0000-0000001120d1', '00000000-0000-0000-0000-0000001120d2');
delete from sst_formatos where id in ('00000000-0000-0000-0000-0000001120d1', '00000000-0000-0000-0000-0000001120d2');
delete from sst_plantillas where id = '00000000-0000-0000-0000-0000001120f1';
delete from perfiles where id = '00000000-0000-0000-0000-0000001120a0';
delete from permisos_rol where rol_id in (select id from roles where nombre = '__SST 112__');
delete from roles where nombre = '__SST 112__';
delete from auth.users where id = '00000000-0000-0000-0000-0000001120a0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

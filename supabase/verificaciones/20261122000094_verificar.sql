-- OJO: desde la 96 la regla de días hábiles cambió (sábado hábil e inicio de labores elegido en el
-- acta) y fn_sumar_dias_habiles tiene otra firma: los casos 1c, 1d, 1e, 4a y 4b de este archivo ya no
-- aplican; los reemplaza la verificación de la 96.
-- Verificación de la migración 94 (acta de inicio: festivos, días hábiles, prellenado, fechas
-- calculadas y marca de "se apartó"). Correr DESPUÉS de la migración (y de la 90 y la 93), todo
-- junto. Crea un cliente, una sede, un proyecto, un contrato confirmado y actas de prueba; BORRA
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

-- ============================================================ 1) calendario
insert into resultado (prueba, esperado, resultado)
select '1a festivos de 2026 (los 18 oficiales)',
  '2026-01-01,2026-01-12,2026-03-23,2026-04-02,2026-04-03,2026-05-01,2026-05-18,2026-06-08,2026-06-15,2026-06-29,2026-07-20,2026-08-07,2026-08-17,2026-10-12,2026-11-02,2026-11-16,2026-12-08,2026-12-25',
  pg_temp.valor($q$select string_agg(fecha::text, ',' order by fecha) from festivos_colombia where extract(year from fecha) = 2026$q$);
insert into resultado (prueba, esperado, resultado)
select '1b 2027: San Pedro (martes 29/06) se corre al lunes 5/07', '18 / true', pg_temp.valor($q$
  select count(*)::text || ' / ' || bool_or(fecha = '2027-07-05')::text from festivos_colombia where extract(year from fecha) = 2027$q$);
insert into resultado (prueba, esperado, resultado)
select '1c 12 días hábiles desde el jueves 29/10/2026 (salta el festivo del 2 y el 16 de nov)', '2026-11-18',
  pg_temp.valor($q$select fn_sumar_dias_habiles('2026-10-29', 12)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1d 5 días hábiles desde el 18/12/2026 (salta Navidad)', '2026-12-28',
  pg_temp.valor($q$select fn_sumar_dias_habiles('2026-12-18', 5)::text$q$);
insert into resultado (prueba, esperado, resultado)
select '1e 1 día hábil desde el viernes 13/11/2026 (lunes 16 festivo)', '2026-11-17',
  pg_temp.valor($q$select fn_sumar_dias_habiles('2026-11-13', 1)::text$q$);

-- ============================================================ 2) la plantilla
insert into resultado (prueba, esperado, resultado)
select '2a la plantilla del acta de inicio está publicada en Proyectos', 'publicada / proyectos', pg_temp.valor($q$
  select estado || ' / ' || ambito from sst_plantillas where id = '00000000-0000-4000-8000-0000000094a1'::uuid or (codigo = 'PRY-ACTA-INICIO' and version = 1) limit 1$q$);
insert into resultado (prueba, esperado, resultado)
select '2b y el motor la acepta (campos y firmas válidos)', '(vacío)', pg_temp.valor($q$
  select fn_sst_campos_problema(campos, firmas) from sst_plantillas where codigo = 'PRY-ACTA-INICIO' and version = 1$q$);

-- ============================================================ datos de prueba (admin)
-- P = Proyectos "responsable" (confirma el contrato). Q = Proyectos "trabajar" (llena el acta). T = Técnicos.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000094a0', 'authenticated', 'authenticated', 'proy-resp.94@invalid.local'),
  ('00000000-0000-0000-0000-0000000094b0', 'authenticated', 'authenticated', 'proy-trab.94@invalid.local'),
  ('00000000-0000-0000-0000-0000000094c0', 'authenticated', 'authenticated', 'tecnico.94@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy resp 94__'), ('__Proy trab 94__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'proyectos', v.nivel::nivel_permiso, false
from (values ('__Proy resp 94__', 'responsable'), ('__Proy trab 94__', 'trabajar')) v(rol, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000094a0', '__Proy resp 94__', '__P 94__'),
             ('00000000-0000-0000-0000-0000000094b0', '__Proy trab 94__', '__Q 94__'),
             ('00000000-0000-0000-0000-0000000094c0', 'Técnicos', '__T 94__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into clientes (id, nombre, nit, contacto, direccion)
values ('00000000-0000-0000-0000-0000000094c1', '__Conjunto prueba 94__', '900000094', 'Administradora Prueba', 'Calle falsa 94');
insert into cliente_sedes (id, cliente_id, nombre, direccion, municipio)
values ('00000000-0000-0000-0000-0000000094c2', '00000000-0000-0000-0000-0000000094c1', 'Sede principal', 'Carrera 94 # 1-1', 'Bogotá');
insert into proyectos (id, codigo, nombre, cliente_id) values
  ('00000000-0000-0000-0000-0000000094e0', '__PRY-94__', '__Obra prueba 94__', '00000000-0000-0000-0000-0000000094c1');
insert into proyecto_documentos (id, proyecto_id, tipo, nombre, nombre_archivo, path, mime, bytes, sha256)
values ('00000000-0000-0000-0000-0000000094d1', '00000000-0000-0000-0000-0000000094e0', 'contrato_firmado', 'Contrato', 'c.pdf',
        '00000000-0000-0000-0000-0000000094e0/c.pdf', 'application/pdf', 100, repeat('a', 64));
insert into proyecto_contratos (id, proyecto_id, documento_id, numero, objeto, alcance, valor_total, plazo_cantidad, plazo_unidad, plazo_inicia)
values ('00000000-0000-0000-0000-0000000094f9', '00000000-0000-0000-0000-0000000094e0', '00000000-0000-0000-0000-0000000094d1', 'CSE-94',
        'Mantenimiento de puertas', E'• Desmonte de puertas\n• Cambio de rodamientos', 1000000, 12, 'dias_habiles', 'acta_inicio');

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000094a0');
update proyecto_contratos set estado = 'confirmado' where id = '00000000-0000-0000-0000-0000000094f9';

-- ============================================================ 3) prellenado
select pg_temp.como('00000000-0000-0000-0000-0000000094b0');
insert into resultado (prueba, esperado, resultado)
select '3a el prellenado trae el alcance del contrato CONFIRMADO, el plazo y la sede',
  E'• Desmonte de puertas\n• Cambio de rodamientos | 12 | Carrera 94 # 1-1 | Bogotá | Contrato CSE-94', pg_temp.valor($q$
  select (datos ->> 'alcance') || ' | ' || (datos ->> 'plazo_dias_habiles') || ' | ' || (datos ->> 'lugar_direccion') || ' | ' || (datos ->> 'ciudad') || ' | ' || (datos ->> 'referencia')
  from fn_actas_prellenado() where proyecto_id = '00000000-0000-0000-0000-0000000094e0'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000094c0');
insert into resultado (prueba, esperado, resultado)
select '3b el técnico (sin Proyectos) no recibe prellenado', '0', pg_temp.valor($q$select count(*)::text from fn_actas_prellenado()$q$);

-- ============================================================ 4) fechas calculadas por la base
select pg_temp.como('00000000-0000-0000-0000-0000000094b0');
insert into resultado (prueba, esperado, resultado)
select '4a el acta del 29/10 con 12 días: la base escribe inicio y terminación (aunque la app mande otra cosa)',
  '2026-10-29 / 2026-11-18', pg_temp.valor($q$
  with n as (insert into sst_formatos (id, plantilla_id, proyecto_id, fecha, respuestas)
    select '00000000-0000-0000-0000-0000000094f1', id, '00000000-0000-0000-0000-0000000094e0', '2026-10-29',
           '{"plazo_dias_habiles": "12", "fecha_inicio_oficial": "2000-01-01", "fecha_terminacion_estimada": "2099-12-31"}'
    from sst_plantillas where codigo = 'PRY-ACTA-INICIO' and version = 1
    returning respuestas)
  select (respuestas ->> 'fecha_inicio_oficial') || ' / ' || (respuestas ->> 'fecha_terminacion_estimada') from n$q$);
insert into resultado (prueba, esperado, resultado)
select '4b si cambia la fecha del acta, la terminación se recalcula', '2026-11-13 / 2026-12-02', pg_temp.valor($q$
  with n as (update sst_formatos set fecha = '2026-11-13' where id = '00000000-0000-0000-0000-0000000094f1' returning respuestas)
  select (respuestas ->> 'fecha_inicio_oficial') || ' / ' || (respuestas ->> 'fecha_terminacion_estimada') from n$q$);
insert into resultado (prueba, esperado, resultado)
select '4c sin plazo, no hay terminación (no se inventa)', '(vacío)', pg_temp.valor($q$
  with n as (update sst_formatos set respuestas = respuestas - 'plazo_dias_habiles' where id = '00000000-0000-0000-0000-0000000094f1' returning respuestas)
  select respuestas ->> 'fecha_terminacion_estimada' from n$q$);

-- ============================================================ 5) la marca de "se apartó del contrato"
-- Cada update en su statement y la consulta en otro: una función STABLE en el mismo statement que
-- el UPDATE ve el estado anterior (así la 5a pasaba sin probar nada).
update sst_formatos set respuestas = respuestas
    || jsonb_build_object('alcance', E'• Desmonte de puertas\n\n• Cambio de   rodamientos',
                          '_prellenado', jsonb_build_object('alcance', E'• Desmonte de puertas\n• Cambio de rodamientos'))
  where id = '00000000-0000-0000-0000-0000000094f1';
insert into resultado (prueba, esperado, resultado)
select '5a mismo alcance que el contrato (con otros espacios): no se marca', 'NINGUNO', pg_temp.valor($q$
  select coalesce(nullif(array_to_string(fn_formato_se_aparta('00000000-0000-0000-0000-0000000094f1'), ', '), ''), 'NINGUNO')$q$);
update sst_formatos set respuestas = jsonb_set(respuestas, '{alcance}', to_jsonb('• Desmonte de puertas y accesos a o Regata en terreno duro'::text))
  where id = '00000000-0000-0000-0000-0000000094f1';
insert into resultado (prueba, esperado, resultado)
select '5b alcance cambiado a mano: queda marcado', 'Alcance', pg_temp.valor($q$
  select coalesce(nullif(array_to_string(fn_formato_se_aparta('00000000-0000-0000-0000-0000000094f1'), ', '), ''), 'NINGUNO')$q$);

-- ============================================================ 6) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '6a funciones del acta de inicio ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_festivos_de', 'fn_sumar_dias_habiles', 'fn_actas_prellenado', 'fn_formato_se_aparta', 'fn_sst_formato_calculos')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- ============================================================ limpieza (admin)
delete from sst_formatos where id = '00000000-0000-0000-0000-0000000094f1';
delete from proyecto_contratos where proyecto_id = '00000000-0000-0000-0000-0000000094e0';
delete from proyecto_documentos where proyecto_id = '00000000-0000-0000-0000-0000000094e0';
delete from proyectos where id = '00000000-0000-0000-0000-0000000094e0';
delete from cliente_sedes where id = '00000000-0000-0000-0000-0000000094c2';
delete from clientes where id = '00000000-0000-0000-0000-0000000094c1';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000094_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy resp 94__', '__Proy trab 94__'));
delete from roles where nombre in ('__Proy resp 94__', '__Proy trab 94__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000094_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

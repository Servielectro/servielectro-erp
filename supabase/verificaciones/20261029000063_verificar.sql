-- Verificación de la migración 63 (módulo Proyectos). Correr DESPUÉS de la migración, todo
-- junto. Crea personas, proyectos, una cotización y visitas de prueba, y BORRA todo antes de
-- mostrar el resultado. No toca datos reales.
--
-- Personas: J = Jhojan (Administrador: Comercial, Operativo, Proyectos). P = rol con solo
-- Proyectos "trabajar". R = rol con RRHH "trabajar" (como Alejandra). K = rol con RRHH
-- "consultar" (chuleo accidental). O = Coordinador (Operativo "trabajar"). T = técnico.
-- Resultado esperado: todas las filas en "OK".

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

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000631a0', 'authenticated', 'authenticated', 'proyectos.63@invalid.local'),
  ('00000000-0000-0000-0000-0000000631b0', 'authenticated', 'authenticated', 'rrhh.63@invalid.local'),
  ('00000000-0000-0000-0000-0000000631c0', 'authenticated', 'authenticated', 'consulta.63@invalid.local'),
  ('00000000-0000-0000-0000-0000000631d0', 'authenticated', 'authenticated', 'coordinador.63@invalid.local'),
  ('00000000-0000-0000-0000-0000000631e0', 'authenticated', 'authenticated', 'tecnico.63@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proyectos prueba 63__'), ('__RRHH prueba 63__'), ('__consulta prueba 63__')
on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, v.modulo, v.nivel::nivel_permiso, false
from roles r
join (values ('__Proyectos prueba 63__', 'proyectos', 'trabajar'), ('__RRHH prueba 63__', 'rrhh', 'trabajar'),
             ('__consulta prueba 63__', 'rrhh', 'consultar')) v(rol, modulo, nivel) on v.rol = r.nombre
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000631a0', '__Proyectos prueba 63__', '__P 63__'),
  ('00000000-0000-0000-0000-0000000631b0', '__RRHH prueba 63__', '__R 63__'),
  ('00000000-0000-0000-0000-0000000631c0', '__consulta prueba 63__', '__K 63__'),
  ('00000000-0000-0000-0000-0000000631d0', 'Coordinador', '__O 63__'),
  ('00000000-0000-0000-0000-0000000631e0', 'Técnicos', '__T 63__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

insert into clientes (id, nombre) values
  ('00000000-0000-0000-0000-0000000632c0', 'PRUEBA MIGRACION 63 (se borra)'),
  ('00000000-0000-0000-0000-0000000632c1', 'PRUEBA MIGRACION 63 OTRO (se borra)');
insert into cotizaciones (id, codigo, anio, cliente_id, descripcion, estado) values
  ('00000000-0000-0000-0000-0000000632d0', 'PRUEBA-63-APROBADA', 2026, '00000000-0000-0000-0000-0000000632c0', 'prueba 63 aprobada', 'APROBADA'),
  ('00000000-0000-0000-0000-0000000632d1', 'PRUEBA-63-BORRADOR', 2026, '00000000-0000-0000-0000-0000000632c0', 'prueba 63 borrador', 'BORRADOR');

-- ============================================================ 1) crear a mano (P, solo Proyectos)
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000631a0');
insert into resultado (prueba, esperado, resultado)
select '1a crear un proyecto a mano, sin cotización ni cliente: código automático', 'true',
  pg_temp.valor($q$with n as (insert into proyectos (id, codigo, nombre)
                  values ('00000000-0000-0000-0000-0000000632a0', '', '__Edificio prueba 63__') returning codigo)
                  select (codigo ~ ('^PRY-' || extract(year from (now() at time zone 'America/Bogota'))::text || '-\d{3,}$'))::text from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1b el siguiente toma el número siguiente', 'true',
  pg_temp.valor($q$with n as (insert into proyectos (id, codigo, nombre)
                  values ('00000000-0000-0000-0000-0000000632a1', '', '__Conjunto prueba 63__') returning codigo)
                  select (substring(codigo from '(\d+)$')::int
                          = (select substring(codigo from '(\d+)$')::int from proyectos where id = '00000000-0000-0000-0000-0000000632a0') + 1)::text
                  from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1c un código escrito a mano se respeta', 'OBRA-63-MANUAL',
  pg_temp.valor($q$with n as (insert into proyectos (id, codigo, nombre, estado)
                  values ('00000000-0000-0000-0000-0000000632a2', 'OBRA-63-MANUAL', '__Obra suspendida 63__', 'SUSPENDIDO') returning codigo)
                  select codigo from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1d P lee y edita sus proyectos (nombre)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update proyectos set nombre = '__Edificio prueba 63 (torre 2)__' where id = '00000000-0000-0000-0000-0000000632a0'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e P enlaza una cotización (sin Comercial)', 'contiene: requiere permiso de Comercial', pg_temp.intentar($q$
  update proyectos set cotizacion_aprobada_id = '00000000-0000-0000-0000-0000000632d0' where id = '00000000-0000-0000-0000-0000000632a0'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '1f enlazar una cotización que no está APROBADA', 'contiene: APROBADA', pg_temp.intentar($q$
  update proyectos set cotizacion_aprobada_id = '00000000-0000-0000-0000-0000000632d1' where id = '00000000-0000-0000-0000-0000000632a0'$q$);
insert into resultado (prueba, esperado, resultado)
select '1g enlazar la APROBADA después: el proyecto toma el cliente de la cotización', 'true',
  pg_temp.valor($q$with u as (update proyectos set cotizacion_aprobada_id = '00000000-0000-0000-0000-0000000632d0'
                  where id = '00000000-0000-0000-0000-0000000632a0' returning cliente_id)
                  select (cliente_id = '00000000-0000-0000-0000-0000000632c0')::text from u$q$);
insert into resultado (prueba, esperado, resultado)
select '1h cambiarle el cliente a uno distinto del de la cotización', 'contiene: otro cliente', pg_temp.intentar($q$
  update proyectos set cliente_id = '00000000-0000-0000-0000-0000000632c1' where id = '00000000-0000-0000-0000-0000000632a0'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000631a0');
insert into resultado (prueba, esperado, resultado)
select '1i P cambia el cliente de un proyecto con cotización', 'contiene: requiere permiso de Comercial', pg_temp.intentar($q$
  update proyectos set cliente_id = '00000000-0000-0000-0000-0000000632c1' where id = '00000000-0000-0000-0000-0000000632a0'$q$);

-- ============================================================ 2) quién ve los nombres
select pg_temp.como('00000000-0000-0000-0000-0000000631b0');
insert into resultado (prueba, esperado, resultado)
select '2a RRHH: la TABLA proyectos no / los NOMBRES sí', '0 / 3',
  pg_temp.valor($q$select count(*)::text from proyectos where id::text like '00000000-0000-0000-0000-0000000632a%'$q$) || ' / ' ||
  pg_temp.valor($q$select count(*)::text from fn_proyectos_nombres() where id::text like '00000000-0000-0000-0000-0000000632a%'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000631d0');
insert into resultado (prueba, esperado, resultado)
select '2b Coordinador (Operativo): los nombres sí', '3',
  pg_temp.valor($q$select count(*)::text from fn_proyectos_nombres() where id::text like '00000000-0000-0000-0000-0000000632a%'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000631c0');
insert into resultado (prueba, esperado, resultado)
select '2c RRHH "consultar" (chuleo): ni los nombres', '0',
  pg_temp.valor($q$select count(*)::text from fn_proyectos_nombres()$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000631e0');
insert into resultado (prueba, esperado, resultado)
select '2d técnico: ni la tabla ni la lista completa', '0 / 0',
  pg_temp.valor($q$select count(*)::text from proyectos$q$) || ' / ' ||
  pg_temp.valor($q$select count(*)::text from fn_proyectos_nombres()$q$);
insert into resultado (prueba, esperado, resultado)
select '2e técnico crea un proyecto', 'contiene: row-level security', pg_temp.intentar($q$
  insert into proyectos (codigo, nombre) values ('', 'x')$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '2f la lista devuelve solo id, código, nombre y estado', 'TABLE(id uuid, codigo text, nombre text, estado text)',
  pg_get_function_result('public.fn_proyectos_nombres()'::regprocedure);

-- ============================================================ 3) proyectos del técnico
insert into visitas (id, titulo, tipo, estado, tecnico_id, fecha_programada, proyecto_id, creada_por) values
  ('00000000-0000-0000-0000-0000000632f0', '__obra prueba 63__', 'obra', 'en_curso',
   '00000000-0000-0000-0000-0000000631e0', current_date, '00000000-0000-0000-0000-0000000632a1',
   '696d9431-5c4d-4043-aee4-3e4597094f26'),
  ('00000000-0000-0000-0000-0000000632f1', '__visita firmada prueba 63__', 'visita', 'en_curso',
   '00000000-0000-0000-0000-0000000631e0', current_date, null, '696d9431-5c4d-4043-aee4-3e4597094f26'),
  -- en un proyecto suspendido: no le aparece
  ('00000000-0000-0000-0000-0000000632f2', '__visita suspendida prueba 63__', 'visita', 'programada',
   '00000000-0000-0000-0000-0000000631e0', current_date, '00000000-0000-0000-0000-0000000632a2',
   '696d9431-5c4d-4043-aee4-3e4597094f26');
insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
values ('00000000-0000-0000-0000-0000000632f1', 'tecnico', 'T', '1', '00000000-0000-0000-0000-0000000632f1/firma-tecnico.png');
insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
values ('00000000-0000-0000-0000-0000000632f1', 'cliente', 'C', '2', '00000000-0000-0000-0000-0000000632f1/firma-cliente.png');
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000631e0');
insert into resultado (prueba, esperado, resultado)
select '3a el técnico ve solo el proyecto en ejecución donde tiene la obra', '__Conjunto prueba 63__',
  pg_temp.valor($q$select string_agg(nombre, ',') from fn_proyectos_del_tecnico()$q$);

-- ============================================================ 4) visitas.proyecto_id
insert into resultado (prueba, esperado, resultado)
select '4a el técnico cambia el proyecto de su visita', 'contiene: Solo Operativo', pg_temp.intentar($q$
  update visitas set proyecto_id = '00000000-0000-0000-0000-0000000632a1' where id = '00000000-0000-0000-0000-0000000632f1'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '4b Operativo pone el proyecto a una visita YA FIRMADA', 'aceptado (1 filas)', pg_temp.intentar($q$
  update visitas set proyecto_id = '00000000-0000-0000-0000-0000000632a1' where id = '00000000-0000-0000-0000-0000000632f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4c … pero el candado sigue: no cambia el título', 'contiene: no se edita', pg_temp.intentar($q$
  update visitas set titulo = 'otro' where id = '00000000-0000-0000-0000-0000000632f1'$q$);

-- ============================================================ 5) renovaciones con un proyecto sin cliente
-- Se corre y se deshace (el raise final), para no crear oportunidades reales.
reset role;
update proyectos set fecha_vencimiento_contrato = current_date + 30 where id = '00000000-0000-0000-0000-0000000632a1';
set local role authenticated;
insert into resultado (prueba, esperado, resultado)
select '5a renovaciones con un proyecto a mano sin cliente: no falla', 'contiene: deshecho', pg_temp.intentar($q$
  do $d$ declare n int; begin n := fn_crear_renovaciones_pendientes(); raise exception 'deshecho (% creadas)', n; end $d$$q$);

-- ============================================================ 6) privilegios
reset role;
insert into resultado (prueba, esperado, resultado)
select '6a funciones de Proyectos ejecutables por anon', '0',
  coalesce(nullif(string_agg(p.proname::text, ', ' order by p.proname), ''), '0')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_proyectos_nombres', 'fn_proyectos_del_tecnico', 'fn_crear_renovaciones_pendientes',
                    'fn_validar_proyecto_desde_cotizacion_aprobada', 'fn_candado_visita')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '6b el módulo existe y el Administrador es responsable', 'responsable',
  (select pr.nivel::text from permisos_rol pr join roles r on r.id = pr.rol_id
   where r.nombre = 'Administrador' and pr.modulo_id = 'proyectos');

-- ============================================================ limpieza (admin)
delete from visita_firmas where visita_id::text like '00000000-0000-0000-0000-0000000632f%';
delete from visitas where id::text like '00000000-0000-0000-0000-0000000632f%';
delete from proyectos where id::text like '00000000-0000-0000-0000-0000000632a%';
delete from cotizaciones where id::text like '00000000-0000-0000-0000-0000000632d%';
delete from clientes where id::text like '00000000-0000-0000-0000-0000000632c%';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000631_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proyectos prueba 63__', '__RRHH prueba 63__', '__consulta prueba 63__'));
delete from roles where nombre in ('__Proyectos prueba 63__', '__RRHH prueba 63__', '__consulta prueba 63__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000631_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

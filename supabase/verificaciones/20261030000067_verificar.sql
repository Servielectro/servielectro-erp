-- Verificación de la migración 67 (Contratos laborales). Correr DESPUÉS de la migración, todo junto.
-- Prueba que las plantillas nacen con títulos y sin texto legal, que el contrato copia la
-- plantilla, el candado al firmarse, Otro sí, y que nadie sin RRHH "trabajar" los ve.
-- Crea personas y datos de prueba y BORRA todo antes de mostrar el resultado.
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

-- ============================================================ personas de prueba (admin)
-- R = RRHH "trabajar" (como Alejandra). K = RRHH "consultar" (chuleo). T = técnico.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000067a0', 'authenticated', 'authenticated', 'rrhh.67@invalid.local'),
  ('00000000-0000-0000-0000-0000000067b0', 'authenticated', 'authenticated', 'consulta.67@invalid.local'),
  ('00000000-0000-0000-0000-0000000067c0', 'authenticated', 'authenticated', 'tecnico.67@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__RRHH prueba 67__'), ('__consulta prueba 67__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'rrhh', case r.nombre when '__RRHH prueba 67__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__RRHH prueba 67__', '__consulta prueba 67__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000067a0', '__RRHH prueba 67__', '__R 67__'),
  ('00000000-0000-0000-0000-0000000067b0', '__consulta prueba 67__', '__K 67__'),
  ('00000000-0000-0000-0000-0000000067c0', 'Técnicos', '__T 67__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

insert into empleados (id, primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base)
values ('00000000-0000-0000-0000-0000000067e1', 'Prueba', 'Sesenta Siete', '1000000067', '2026-01-15', 1);

-- ============================================================ 1) las plantillas nacen con títulos y sin texto
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000067a0');
insert into resultado (prueba, esperado, resultado)
select '1a una plantilla por tipo', 'indefinido, obra_labor, prestacion_servicios, termino_fijo',
  pg_temp.valor($q$select string_agg(tipo, ', ' order by tipo) from contrato_plantillas where nombre = 'Plantilla por defecto'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b cláusulas por tipo (laborales 13, prestación 15)', 'indefinido 13, obra_labor 13, prestacion_servicios 15, termino_fijo 13',
  pg_temp.valor($q$select string_agg(p.tipo || ' ' || (select count(*) from contrato_plantilla_clausulas c where c.plantilla_id = p.id), ', ' order by p.tipo)
                  from contrato_plantillas p where p.nombre = 'Plantilla por defecto'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c ningún texto legal: todas las cláusulas vacías', '0',
  pg_temp.valor($q$select count(*)::text from contrato_plantilla_clausulas where texto <> ''$q$);
insert into resultado (prueba, esperado, resultado)
select '1d pólizas (6) sin %, sin vigencia; cronograma (3) sin días', '6 / 0 / 3 / 0',
  pg_temp.valor($q$select (select count(*) from contrato_plantilla_polizas)::text || ' / ' ||
                         (select count(*) from contrato_plantilla_polizas where porcentaje is not null or durante_anios is not null or meses_extra is not null)::text || ' / ' ||
                         (select count(*) from contrato_plantilla_cronograma)::text || ' / ' ||
                         (select count(*) from contrato_plantilla_cronograma where dia_inicio is not null or duracion_habiles is not null)::text$q$);

-- ============================================================ 2) un contrato copia la plantilla
select fn_crear_contrato_laboral(jsonb_build_object(
  'tipo', 'prestacion_servicios', 'origen', 'empleado', 'empleado_id', '00000000-0000-0000-0000-0000000067e1',
  'plantilla_id', (select id from contrato_plantillas where tipo = 'prestacion_servicios' and nombre = 'Plantilla por defecto'),
  'forma_pago', '50-30-20', 'objeto', 'Prueba 67'));
insert into resultado (prueba, esperado, resultado)
select '2a crear desde la plantilla de prestación de servicios: copia 15 / 6 / 3', '15 / 6 / 3',
  pg_temp.valor($q$
    with c as (select id from contratos_laborales where objeto = 'Prueba 67')
    select (select count(*) from contrato_clausulas x, c where x.contrato_id = c.id)::text || ' / ' ||
           (select count(*) from contrato_polizas x, c where x.contrato_id = c.id)::text || ' / ' ||
           (select count(*) from contrato_cronograma x, c where x.contrato_id = c.id)::text from c$q$);
insert into resultado (prueba, esperado, resultado)
select '2b en borrador se pega el texto de una cláusula', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contrato_clausulas set texto = '__texto pegado por Jhojan__'
  where titulo = 'OBJETO' and contrato_id = (select id from contratos_laborales where objeto = 'Prueba 67')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c cambiar la plantilla después no cambia el contrato ya hecho', '__texto pegado por Jhojan__',
  pg_temp.valor($q$
    with u as (update contrato_plantilla_clausulas set texto = '__texto de plantilla 67__'
               where titulo = 'OBJETO' and plantilla_id = (select id from contrato_plantillas where tipo = 'prestacion_servicios' and nombre = 'Plantilla por defecto') returning 1)
    select texto from contrato_clausulas where titulo = 'OBJETO' and contrato_id = (select id from contratos_laborales where objeto = 'Prueba 67')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d contrato sin empleado ni trabajador', 'contiene: contratos_quien', pg_temp.intentar($q$
  select fn_crear_contrato_laboral(jsonb_build_object('tipo', 'indefinido', 'origen', 'externo'))$q$);

-- ============================================================ 3) firmado: candado, Otro sí y Renovar
insert into resultado (prueba, esperado, resultado)
select '3a pasa a vigente', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratos_laborales set estado = 'vigente' where objeto = 'Prueba 67'$q$);
insert into resultado (prueba, esperado, resultado)
select '3b vigente: no se edita una cláusula', 'contiene: Otro sí', pg_temp.intentar($q$
  update contrato_clausulas set texto = 'cambio' where contrato_id = (select id from contratos_laborales where objeto = 'Prueba 67' and clase = 'original')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c vigente: no se edita el contrato', 'contiene: Otro sí', pg_temp.intentar($q$
  update contratos_laborales set salario = 2 where objeto = 'Prueba 67' and clase = 'original'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d vigente: no se agrega una póliza', 'contiene: Otro sí', pg_temp.intentar($q$
  insert into contrato_polizas (contrato_id, poliza) select id, 'Nueva' from contratos_laborales where objeto = 'Prueba 67' and clase = 'original'$q$);
insert into resultado (prueba, esperado, resultado)
select '3e vigente: sí se sube el firmado', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratos_laborales set archivo_firmado_path = 'contratos/x/firmado.pdf' where objeto = 'Prueba 67' and clase = 'original'$q$);
insert into resultado (prueba, esperado, resultado)
select '3f vigente no vuelve a borrador', 'contiene: no pasa a', pg_temp.intentar($q$
  update contratos_laborales set estado = 'borrador' where objeto = 'Prueba 67' and clase = 'original'$q$);
select fn_crear_contrato_laboral(jsonb_build_object('clase', 'otro_si',
  'contrato_padre_id', (select id from contratos_laborales where objeto = 'Prueba 67' and clase = 'original')));
insert into resultado (prueba, esperado, resultado)
select '3g Otro sí: copia el contrato con su texto, enlazado al original', 'otro_si / __texto pegado por Jhojan__ / borrador',
  pg_temp.valor($q$
    select c.clase || ' / ' || (select texto from contrato_clausulas x where x.contrato_id = c.id and x.titulo = 'OBJETO') || ' / ' || c.estado
    from contratos_laborales c where c.clase = 'otro_si' and c.objeto = 'Prueba 67'$q$);
insert into resultado (prueba, esperado, resultado)
select '3h Renovar sin el contrato original', 'contiene: necesitan el contrato original', pg_temp.intentar($q$
  select fn_crear_contrato_laboral(jsonb_build_object('clase', 'renovacion'))$q$);
insert into resultado (prueba, esperado, resultado)
select '3i un contrato no se borra', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from contratos_laborales where objeto = 'Prueba 67'$q$);

-- ============================================================ 4) nadie más
select pg_temp.como('00000000-0000-0000-0000-0000000067b0');
insert into resultado (prueba, esperado, resultado)
select '4a RRHH "consultar" (chuleo): ni plantillas ni contratos', '0 / 0',
  pg_temp.valor($q$select count(*)::text from contrato_plantillas$q$) || ' / ' ||
  pg_temp.valor($q$select count(*)::text from contratos_laborales$q$);
insert into resultado (prueba, esperado, resultado)
select '4b RRHH "consultar" crea un contrato', 'contiene: requiere RRHH', pg_temp.intentar($q$
  select fn_crear_contrato_laboral(jsonb_build_object('tipo', 'indefinido', 'origen', 'externo', 'trabajador', 'x'))$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000067c0');
insert into resultado (prueba, esperado, resultado)
select '4c técnico: nada', '0', pg_temp.valor($q$select count(*)::text from contratos_laborales$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '4d funciones: crear (anon no) y candado (nadie)', 'false / false',
  has_function_privilege('anon', 'public.fn_crear_contrato_laboral(jsonb)', 'EXECUTE')::text || ' / ' ||
  has_function_privilege('authenticated', 'public.fn_contrato_candado()', 'EXECUTE')::text;

-- ============================================================ limpieza (admin)
update contrato_plantilla_clausulas set texto = '' where texto = '__texto de plantilla 67__';
delete from contratos_laborales where contrato_padre_id in (select id from contratos_laborales where objeto = 'Prueba 67');
delete from contratos_laborales where objeto = 'Prueba 67';
delete from empleados where id = '00000000-0000-0000-0000-0000000067e1';

delete from perfiles where id::text like '00000000-0000-0000-0000-0000000067_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__RRHH prueba 67__', '__consulta prueba 67__'));
delete from roles where nombre in ('__RRHH prueba 67__', '__consulta prueba 67__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000067_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

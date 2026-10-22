-- Verificación de la migración 66 (Personal). Correr DESPUÉS de la migración, todo junto.
-- Prueba la ficha (sin contraseña), la dotación, que liquidación, desprendible y caja menor
-- son captura que no se edita (se anula con motivo), y que nadie sin RRHH "trabajar" ve salarios.
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
  ('00000000-0000-0000-0000-0000000066a0', 'authenticated', 'authenticated', 'rrhh.66@invalid.local'),
  ('00000000-0000-0000-0000-0000000066b0', 'authenticated', 'authenticated', 'consulta.66@invalid.local'),
  ('00000000-0000-0000-0000-0000000066c0', 'authenticated', 'authenticated', 'tecnico.66@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__RRHH prueba 66__'), ('__consulta prueba 66__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'rrhh', case r.nombre when '__RRHH prueba 66__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__RRHH prueba 66__', '__consulta prueba 66__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000066a0', '__RRHH prueba 66__', '__R 66__'),
  ('00000000-0000-0000-0000-0000000066b0', '__consulta prueba 66__', '__K 66__'),
  ('00000000-0000-0000-0000-0000000066c0', 'Técnicos', '__T 66__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- ============================================================ 1) la ficha (R)
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000066a0');
insert into resultado (prueba, esperado, resultado)
select '1a RRHH crea la ficha, enlazada al usuario del técnico', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into empleados (id, perfil_id, primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base, direccion, tipo_contrato, talla_camisa)
  values ('00000000-0000-0000-0000-0000000066e1', '00000000-0000-0000-0000-0000000066c0', 'Prueba', 'Sesenta Seis', '1000000066', '2026-01-15', 1, 'Calle 1', 'indefinido', 'M')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b mismo documento otra vez', 'contiene: duplicate key', pg_temp.intentar($q$
  insert into empleados (primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base)
  values ('Otro', 'Igual', '1000000066', '2026-01-15', 1)$q$);
insert into resultado (prueba, esperado, resultado)
select '1c el mismo usuario en dos fichas', 'contiene: duplicate key', pg_temp.intentar($q$
  insert into empleados (perfil_id, primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base)
  values ('00000000-0000-0000-0000-0000000066c0', 'Otro', 'Usuario', '2000000066', '2026-01-15', 1)$q$);
insert into resultado (prueba, esperado, resultado)
select '1d la ficha no tiene ninguna columna de contraseña', '0',
  (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'empleados'
     and (column_name ilike '%contrase%' or column_name ilike '%password%' or column_name ilike '%clave%'));
insert into resultado (prueba, esperado, resultado)
select '1e sobrescribe un parámetro de la empresa (y lo devuelve a heredar)', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$insert into empleado_parametros (empleado_id, clave, valor) values ('00000000-0000-0000-0000-0000000066e1', 'auxilio_transporte', 5)$q$)
  || ' / ' || pg_temp.intentar($q$delete from empleado_parametros where empleado_id = '00000000-0000-0000-0000-0000000066e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f archivo de hoja de vida en la carpeta de OTRO empleado', 'contiene: empleado_archivos_ruta', pg_temp.intentar($q$
  insert into empleado_archivos (empleado_id, storage_path) values ('00000000-0000-0000-0000-0000000066e1', 'personal/00000000-0000-0000-0000-000000000000/hv.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '1g archivo de hoja de vida en su carpeta', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into empleado_archivos (empleado_id, storage_path) values ('00000000-0000-0000-0000-0000000066e1', 'personal/00000000-0000-0000-0000-0000000066e1/hv.pdf')$q$);

-- ============================================================ 2) dotación
insert into resultado (prueba, esperado, resultado)
select '2a entrega sin herramienta ni nombre', 'contiene: dotacion_que', pg_temp.intentar($q$
  insert into dotacion_entregas (empleado_id, fecha_entrega) values ('00000000-0000-0000-0000-0000000066e1', current_date)$q$);
insert into resultado (prueba, esperado, resultado)
select '2b herramienta del inventario entregada, y EPP por nombre', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$
    with h as (insert into herramientas (id, nombre, serial) values ('00000000-0000-0000-0000-0000000066f1', '__Taladro prueba 66__', 'S-66') returning id)
    insert into dotacion_entregas (id, empleado_id, herramienta_id, fecha_entrega) select '00000000-0000-0000-0000-0000000066d1', '00000000-0000-0000-0000-0000000066e1', id, current_date from h$q$)
  || ' / ' || pg_temp.intentar($q$insert into dotacion_entregas (empleado_id, categoria, nombre, talla, fecha_entrega)
    values ('00000000-0000-0000-0000-0000000066e1', 'epp', 'Botas dieléctricas', '40', current_date)$q$);
insert into resultado (prueba, esperado, resultado)
select '2c una entrega se edita y se borra (NEXGO)', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$update dotacion_entregas set observacion = 'ok' where id = '00000000-0000-0000-0000-0000000066d1'$q$)
  || ' / ' || pg_temp.intentar($q$delete from dotacion_entregas where id = '00000000-0000-0000-0000-0000000066d1'$q$);

-- ============================================================ 3) liquidación: captura, no cálculo
insert into resultado (prueba, esperado, resultado)
select '3a RRHH registra la liquidación que hizo por fuera, con sus líneas', 'aceptado (1 filas) / aceptado (1 filas)',
  pg_temp.intentar($q$insert into liquidaciones (id, empleado_id, fecha_inicio, fecha_corte, dias_laborados, neto_pagar, archivo_path)
    values ('00000000-0000-0000-0000-0000000066b1', '00000000-0000-0000-0000-0000000066e1', '2026-10-01', '2026-10-30', 30, 10, 'personal/x/liq.pdf')$q$)
  || ' / ' || pg_temp.intentar($q$insert into liquidacion_lineas (liquidacion_id, seccion, concepto, cantidad, valor)
    values ('00000000-0000-0000-0000-0000000066b1', 'extras_recargos', 'Hora extra diurna', 2, 1)$q$);
insert into resultado (prueba, esperado, resultado)
select '3b la liquidación no se edita', 'contiene: no se edita', pg_temp.intentar($q$
  update liquidaciones set neto_pagar = 99 where id = '00000000-0000-0000-0000-0000000066b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c una línea no se edita (no hay política de update: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update liquidacion_lineas set valor = 99 where liquidacion_id = '00000000-0000-0000-0000-0000000066b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d anular sin motivo', 'contiene: Escribe por qué se anula', pg_temp.intentar($q$
  update liquidaciones set anulado_en = now() where id = '00000000-0000-0000-0000-0000000066b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3e anular con motivo (quién y cuándo, la base)', 'R',
  pg_temp.valor($q$with u as (update liquidaciones set motivo_anulacion = 'Se liquidó mal el período'
                  where id = '00000000-0000-0000-0000-0000000066b1' returning anulado_por, anulado_en)
                  select case when anulado_por = '00000000-0000-0000-0000-0000000066a0' and anulado_en is not null then 'R' else '?' end from u$q$);
insert into resultado (prueba, esperado, resultado)
select '3f anulada: ni otra anulación ni líneas nuevas', 'contiene: Ya está anulado', pg_temp.intentar($q$
  update liquidaciones set motivo_anulacion = 'otra' where id = '00000000-0000-0000-0000-0000000066b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g línea nueva en una liquidación anulada', 'contiene: está anulado', pg_temp.intentar($q$
  insert into liquidacion_lineas (liquidacion_id, seccion, concepto) values ('00000000-0000-0000-0000-0000000066b1', 'ausencias', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '3h desprendible registrado (captura) y no editable', 'aceptado (1 filas) / contiene: no se edita',
  pg_temp.intentar($q$insert into desprendibles (id, empleado_id, fecha_pago, medio_pago, periodo_inicio, periodo_fin, neto_pagar)
    values ('00000000-0000-0000-0000-0000000066b2', '00000000-0000-0000-0000-0000000066e1', '2026-10-30', 'Transferencia', '2026-10-01', '2026-10-30', 10)$q$)
  || ' / contiene: ' || coalesce(substring(pg_temp.intentar($q$update desprendibles set neto_pagar = 1 where id = '00000000-0000-0000-0000-0000000066b2'$q$) from 'no se edita'), '?');

-- ============================================================ 4) caja menor
insert into resultado (prueba, esperado, resultado)
select '4a recibo de caja menor con dos líneas: total = suma', '30.00',
  pg_temp.valor($q$
    with r as (insert into caja_menor_recibos (id, empleado_id, concepto) values ('00000000-0000-0000-0000-0000000066b3', '00000000-0000-0000-0000-0000000066e1', 'Viáticos obra Villavicencio') returning id),
         l as (insert into caja_menor_lineas (recibo_id, concepto, documento_soporte, valor) select id, x.c, 'Factura', x.v from r, (values ('Hotel', 20), ('Alimentación', 10)) x(c, v) returning valor)
    select sum(valor)::numeric(14,2)::text from l$q$);
insert into resultado (prueba, esperado, resultado)
select '4b la vista suma el total', '30.00',
  pg_temp.valor($q$select total::numeric(14,2)::text from v_caja_menor_recibos where id = '00000000-0000-0000-0000-0000000066b3'$q$);
insert into resultado (prueba, esperado, resultado)
select '4c una línea del recibo no se cambia (no hay política de update: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update caja_menor_lineas set valor = 1 where recibo_id = '00000000-0000-0000-0000-0000000066b3'$q$);

-- ============================================================ 5) nadie más
select pg_temp.como('00000000-0000-0000-0000-0000000066b0');
insert into resultado (prueba, esperado, resultado)
select '5a RRHH "consultar" (chuleo): ni fichas, ni salarios, ni liquidaciones, ni caja menor', '0',
  pg_temp.valor($q$select ((select count(*) from empleados) + (select count(*) from liquidaciones) + (select count(*) from desprendibles)
                         + (select count(*) from caja_menor_recibos) + (select count(*) from empleado_archivos) + (select count(*) from dotacion_entregas))::text$q$);
insert into resultado (prueba, esperado, resultado)
select '5b RRHH "consultar" crea una ficha', 'contiene: row-level security', pg_temp.intentar($q$
  insert into empleados (primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base) values ('x', 'y', '3000000066', current_date, 1)$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000066c0');
insert into resultado (prueba, esperado, resultado)
select '5c el técnico enlazado tampoco lee su ficha ni las de otros (salarios)', '0',
  pg_temp.valor($q$select ((select count(*) from empleados) + (select count(*) from liquidaciones) + (select count(*) from v_caja_menor_recibos))::text$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '5d bucket rrhh-personal privado, sin políticas de update ni delete', 'false / 0',
  (select public::text from storage.buckets where id = 'rrhh-personal') || ' / ' ||
  (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'rrhh_personal%' and cmd in ('UPDATE', 'DELETE', 'ALL'));
insert into resultado (prueba, esperado, resultado)
select '5e funciones de trigger ejecutables por authenticated', '0',
  coalesce(nullif(string_agg(p.proname::text, ', '), ''), '0')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_rrhh_registro_anulable', 'fn_rrhh_hijo_de_registro')
  and has_function_privilege('authenticated', p.oid, 'EXECUTE');

-- ============================================================ limpieza (admin)
delete from caja_menor_lineas where recibo_id = '00000000-0000-0000-0000-0000000066b3';
delete from caja_menor_recibos where empleado_id = '00000000-0000-0000-0000-0000000066e1';
delete from liquidacion_lineas where liquidacion_id = '00000000-0000-0000-0000-0000000066b1';
delete from liquidaciones where empleado_id = '00000000-0000-0000-0000-0000000066e1';
delete from desprendibles where empleado_id = '00000000-0000-0000-0000-0000000066e1';
delete from dotacion_entregas where empleado_id = '00000000-0000-0000-0000-0000000066e1';
delete from herramientas where id = '00000000-0000-0000-0000-0000000066f1';
delete from empleado_archivos where empleado_id = '00000000-0000-0000-0000-0000000066e1';
delete from empleado_parametros where empleado_id = '00000000-0000-0000-0000-0000000066e1';
delete from empleados where id = '00000000-0000-0000-0000-0000000066e1' or numero_documento like '_000000066';

delete from perfiles where id::text like '00000000-0000-0000-0000-0000000066_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__RRHH prueba 66__', '__consulta prueba 66__'));
delete from roles where nombre in ('__RRHH prueba 66__', '__consulta prueba 66__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000066_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

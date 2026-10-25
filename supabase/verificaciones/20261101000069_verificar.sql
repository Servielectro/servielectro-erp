-- Verificación de la migración 69 (caja menor del técnico). Correr DESPUÉS de la migración, todo junto.
-- Prueba: RRHH asigna; el técnico ve solo su caja (y nada si su ficha no está enlazada); registra
-- gastos con foto; el saldo sale solo y puede quedar negativo; no se edita, se anula con motivo;
-- cerrada no cambia; otro técnico no ve ni toca nada; las reglas de liquidaciones no cambiaron.
-- Crea personas, fichas y cajas de prueba y BORRA todo antes de mostrar el resultado.
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
  ('00000000-0000-0000-0000-0000000069a0', 'authenticated', 'authenticated', 'rrhh.69@invalid.local'),
  ('00000000-0000-0000-0000-0000000069b0', 'authenticated', 'authenticated', 'consulta.69@invalid.local'),
  ('00000000-0000-0000-0000-0000000069c0', 'authenticated', 'authenticated', 'tecnico.69@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__RRHH prueba 69__'), ('__consulta prueba 69__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'rrhh', case r.nombre when '__RRHH prueba 69__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__RRHH prueba 69__', '__consulta prueba 69__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000069a0', '__RRHH prueba 69__', '__R 69__'),
  ('00000000-0000-0000-0000-0000000069b0', '__consulta prueba 69__', '__K 69__'),
  ('00000000-0000-0000-0000-0000000069c0', 'Técnicos', '__T 69__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- T2 = otro técnico. E1 = ficha de T (enlazada). E2 = ficha de T2 (enlazada). E3 = ficha sin usuario.
insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000069d0', 'authenticated', 'authenticated', 'tecnico2.69@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre) select '00000000-0000-0000-0000-0000000069d0', id, '__T2 69__' from roles where nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into empleados (id, perfil_id, primer_nombre, primer_apellido, numero_documento, fecha_ingreso, salario_base) values
  ('00000000-0000-0000-0000-0000000069e1', '00000000-0000-0000-0000-0000000069c0', 'Prueba', 'Uno', '1000000691', '2026-01-15', 1),
  ('00000000-0000-0000-0000-0000000069e2', '00000000-0000-0000-0000-0000000069d0', 'Prueba', 'Dos', '1000000692', '2026-01-15', 1),
  ('00000000-0000-0000-0000-0000000069e3', null, 'Prueba', 'Sin usuario', '1000000693', '2026-01-15', 1);

-- ============================================================ 1) RRHH crea y asigna
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000069a0');
insert into resultado (prueba, esperado, resultado)
select '1a recibo sin monto asignado', 'contiene: monto_asignado', pg_temp.intentar($q$
  insert into caja_menor_recibos (empleado_id, concepto) values ('00000000-0000-0000-0000-0000000069e1', 'Viáticos')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b RRHH asigna 100.000 a T (E1), 50.000 a T2 (E2) y 20.000 a una ficha sin usuario (E3)', 'aceptado (3 filas)', pg_temp.intentar($q$
  insert into caja_menor_recibos (id, empleado_id, concepto, monto_asignado) values
    ('00000000-0000-0000-0000-0000000069f1', '00000000-0000-0000-0000-0000000069e1', 'Viáticos obra Villavicencio', 100000),
    ('00000000-0000-0000-0000-0000000069f2', '00000000-0000-0000-0000-0000000069e2', 'Viáticos obra Tunja', 50000),
    ('00000000-0000-0000-0000-0000000069f3', '00000000-0000-0000-0000-0000000069e3', 'Viáticos sin enlace', 20000)$q$);
insert into resultado (prueba, esperado, resultado)
select '1c nace abierta, saldo = asignado', 'abierta / 100000.00',
  pg_temp.valor($q$select estado || ' / ' || saldo::text from v_caja_menor_recibos where id = '00000000-0000-0000-0000-0000000069f1'$q$);

-- ============================================================ 2) el técnico ve SOLO su caja
select pg_temp.como('00000000-0000-0000-0000-0000000069c0');
insert into resultado (prueba, esperado, resultado)
select '2a T ve solo su caja (no la de T2 ni la de la ficha sin usuario)', '1 / Viáticos obra Villavicencio',
  pg_temp.valor($q$select count(*)::text || ' / ' || max(concepto) from v_caja_menor_recibos$q$);
insert into resultado (prueba, esperado, resultado)
select '2a2 sus cajas, para decidir si la app le muestra el módulo', '1',
  pg_temp.valor($q$select count(*)::text from fn_mis_cajas_menores()$q$);
insert into resultado (prueba, esperado, resultado)
select '2b T no lee la ficha (salario) aunque vea su caja', '0',
  pg_temp.valor($q$select count(*)::text from empleados$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000069b0');
insert into resultado (prueba, esperado, resultado)
select '2c RRHH "consultar" (chuleo): ninguna caja', '0', pg_temp.valor($q$select count(*)::text from v_caja_menor_recibos$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000069a0');
insert into resultado (prueba, esperado, resultado)
select '2d RRHH ve todas las cajas, pero "sus" cajas son 0 (no tiene ficha enlazada): en su app no aparece el módulo', '3 / 0',
  pg_temp.valor($q$select count(*)::text from v_caja_menor_recibos$q$) || ' / ' || pg_temp.valor($q$select count(*)::text from fn_mis_cajas_menores()$q$);

-- ============================================================ 3) el técnico registra sus gastos
select pg_temp.como('00000000-0000-0000-0000-0000000069c0');
insert into resultado (prueba, esperado, resultado)
select '3a T registra un gasto en su caja (queda quién)', 'T',
  pg_temp.valor($q$with n as (insert into caja_menor_lineas (id, recibo_id, concepto, documento_soporte, valor)
                  values ('00000000-0000-0000-0000-0000000069b1', '00000000-0000-0000-0000-0000000069f1', 'Hotel', 'Factura 123', 30000) returning registrado_por)
                  select case when registrado_por = '00000000-0000-0000-0000-0000000069c0' then 'T' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '3b T registra un gasto en la caja de T2', 'contiene: row-level security', pg_temp.intentar($q$
  insert into caja_menor_lineas (recibo_id, concepto, valor) values ('00000000-0000-0000-0000-0000000069f2', 'Hotel', 1000)$q$);
insert into resultado (prueba, esperado, resultado)
select '3c gasto con fecha futura', 'contiene: no puede ser futura', pg_temp.intentar($q$
  insert into caja_menor_lineas (recibo_id, concepto, valor, fecha) values ('00000000-0000-0000-0000-0000000069f1', 'x', 1, (now() at time zone 'America/Bogota')::date + 3)$q$);
insert into resultado (prueba, esperado, resultado)
select '3d el saldo se calcula solo', '30000.00 / 70000.00',
  pg_temp.valor($q$select gastado::text || ' / ' || saldo::text from v_caja_menor_recibos where id = '00000000-0000-0000-0000-0000000069f1'$q$);
-- 3e: un gasto que pasa el saldo se acepta.
insert into caja_menor_lineas (id, recibo_id, concepto, valor) values ('00000000-0000-0000-0000-0000000069b2', '00000000-0000-0000-0000-0000000069f1', 'Alimentación', 90000);
insert into resultado (prueba, esperado, resultado)
select '3e pasarse del saldo NO se bloquea: queda negativo y con excedente', '-20000.00 / 20000.00',
  pg_temp.valor($q$select saldo::text || ' / ' || excedente::text from v_caja_menor_recibos where id = '00000000-0000-0000-0000-0000000069f1'$q$);

-- ============================================================ 4) no se edita: se anula con motivo
insert into resultado (prueba, esperado, resultado)
select '4a T cambia el valor de un gasto', 'contiene: no se edita', pg_temp.intentar($q$
  update caja_menor_lineas set valor = 1 where id = '00000000-0000-0000-0000-0000000069b2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4b T anula sin motivo', 'contiene: Escribe por qué se anula', pg_temp.intentar($q$
  update caja_menor_lineas set anulada_en = now() where id = '00000000-0000-0000-0000-0000000069b2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4c T anula con motivo: queda quién, y el saldo vuelve', 'T / 70000.00',
  pg_temp.valor($q$with u as (update caja_menor_lineas set motivo_anulacion = 'Valor mal digitado, era 9.000'
                  where id = '00000000-0000-0000-0000-0000000069b2' returning anulada_por)
                  select case when anulada_por = '00000000-0000-0000-0000-0000000069c0' then 'T' else '?' end from u$q$)
  || ' / ' || pg_temp.valor($q$select saldo::text from v_caja_menor_recibos where id = '00000000-0000-0000-0000-0000000069f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4d anular otra vez', 'contiene: ya está anulado', pg_temp.intentar($q$
  update caja_menor_lineas set motivo_anulacion = 'otra' where id = '00000000-0000-0000-0000-0000000069b2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4e borrar un gasto (no hay política: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  delete from caja_menor_lineas where id = '00000000-0000-0000-0000-0000000069b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4f T cambia el monto asignado (solo RRHH: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update caja_menor_recibos set monto_asignado = 999999 where id = '00000000-0000-0000-0000-0000000069f1'$q$);

-- ============================================================ 5) fotos (rrhh-soportes, caja-menor/{recibo}/)
insert into resultado (prueba, esperado, resultado)
select '5a T puede subir y abrir fotos de su caja', 'true / true',
  fn_rrhh_soporte_subible('caja-menor/00000000-0000-0000-0000-0000000069f1/f.jpg')::text || ' / ' ||
  fn_rrhh_soporte_visible('caja-menor/00000000-0000-0000-0000-0000000069f1/f.jpg')::text;
insert into resultado (prueba, esperado, resultado)
select '5b T registra la foto de su gasto', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into caja_menor_soportes (recibo_id, linea_id, storage_path) values
    ('00000000-0000-0000-0000-0000000069f1', '00000000-0000-0000-0000-0000000069b1', 'caja-menor/00000000-0000-0000-0000-0000000069f1/f.jpg')$q$);
insert into resultado (prueba, esperado, resultado)
select '5c foto de un gasto anulado', 'contiene: no corresponde a un gasto vigente', pg_temp.intentar($q$
  insert into caja_menor_soportes (recibo_id, linea_id, storage_path) values
    ('00000000-0000-0000-0000-0000000069f1', '00000000-0000-0000-0000-0000000069b2', 'caja-menor/00000000-0000-0000-0000-0000000069f1/g.jpg')$q$);
insert into resultado (prueba, esperado, resultado)
select '5d foto registrada con la ruta de otra caja', 'contiene: row-level security', pg_temp.intentar($q$
  insert into caja_menor_soportes (recibo_id, storage_path) values
    ('00000000-0000-0000-0000-0000000069f1', 'caja-menor/00000000-0000-0000-0000-0000000069f2/x.jpg')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000069d0');
insert into resultado (prueba, esperado, resultado)
select '5e T2 abre o sube fotos en la caja de T', 'false / false',
  fn_rrhh_soporte_visible('caja-menor/00000000-0000-0000-0000-0000000069f1/f.jpg')::text || ' / ' ||
  fn_rrhh_soporte_subible('caja-menor/00000000-0000-0000-0000-0000000069f1/z.jpg')::text;
insert into resultado (prueba, esperado, resultado)
select '5f T2 ve los gastos o fotos de T', '0 / 0',
  pg_temp.valor($q$select count(*)::text from caja_menor_lineas where recibo_id = '00000000-0000-0000-0000-0000000069f1'$q$) || ' / ' ||
  pg_temp.valor($q$select count(*)::text from caja_menor_soportes where recibo_id = '00000000-0000-0000-0000-0000000069f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '5g T2 anula un gasto de T (0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update caja_menor_lineas set motivo_anulacion = 'x' where id = '00000000-0000-0000-0000-0000000069b1'$q$);

-- ============================================================ 6) RRHH: monto, edición, cierre
select pg_temp.como('00000000-0000-0000-0000-0000000069a0');
insert into resultado (prueba, esperado, resultado)
select '6a RRHH ve los gastos de T en vivo', '2', pg_temp.valor($q$select count(*)::text from caja_menor_lineas where recibo_id = '00000000-0000-0000-0000-0000000069f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '6b RRHH sube el monto asignado con la caja abierta', '120000.00',
  pg_temp.valor($q$with u as (update caja_menor_recibos set monto_asignado = 150000 where id = '00000000-0000-0000-0000-0000000069f1' returning 1)
                  select (150000 - 30000)::numeric(14,2)::text from u$q$);
insert into resultado (prueba, esperado, resultado)
select '6c RRHH cambia el concepto', 'contiene: no se edita', pg_temp.intentar($q$
  update caja_menor_recibos set concepto = 'otro' where id = '00000000-0000-0000-0000-0000000069f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '6d RRHH cierra la caja (legaliza): queda quién', 'cerrada / R',
  pg_temp.valor($q$with u as (update caja_menor_recibos set estado = 'cerrada' where id = '00000000-0000-0000-0000-0000000069f1' returning estado, cerrada_por)
                  select estado || ' / ' || case when cerrada_por = '00000000-0000-0000-0000-0000000069a0' then 'R' else '?' end from u$q$);
insert into resultado (prueba, esperado, resultado)
select '6e cerrada: no cambia el monto', 'contiene: ya está cerrada', pg_temp.intentar($q$
  update caja_menor_recibos set monto_asignado = 1 where id = '00000000-0000-0000-0000-0000000069f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '6f cerrada: no se reabre', 'contiene: ya está cerrada', pg_temp.intentar($q$
  update caja_menor_recibos set estado = 'abierta' where id = '00000000-0000-0000-0000-0000000069f1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000069c0');
insert into resultado (prueba, esperado, resultado)
select '6g cerrada: T ya no registra gastos', 'contiene: cerrada o anulada', pg_temp.intentar($q$
  insert into caja_menor_lineas (recibo_id, concepto, valor) values ('00000000-0000-0000-0000-0000000069f1', 'Taxi', 5000)$q$);
insert into resultado (prueba, esperado, resultado)
select '6h cerrada: T ya no anula ni sube fotos', 'contiene: cerrada o anulada / false',
  'contiene: ' || coalesce(substring(pg_temp.intentar($q$update caja_menor_lineas set motivo_anulacion = 'x' where id = '00000000-0000-0000-0000-0000000069b1'$q$) from 'cerrada o anulada'), '?')
  || ' / ' || fn_rrhh_soporte_subible('caja-menor/00000000-0000-0000-0000-0000000069f1/w.jpg')::text;
insert into resultado (prueba, esperado, resultado)
select '6i cerrada: T sigue viéndola (sin caja abierta, la app no le muestra el módulo)', '1 / 0',
  pg_temp.valor($q$select count(*)::text from v_caja_menor_recibos$q$) || ' / ' ||
  pg_temp.valor($q$select count(*)::text from v_caja_menor_recibos where estado = 'abierta' and anulado_en is null$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000069a0');
insert into resultado (prueba, esperado, resultado)
select '6j la anulación de un recibo sigue igual (con motivo)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update caja_menor_recibos set motivo_anulacion = 'Se canceló el viaje' where id = '00000000-0000-0000-0000-0000000069f2'$q$);

-- ============================================================ 7) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '7a ninguna función de trigger es security definer', '0',
  (select count(*)::text from pg_proc where proname in ('fn_caja_menor_recibo_reglas', 'fn_caja_menor_linea_reglas', 'fn_caja_menor_soporte_reglas') and prosecdef);
insert into resultado (prueba, esperado, resultado)
select '7b funciones de trigger: authenticated no las ejecuta; anon no ejecuta las de consulta', '0',
  (select count(*)::text from pg_proc p where p.proname in ('fn_caja_menor_recibo_reglas', 'fn_caja_menor_linea_reglas', 'fn_caja_menor_soporte_reglas')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  || case when has_function_privilege('anon', 'public.fn_caja_menor_es_mia(uuid)', 'EXECUTE') or has_function_privilege('anon', 'public.fn_caja_menor_abierta(uuid)', 'EXECUTE')
               or has_function_privilege('anon', 'public.fn_mis_cajas_menores()', 'EXECUTE') then ' (anon sí)' else '' end;
insert into resultado (prueba, esperado, resultado)
select '7c las reglas genéricas de liquidaciones y desprendibles no cambiaron', 'trg_desprendibles_anulable, trg_liquidaciones_anulable',
  (select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgname in ('trg_liquidaciones_anulable', 'trg_desprendibles_anulable') and not tgisinternal);

-- ============================================================ limpieza (admin)
delete from caja_menor_soportes where recibo_id::text like '00000000-0000-0000-0000-0000000069f%';
delete from caja_menor_lineas where recibo_id::text like '00000000-0000-0000-0000-0000000069f%';
delete from caja_menor_recibos where id::text like '00000000-0000-0000-0000-0000000069f%';
delete from empleados where id::text like '00000000-0000-0000-0000-0000000069e%';
delete from perfiles where id = '00000000-0000-0000-0000-0000000069d0';
delete from auth.users where id = '00000000-0000-0000-0000-0000000069d0';

delete from perfiles where id::text like '00000000-0000-0000-0000-0000000069_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__RRHH prueba 69__', '__consulta prueba 69__'));
delete from roles where nombre in ('__RRHH prueba 69__', '__consulta prueba 69__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000069_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

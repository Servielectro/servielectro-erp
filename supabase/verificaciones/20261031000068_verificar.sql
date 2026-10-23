-- Verificación de la migración 68 (abonos: para qué fecha lo requiere). Correr DESPUÉS de la migración,
-- todo junto. Prueba la regla de la fecha (desde mañana; hoy solo con calamidad justificada; nunca
-- retroactivo), que la pantalla puede pedir el porqué, y que siguen en pie las reglas de la 64:
-- solo el dueño edita en "solicitado" y un abono desembolsado no cambia para nadie.
-- Crea personas y abonos de prueba y BORRA todo antes de mostrar el resultado.
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
  ('00000000-0000-0000-0000-0000000068a0', 'authenticated', 'authenticated', 'rrhh.68@invalid.local'),
  ('00000000-0000-0000-0000-0000000068b0', 'authenticated', 'authenticated', 'consulta.68@invalid.local'),
  ('00000000-0000-0000-0000-0000000068c0', 'authenticated', 'authenticated', 'tecnico.68@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__RRHH prueba 68__'), ('__consulta prueba 68__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'rrhh', case r.nombre when '__RRHH prueba 68__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__RRHH prueba 68__', '__consulta prueba 68__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000068a0', '__RRHH prueba 68__', '__R 68__'),
  ('00000000-0000-0000-0000-0000000068b0', '__consulta prueba 68__', '__K 68__'),
  ('00000000-0000-0000-0000-0000000068c0', 'Técnicos', '__T 68__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- J = Jhojan (aprobador de abonos). T = técnico de prueba (de la cabecera).
-- ============================================================ 1) la fecha requerida
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000068c0');
insert into resultado (prueba, esperado, resultado)
select '1a abono sin fecha requerida', 'contiene: Indica para qué fecha', pg_temp.intentar($q$
  insert into abonos (monto) values (100000)$q$);
insert into resultado (prueba, esperado, resultado)
select '1b para HOY sin calamidad: dice el porqué (flujo de caja)', 'contiene: sujetos al flujo de caja de la compañía', pg_temp.intentar($q$
  insert into abonos (monto, fecha_requerida) values (100000, (now() at time zone 'America/Bogota')::date)$q$);
insert into resultado (prueba, esperado, resultado)
select '1c para AYER sin calamidad', 'contiene: no se pueden pedir para el mismo día', pg_temp.intentar($q$
  insert into abonos (monto, fecha_requerida) values (100000, (now() at time zone 'America/Bogota')::date - 1)$q$);
insert into resultado (prueba, esperado, resultado)
select '1d para MAÑANA, sin justificación (no se pide)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into abonos (id, monto, fecha_requerida) values ('00000000-0000-0000-0000-0000000068a1', 100000, (now() at time zone 'America/Bogota')::date + 1)$q$);
insert into resultado (prueba, esperado, resultado)
select '1e calamidad para HOY sin justificación', 'contiene: abonos_calamidad_justificada', pg_temp.intentar($q$
  insert into abonos (monto, fecha_requerida, urgencia_calamidad) values (100000, (now() at time zone 'America/Bogota')::date, true)$q$);
insert into resultado (prueba, esperado, resultado)
select '1f calamidad para HOY con justificación', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into abonos (id, monto, fecha_requerida, urgencia_calamidad, justificacion)
  values ('00000000-0000-0000-0000-0000000068a2', 200000, (now() at time zone 'America/Bogota')::date, true, 'Accidente de mi madre')$q$);
insert into resultado (prueba, esperado, resultado)
select '1g calamidad para AYER (no retroactivo)', 'contiene: no para días anteriores', pg_temp.intentar($q$
  insert into abonos (monto, fecha_requerida, urgencia_calamidad, justificacion) values (100000, (now() at time zone 'America/Bogota')::date - 1, true, 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '1h la pantalla puede pedir el porqué antes de enviar (hoy / mañana / calamidad hoy)', 'flujo / ok / ok',
  pg_temp.valor($q$select case when fn_abono_fecha_bloqueada(false, (now() at time zone 'America/Bogota')::date) like '%flujo de caja%' then 'flujo' else '?' end
                  || ' / ' || coalesce(fn_abono_fecha_bloqueada(false, (now() at time zone 'America/Bogota')::date + 1), 'ok')
                  || ' / ' || coalesce(fn_abono_fecha_bloqueada(true, (now() at time zone 'America/Bogota')::date), 'ok')$q$);

-- ============================================================ 2) cambios del dueño en "solicitado"
insert into resultado (prueba, esperado, resultado)
select '2a el dueño mueve la fecha a hoy sin calamidad', 'contiene: flujo de caja', pg_temp.intentar($q$
  update abonos set fecha_requerida = (now() at time zone 'America/Bogota')::date where id = '00000000-0000-0000-0000-0000000068a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b el dueño quita la justificación de una calamidad', 'contiene: abonos_calamidad_justificada', pg_temp.intentar($q$
  update abonos set justificacion = null where id = '00000000-0000-0000-0000-0000000068a2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c el dueño mueve la fecha a pasado mañana', 'aceptado (1 filas)', pg_temp.intentar($q$
  update abonos set fecha_requerida = (now() at time zone 'America/Bogota')::date + 2 where id = '00000000-0000-0000-0000-0000000068a1'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2d el aprobador cambia la fecha requerida', 'contiene: Solo quien lo pidió', pg_temp.intentar($q$
  update abonos set fecha_requerida = (now() at time zone 'America/Bogota')::date + 5 where id = '00000000-0000-0000-0000-0000000068a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e el aprobador ve la fecha, la calamidad y su justificación', 'true / Accidente de mi madre',
  pg_temp.valor($q$select urgencia_calamidad::text || ' / ' || justificacion from abonos where id = '00000000-0000-0000-0000-0000000068a2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f aprueba el de mañana', 'aceptado (1 filas)', pg_temp.intentar($q$
  update abonos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000068a1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000068c0');
insert into resultado (prueba, esperado, resultado)
select '2g aprobado: el dueño ya no cambia la fecha ni marca calamidad', 'contiene: mientras no esté decidido', pg_temp.intentar($q$
  update abonos set urgencia_calamidad = true, justificacion = 'x' where id = '00000000-0000-0000-0000-0000000068a1'$q$);

-- ============================================================ 3) desembolsado no cambia, para nadie
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3a J desembolsa la calamidad (aprueba y transfiere en un paso)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update abonos set estado = 'desembolsado', fecha_desembolso = (now() at time zone 'America/Bogota')::date,
    pantallazo_path = 'abonos/00000000-0000-0000-0000-0000000068a2/p.jpg' where id = '00000000-0000-0000-0000-0000000068a2'$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '3b ni el administrador por SQL cambia la fecha de un desembolsado', 'contiene: ya se desembolsó', pg_temp.intentar($q$
  update abonos set fecha_requerida = fecha_requerida + 1 where id = '00000000-0000-0000-0000-0000000068a2'$q$);

-- ============================================================ 4) estructura y privilegios
insert into resultado (prueba, esperado, resultado)
select '4a columnas: sin "motivo"; justificación opcional; fecha y urgencia obligatorias', 'fecha_requerida NO / justificacion YES / urgencia_calamidad NO / motivo ausente',
  (select string_agg(column_name || ' ' || is_nullable, ' / ' order by column_name) from information_schema.columns
   where table_schema = 'public' and table_name = 'abonos' and column_name in ('justificacion', 'fecha_requerida', 'urgencia_calamidad'))
  || ' / motivo ' || case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'abonos' and column_name = 'motivo') then 'existe' else 'ausente' end;
insert into resultado (prueba, esperado, resultado)
select '4b fn_abono_fecha_bloqueada: anon no; authenticated sí', 'false / true',
  has_function_privilege('anon', 'public.fn_abono_fecha_bloqueada(boolean, date)', 'EXECUTE')::text || ' / ' ||
  has_function_privilege('authenticated', 'public.fn_abono_fecha_bloqueada(boolean, date)', 'EXECUTE')::text;
insert into resultado (prueba, esperado, resultado)
select '4c el trigger no lo ejecuta authenticated', 'false',
  has_function_privilege('authenticated', 'public.fn_abonos_reglas()', 'EXECUTE')::text;

-- ============================================================ limpieza (admin)
delete from abonos where persona_id::text like '00000000-0000-0000-0000-0000000068%';

delete from perfiles where id::text like '00000000-0000-0000-0000-0000000068_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__RRHH prueba 68__', '__consulta prueba 68__'));
delete from roles where nombre in ('__RRHH prueba 68__', '__consulta prueba 68__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000068_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

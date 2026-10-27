-- Verificación de la migración 84 (corregir un abono desembolsado, con rastro).
-- Correr DESPUÉS de la migración. Crea un aprobador con tope, un técnico, una tercera persona y
-- tres abonos de prueba, y BORRA todo al final. Todas las filas deben decir OK.
-- La contraseña la verifica el servidor (migración 62); aquí se simula su marca como admin.
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

-- La marca de "confirmó con su contraseña" (en producción la pone el servidor con la clave de servicio).
create or replace function pg_temp.confirmo(p_usuario uuid)
returns void language sql as $$
  insert into reautenticaciones (perfil_id, verificada_en, fallos) values (p_usuario, now(), 0)
  on conflict (perfil_id) do update set verificada_en = now(), fallos = 0, bloqueada_hasta = null;
$$;

-- ============================================================ personas y abonos de prueba (admin)
-- A = aprobador de abonos con tope 300.000. T = técnico dueño de los abonos. O = otra persona.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000084a0', 'authenticated', 'authenticated', 'aprobador.84@invalid.local'),
  ('00000000-0000-0000-0000-0000000084c0', 'authenticated', 'authenticated', 'tecnico.84@invalid.local'),
  ('00000000-0000-0000-0000-0000000084d0', 'authenticated', 'authenticated', 'otro.84@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000084a0', '__A 84__'),
             ('00000000-0000-0000-0000-0000000084c0', '__T 84__'),
             ('00000000-0000-0000-0000-0000000084d0', '__O 84__')) v(id, nombre)
join roles r on r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into rrhh_aprobadores (perfil_id, aprueba_permisos, aprueba_abonos, monto_maximo_abono)
values ('00000000-0000-0000-0000-0000000084a0', false, true, 300000)
on conflict (perfil_id) do update set aprueba_abonos = true, monto_maximo_abono = 300000;

-- Un abono desembolsado como el de Camilo (pidió 350.000; quedó 350.000 aprobado por el relleno),
-- otro desembolsado y uno apenas solicitado. Se siembran como admin con el disparador apagado.
alter table abonos disable trigger trg_abonos_reglas;
insert into abonos (id, persona_id, monto, monto_aprobado, fecha_requerida, fecha_solicitud, estado, fecha_desembolso, pantallazo_path) values
  ('00000000-0000-0000-0000-0000000084b1', '00000000-0000-0000-0000-0000000084c0', 350000, 350000, '2026-10-10', '2026-10-09', 'desembolsado', '2026-10-10', 'abonos/00000000-0000-0000-0000-0000000084b1/p.jpg'),
  ('00000000-0000-0000-0000-0000000084b2', '00000000-0000-0000-0000-0000000084c0', 100000, 100000, '2026-10-10', '2026-10-09', 'desembolsado', '2026-10-14', 'abonos/00000000-0000-0000-0000-0000000084b2/p.jpg'),
  ('00000000-0000-0000-0000-0000000084b3', '00000000-0000-0000-0000-0000000084c0', 50000, null, '2026-10-30', '2026-10-27', 'solicitado', null, null);
alter table abonos enable trigger trg_abonos_reglas;

-- ============================================================ 1) sin corrección, no cambia
insert into resultado (prueba, esperado, resultado)
select '1a ni el administrador por SQL cambia lo aprobado de un desembolsado sin dejar rastro', 'contiene: se corrige (con motivo y contraseña)', pg_temp.intentar($q$
  update abonos set monto_aprobado = 200000 where id = '00000000-0000-0000-0000-0000000084b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b el pantallazo de un desembolsado sigue sin cambiar', 'contiene: el registro y el pantallazo no se cambian', pg_temp.intentar($q$
  update abonos set pantallazo_path = 'abonos/00000000-0000-0000-0000-0000000084b1/otro.jpg' where id = '00000000-0000-0000-0000-0000000084b1'$q$);

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000084a0');
insert into resultado (prueba, esperado, resultado)
select '1c el aprobador tampoco lo cambia con un update directo', 'contiene: se corrige (con motivo y contraseña)', pg_temp.intentar($q$
  update abonos set monto_aprobado = 200000 where id = '00000000-0000-0000-0000-0000000084b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d nadie escribe el rastro a mano', 'contiene: permission denied', pg_temp.intentar($q$
  insert into correcciones (tabla, registro_id, campo, valor_anterior, valor_nuevo, motivo, corregido_por_nombre)
  values ('abonos', '00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '350000', '200000', 'x', 'x')$q$);

-- ============================================================ 2) corregir
insert into resultado (prueba, esperado, resultado)
select '2a sin confirmar la contraseña, no', 'contiene: confirma con tu contraseña', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '200000', 'Se giraron 200.000')$q$);
reset role;
select pg_temp.confirmo('00000000-0000-0000-0000-0000000084a0');
select pg_temp.confirmo('00000000-0000-0000-0000-0000000084d0');
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000084d0');
insert into resultado (prueba, esperado, resultado)
select '2b quien no aprueba abonos no corrige, aunque confirme la contraseña', 'contiene: Solo el aprobador de abonos', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '200000', 'Se giraron 200.000')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000084a0');
insert into resultado (prueba, esperado, resultado)
select '2c lo solicitado no se corrige', 'contiene: solo se corrige lo aprobado o la fecha', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto', '200000', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d el pantallazo no se corrige: es un abono mal registrado', 'contiene: es un abono mal registrado', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'pantallazo_path', 'abonos/x.jpg', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2e sin motivo, no', 'contiene: Escribe el motivo', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '200000', '  ')$q$);
insert into resultado (prueba, esperado, resultado)
select '2f más de lo solicitado, no', 'contiene: No se aprueba más de lo solicitado', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '400000', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2g por encima de su tope, no', 'contiene: supera tu tope', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '320000', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2h un abono sin desembolsar no se corrige', 'contiene: Solo se corrige un abono ya desembolsado', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b3', 'monto_aprobado', '40000', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2i corrige 350.000 → 200.000', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '200000', 'Se giraron 200.000, no 350.000')$q$);
insert into resultado (prueba, esperado, resultado)
select '2j quedó: lo solicitado intacto, lo aprobado corregido', '350000.00 / 200000.00',
  pg_temp.valor($q$select monto::text || ' / ' || monto_aprobado::text from abonos where id = '00000000-0000-0000-0000-0000000084b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2k el rastro: campo, antes, ahora, motivo, quién', 'monto_aprobado / 350000.00 → 200000.00 / Se giraron 200.000, no 350.000 / __A 84__ / A',
  pg_temp.valor($q$select campo || ' / ' || (valor_anterior #>> '{}') || ' → ' || (valor_nuevo #>> '{}') || ' / ' || motivo || ' / ' || corregido_por_nombre
                   || ' / ' || case when corregido_por = '00000000-0000-0000-0000-0000000084a0' then 'A' else '?' end
                   from correcciones where registro_id = '00000000-0000-0000-0000-0000000084b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2l el mismo valor otra vez: nada que corregir', 'contiene: no hay nada que corregir', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '200000', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2m fecha futura, no', 'contiene: no puede ser futura', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b2', 'fecha_desembolso', ((now() at time zone 'America/Bogota')::date + 3)::text, 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '2n corrige la fecha del desembolso (14 → 17 de octubre)', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b2', 'fecha_desembolso', '2026-10-17', 'El giro salió el 17, no el 14')$q$);
insert into resultado (prueba, esperado, resultado)
select '2o ... y la quincena del descuento pasó a la segunda de octubre', '2026-10-17 / 2026-10-16',
  pg_temp.valor($q$select fecha_desembolso::text || ' / ' || quincena_descuento::text from abonos where id = '00000000-0000-0000-0000-0000000084b2'$q$);

-- ============================================================ 3) lo ve el dueño de la plata
select pg_temp.como('00000000-0000-0000-0000-0000000084c0');
insert into resultado (prueba, esperado, resultado)
select '3a el técnico ve las correcciones de sus abonos', '2',
  pg_temp.valor($q$select count(*)::text from correcciones where registro_id::text like '00000000-0000-0000-0000-0000000084b%'$q$);
insert into resultado (prueba, esperado, resultado)
select '3b y le llegó un aviso por cada una, sin montos en el texto', '2 / sin montos',
  pg_temp.valor($q$select count(*)::text || ' / ' || case when bool_or(coalesce(titulo, '') || coalesce(cuerpo, '') ~ '[0-9]{3}') then 'CON MONTOS' else 'sin montos' end
                   from notificaciones where destinatario_id = '00000000-0000-0000-0000-0000000084c0' and tipo = 'abono_corregido'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c el técnico no corrige', 'contiene: Solo el aprobador de abonos', pg_temp.intentar($q$
  select fn_corregir_abono('00000000-0000-0000-0000-0000000084b1', 'monto_aprobado', '100000', 'x')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000084d0');
insert into resultado (prueba, esperado, resultado)
select '3d otra persona no ve las correcciones de abonos ajenos', '0',
  pg_temp.valor($q$select count(*)::text from correcciones where registro_id::text like '00000000-0000-0000-0000-0000000084b%'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000084a0');
insert into resultado (prueba, esperado, resultado)
select '3e el rastro no se edita ni se borra (ni el aprobador)', 'sin permiso / sin permiso',
  replace(pg_temp.intentar($q$update correcciones set motivo = 'otro' where registro_id = '00000000-0000-0000-0000-0000000084b1'$q$), 'RECHAZADO [42501]: permission denied for table correcciones', 'sin permiso') || ' / ' ||
  replace(pg_temp.intentar($q$delete from correcciones where registro_id = '00000000-0000-0000-0000-0000000084b1'$q$), 'RECHAZADO [42501]: permission denied for table correcciones', 'sin permiso');
reset role;
insert into resultado (prueba, esperado, resultado)
select '3f ni el administrador lo edita', 'contiene: no se edita ni se borra', pg_temp.intentar($q$
  update correcciones set motivo = 'otro' where registro_id = '00000000-0000-0000-0000-0000000084b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3g anónimo no ve correcciones ni corrige', 'false / false',
  pg_temp.valor($q$select has_table_privilege('anon', 'correcciones', 'select')::text || ' / ' ||
                   has_function_privilege('anon', 'fn_corregir_abono(uuid, text, text, text)', 'execute')::text$q$);

-- ============================================================ 4) la corrección hecha a mano
insert into resultado (prueba, esperado, resultado)
select '4a el abono de Camilo tiene su rastro (en esta base: si existe)', 'ok',
  pg_temp.valor($q$select case
     when not exists (select 1 from abonos where id = 'a9d1b4f9-1636-477b-be9a-90ce5bb88e87') then 'ok'
     when exists (select 1 from correcciones where registro_id = 'a9d1b4f9-1636-477b-be9a-90ce5bb88e87'
                    and campo = 'monto_aprobado' and (valor_anterior #>> '{}')::numeric = 350000 and (valor_nuevo #>> '{}')::numeric = 200000) then 'ok'
     else 'FALTA el rastro' end$q$);

-- ============================================================ limpieza (admin)
delete from notificaciones where destinatario_id::text like '00000000-0000-0000-0000-0000000084_0';
delete from correcciones where registro_id::text like '00000000-0000-0000-0000-0000000084b%';
delete from abonos where persona_id = '00000000-0000-0000-0000-0000000084c0';
delete from reautenticaciones where perfil_id::text like '00000000-0000-0000-0000-0000000084_0';
delete from rrhh_aprobadores where perfil_id = '00000000-0000-0000-0000-0000000084a0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000084_0';
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000084_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

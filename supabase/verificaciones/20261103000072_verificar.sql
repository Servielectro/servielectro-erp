-- Verificación de la migración 72 (abonos: lo aprobado al lado de lo solicitado). Correr DESPUÉS
-- de la migración, todo junto. Prueba: el que pide no pone lo aprobado; el aprobador aprueba menos
-- (o igual si no escribe nada), nunca más; el tope se mide contra lo aprobado; rechazar y anular
-- lo dejan vacío; se ajusta solo al aprobar o desembolsar; desembolsado no cambia; lo solicitado
-- nunca se reescribe. Crea un técnico, un segundo aprobador y abonos de prueba y BORRA todo.
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
-- T = técnico que pide. A = segundo aprobador con tope de 250.000. J = Jhojan (aprobador, sin tope).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000072a0', 'authenticated', 'authenticated', 'aprobador.72@invalid.local'),
  ('00000000-0000-0000-0000-0000000072c0', 'authenticated', 'authenticated', 'tecnico.72@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000072a0', '__A 72__'),
  ('00000000-0000-0000-0000-0000000072c0', '__T 72__')
) v(id, nombre)
join roles r on r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into rrhh_aprobadores (perfil_id, aprueba_permisos, aprueba_abonos, monto_maximo_abono)
values ('00000000-0000-0000-0000-0000000072a0', false, true, 250000)
on conflict (perfil_id) do update set aprueba_abonos = true, monto_maximo_abono = 250000;

set local role authenticated;
-- ============================================================ 1) el que pide no pone lo aprobado
select pg_temp.como('00000000-0000-0000-0000-0000000072c0');
insert into resultado (prueba, esperado, resultado)
select '1a al pedir, lo aprobado queda vacío aunque lo mande', '(vacío)',
  pg_temp.valor($q$with n as (insert into abonos (id, monto, fecha_requerida, monto_aprobado) values
                  ('00000000-0000-0000-0000-0000000072b1', 350000, (now() at time zone 'America/Bogota')::date + 1, 350000) returning monto_aprobado)
                  select monto_aprobado::text from n$q$);
insert into abonos (id, monto, fecha_requerida) values
  ('00000000-0000-0000-0000-0000000072b2', 100000, (now() at time zone 'America/Bogota')::date + 1),
  ('00000000-0000-0000-0000-0000000072b3', 300000, (now() at time zone 'America/Bogota')::date + 1),
  ('00000000-0000-0000-0000-0000000072b4', 50000, (now() at time zone 'America/Bogota')::date + 1),
  ('00000000-0000-0000-0000-0000000072b5', 80000, (now() at time zone 'America/Bogota')::date + 1);
insert into resultado (prueba, esperado, resultado)
select '1b el que pide no escribe lo aprobado', 'contiene: Lo aprobado lo pone el aprobador', pg_temp.intentar($q$
  update abonos set monto_aprobado = 1000 where id = '00000000-0000-0000-0000-0000000072b1'$q$);

-- ============================================================ 2) el aprobador
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a pidió 350.000, se le aprueban 200.000: los dos quedan', '350000.00 / 200000.00',
  pg_temp.valor($q$with n as (update abonos set estado = 'aprobado', monto_aprobado = 200000 where id = '00000000-0000-0000-0000-0000000072b1'
                  returning monto, monto_aprobado) select monto::text || ' / ' || monto_aprobado::text from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2b aprobado sin escribir el valor: queda lo solicitado', '100000.00',
  pg_temp.valor($q$with n as (update abonos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000072b2'
                  returning monto_aprobado) select monto_aprobado::text from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2c aprobar más de lo solicitado', 'contiene: No se aprueba más de lo solicitado', pg_temp.intentar($q$
  update abonos set estado = 'aprobado', monto_aprobado = 400000 where id = '00000000-0000-0000-0000-0000000072b3'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000072a0');
insert into resultado (prueba, esperado, resultado)
select '2d aprobador con tope 250.000: el pedido de 300.000 completo, no', 'contiene: supera tu tope', pg_temp.intentar($q$
  update abonos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000072b3'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e ... pero sí aprobarle 250.000 (el tope se mide contra lo que se desembolsa)', '300000.00 / 250000.00',
  pg_temp.valor($q$with n as (update abonos set estado = 'aprobado', monto_aprobado = 250000 where id = '00000000-0000-0000-0000-0000000072b3'
                  returning monto, monto_aprobado) select monto::text || ' / ' || monto_aprobado::text from n$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2f al rechazar, lo aprobado queda vacío', 'rechazado / (sin)',
  pg_temp.valor($q$with n as (update abonos set estado = 'rechazado', motivo_rechazo = 'Flujo de caja', monto_aprobado = 30000
                  where id = '00000000-0000-0000-0000-0000000072b4' returning estado, monto_aprobado)
                  select estado || ' / ' || coalesce(monto_aprobado::text, '(sin)') from n$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000072c0');
insert into resultado (prueba, esperado, resultado)
select '2g al anular, lo aprobado queda vacío', 'anulado / (sin)',
  pg_temp.valor($q$with n as (update abonos set estado = 'anulado' where id = '00000000-0000-0000-0000-0000000072b5' returning estado, monto_aprobado)
                  select estado || ' / ' || coalesce(monto_aprobado::text, '(sin)') from n$q$);

-- ============================================================ 3) desembolso
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3a ya aprobado, lo aprobado no se cambia suelto', 'contiene: Lo aprobado lo pone el aprobador', pg_temp.intentar($q$
  update abonos set monto_aprobado = 150000 where id = '00000000-0000-0000-0000-0000000072b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3b al desembolsar se puede ajustar lo aprobado', 'desembolsado / 350000.00 / 150000.00',
  pg_temp.valor($q$with n as (update abonos set estado = 'desembolsado', monto_aprobado = 150000,
                    fecha_desembolso = (now() at time zone 'America/Bogota')::date,
                    pantallazo_path = 'abonos/00000000-0000-0000-0000-0000000072b1/p.jpg'
                  where id = '00000000-0000-0000-0000-0000000072b1' returning estado, monto, monto_aprobado)
                  select estado || ' / ' || monto::text || ' / ' || monto_aprobado::text from n$q$);
insert into resultado (prueba, esperado, resultado)
select '3c desembolsado: lo aprobado ya no cambia', 'contiene: ya se desembolsó', pg_temp.intentar($q$
  update abonos set monto_aprobado = 100000 where id = '00000000-0000-0000-0000-0000000072b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d desembolsar sin escribir el valor: queda lo que se aprobó', '250000.00',
  pg_temp.valor($q$with n as (update abonos set estado = 'desembolsado',
                    fecha_desembolso = (now() at time zone 'America/Bogota')::date,
                    pantallazo_path = 'abonos/00000000-0000-0000-0000-0000000072b3/p.jpg'
                  where id = '00000000-0000-0000-0000-0000000072b3' returning monto_aprobado)
                  select monto_aprobado::text from n$q$);

-- ============================================================ 4) lo ve el técnico
select pg_temp.como('00000000-0000-0000-0000-0000000072c0');
insert into resultado (prueba, esperado, resultado)
select '4a el técnico ve cuánto pidió y cuánto le aprobaron', '350000.00 → 150000.00 | 100000.00 → 100000.00 | 300000.00 → 250000.00',
  pg_temp.valor($q$select string_agg(monto::text || ' → ' || monto_aprobado::text, ' | ' order by id) from abonos
                  where id::text like '00000000-0000-0000-0000-0000000072b%' and monto_aprobado is not null$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '4b ningún abono aprobado o desembolsado queda sin lo aprobado', '0',
  pg_temp.valor($q$select count(*)::text from abonos where estado in ('aprobado', 'desembolsado') and monto_aprobado is null$q$);

-- ============================================================ limpieza (admin)
delete from abonos where persona_id = '00000000-0000-0000-0000-0000000072c0';
delete from rrhh_aprobadores where perfil_id = '00000000-0000-0000-0000-0000000072a0';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000072a0', '00000000-0000-0000-0000-0000000072c0');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000072a0', '00000000-0000-0000-0000-0000000072c0');

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

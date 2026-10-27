-- Verificación de la migración 81 (encender el aviso al celular). Correr DESPUÉS de la migración.
-- Prueba: lo viejo quedó marcado como enviado (no llega de golpe), cada quien registra y ve solo
-- su dispositivo, un celular tiene un solo dueño (si otro lo activa, pasa a ese), solo el dueño lo
-- desactiva, y sin sesión no se registra nada. Crea dos usuarios de prueba y BORRA todo.
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
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000081a0', 'authenticated', 'authenticated', 't.81@invalid.local'),
  ('00000000-0000-0000-0000-0000000081b0', 'authenticated', 'authenticated', 'u.81@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000081a0', '__T 81__'), ('00000000-0000-0000-0000-0000000081b0', '__U 81__')) v(id, nombre)
join roles r on r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;

insert into resultado (prueba, esperado, resultado)
select '0 al encender, lo viejo quedó marcado (no sale de golpe al celular)', '0',
  pg_temp.valor($q$select count(*)::text from notificaciones where push_enviada_en is null and creada_en < now() - interval '1 minute'$q$);

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000081a0');
insert into resultado (prueba, esperado, resultado)
select '1a T activa avisos en su celular', 'T / activa',
  pg_temp.valor($q$with x as (select fn_registrar_suscripcion('https://push.prueba.invalid/81-celular', repeat('p', 30), repeat('a', 12), 'Android Chrome') as id)
                  select 'T / activa' from x$q$);
insert into resultado (prueba, esperado, resultado)
select '1b una suscripción inválida no se guarda', 'contiene: no entregó una suscripción válida', pg_temp.intentar($q$
  select fn_registrar_suscripcion('http://inseguro', 'x', 'y', null)$q$);
insert into resultado (prueba, esperado, resultado)
select '1c T ve su dispositivo', '1', pg_temp.valor($q$select count(*)::text from notificacion_suscripciones where endpoint like 'https://push.prueba.invalid/81%' and revocada_en is null$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000081b0');
insert into resultado (prueba, esperado, resultado)
select '2a U no ve el dispositivo de T', '0', pg_temp.valor($q$select count(*)::text from notificacion_suscripciones where endpoint like 'https://push.prueba.invalid/81%'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b U no puede desactivar el de T', 'false', pg_temp.valor($q$select fn_revocar_suscripcion('https://push.prueba.invalid/81-celular')::text$q$);
insert into resultado (prueba, esperado, resultado)
select '2c U entra en el MISMO celular y activa: el dispositivo pasa a U', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_registrar_suscripcion('https://push.prueba.invalid/81-celular', repeat('q', 30), repeat('b', 12), 'Android Chrome')$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '2d a T ya no le llegan avisos en ese celular (un solo dueño)', 'U / 1',
  pg_temp.valor($q$select case perfil_id when '00000000-0000-0000-0000-0000000081b0' then 'U' else 'T' end || ' / ' || count(*) over ()::text
                  from notificacion_suscripciones where endpoint = 'https://push.prueba.invalid/81-celular'$q$);
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000081b0');
insert into resultado (prueba, esperado, resultado)
select '3 U desactiva en este celular', 'true / revocada',
  pg_temp.valor($q$select fn_revocar_suscripcion('https://push.prueba.invalid/81-celular')::text$q$) || ' / ' ||
  pg_temp.valor($q$select case when revocada_en is not null then 'revocada' else 'activa' end from notificacion_suscripciones where endpoint = 'https://push.prueba.invalid/81-celular'$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '4 anónimo no registra dispositivos', 'false',
  pg_temp.valor($q$select has_function_privilege('anon', 'fn_registrar_suscripcion(text, text, text, text)', 'execute')::text$q$);

-- ============================================================ limpieza (admin)
delete from notificacion_suscripciones where endpoint like 'https://push.prueba.invalid/81%';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000081a0', '00000000-0000-0000-0000-0000000081b0');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000081a0', '00000000-0000-0000-0000-0000000081b0');

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

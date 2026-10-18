-- Verificación contra la base REAL, con las migraciones 48 y 49 aplicadas:
--   A) La salida con fotos incompletas: el mismo upsert que manda la app
--      (src/lib/tecnico/servidor-supabase.ts → guardarJornada) guarda fotos_al_salir y
--      motivo_fotos_incompletas.
--   B) El candado después de la firma del cliente (migración 49):
--      - un reintento IDÉNTICO de la cola se toma como "sin cambios" (sin error);
--      - mismo id con contenido DISTINTO se rechaza (es editar evidencia firmada);
--      - una visita firmada no vuelve atrás: solo Operativo la pasa a "cerrada", y
--        "cerrada" es final; firmada_en no se toca.
--
-- Crea un técnico de prueba y una visita, y BORRA todo al final. No deja cambios.
-- Devuelve prueba / esperado / resultado / estado. Resultado esperado: todo "OK".
-- (Antes de la 49, B1, B2 y B4 salían distinto: ver el encabezado de la migración 49.)

begin;

create temporary table resultado (orden serial, prueba text, esperado text, resultado text) on commit drop;
grant all on resultado to authenticated;
grant usage on sequence resultado_orden_seq to authenticated;

-- Ejecuta y devuelve "aceptado (N filas)" o "RECHAZADO [código]: mensaje".
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

-- El mismo upsert que manda la app al marcar la salida. A3 y su reintento idéntico (B1)
-- usan EXACTAMENTE el mismo envío; now() es fijo dentro de la transacción.
create or replace function pg_temp.upsert_salida(p_motivo text)
returns text language sql as $f$
  select format($q$
  insert into visita_jornadas (id, visita_id, fecha, check_in_en, check_in_gps_estado, check_out_en, check_out_gps_estado,
                               labor_ejecutada, pendiente, fotos_al_salir, motivo_fotos_incompletas)
  values ('00000000-0000-0000-0000-00000000b481', '00000000-0000-0000-0000-00000000a481', current_date, now() - interval '8 hours',
          'sin_senal', now(), 'sin_senal', 'Canalización tramo A', 'Seguir mañana',
          '1 de 12 · 1 antes, 0 durante, 0 después', %L)
  on conflict (id) do update set
    check_out_en = excluded.check_out_en, check_out_gps_estado = excluded.check_out_gps_estado,
    labor_ejecutada = excluded.labor_ejecutada, pendiente = excluded.pendiente,
    fotos_al_salir = excluded.fotos_al_salir, motivo_fotos_incompletas = excluded.motivo_fotos_incompletas$q$, p_motivo)
$f$;

-- El mismo registro de foto que manda la app (insert … on conflict do nothing).
create or replace function pg_temp.foto(p_momento text)
returns text language sql as $f$
  select format($q$
  insert into visita_fotos (id, visita_id, jornada_id, storage_path, momento, bytes)
  values ('00000000-0000-0000-0000-00000000f481', '00000000-0000-0000-0000-00000000a481', '00000000-0000-0000-0000-00000000b481',
          '00000000-0000-0000-0000-00000000a481/00000000-0000-0000-0000-00000000f481.jpg', %L, 200000)
  on conflict (id) do nothing$q$, p_momento)
$f$;

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e8', 'authenticated', 'authenticated', 'tecnico.prueba.48@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre, cedula)
select '00000000-0000-0000-0000-0000000000e8', r.id, '__Técnico prueba 48__', '1000000048'
from roles r where r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
insert into visitas (id, titulo, tipo, tecnico_id, fecha_programada, fotos_minimas_dia)
values ('00000000-0000-0000-0000-00000000a481', '__prueba 48__', 'obra', '00000000-0000-0000-0000-0000000000e8', current_date, 12);

-- ============================================================ A) como el técnico
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e8","role":"authenticated"}', true);

insert into resultado (prueba, esperado, resultado)
select 'A1 entrada (insert de la jornada)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_jornadas (id, visita_id, fecha, check_in_en, check_in_gps_estado)
  values ('00000000-0000-0000-0000-00000000b481', '00000000-0000-0000-0000-00000000a481', current_date,
          now() - interval '8 hours', 'sin_senal')$q$);
-- (La app manda siempre la misma hora de entrada que guardó en el celular: por eso la
--  entrada acá es la misma que va en el upsert de la salida.)
insert into resultado (prueba, esperado, resultado)
select 'A2 foto (con momento)', 'aceptado (1 filas)', pg_temp.intentar(pg_temp.foto('antes'));
insert into resultado (prueba, esperado, resultado)
select 'A3 salida con fotos incompletas (upsert de la app)', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.upsert_salida('Se fue la luz en el cuarto técnico'));
insert into resultado (prueba, esperado, resultado)
select 'A4 fotos_al_salir guardado', '1 de 12 · 1 antes, 0 durante, 0 después', pg_temp.valor($q$
  select fotos_al_salir from visita_jornadas where id = '00000000-0000-0000-0000-00000000b481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'A5 motivo_fotos_incompletas guardado', 'Se fue la luz en el cuarto técnico', pg_temp.valor($q$
  select motivo_fotos_incompletas from visita_jornadas where id = '00000000-0000-0000-0000-00000000b481'$q$);

-- ============================================================ firmas
insert into resultado (prueba, esperado, resultado)
select 'B0 firma del técnico', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a481', 'tecnico', '__Técnico prueba 48__', '1000000048', 'x/firma-tecnico.png')$q$);
insert into resultado (prueba, esperado, resultado)
select 'B0 firma del cliente', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a481', 'cliente', 'Cliente', '79000000', 'x/firma-cliente.png')$q$);
insert into resultado (prueba, esperado, resultado)
select 'B0 estado de la visita tras firmar', 'firmada', pg_temp.valor($q$
  select estado from visitas where id = '00000000-0000-0000-0000-00000000a481'$q$);

-- ============================================================ B) reintentos del técnico DESPUÉS de la firma
-- (cada caso en su propio insert: así cada uno ve el resultado del anterior)
insert into resultado (prueba, esperado, resultado)
select 'B1 reintento IDÉNTICO del upsert de la jornada', 'aceptado (0 filas)',
  pg_temp.intentar(pg_temp.upsert_salida('Se fue la luz en el cuarto técnico'));
insert into resultado (prueba, esperado, resultado)
select 'B1b mismo id, contenido DISTINTO (otro motivo)', 'RECHAZADO',
  pg_temp.intentar(pg_temp.upsert_salida('Otro motivo inventado después'));
insert into resultado (prueba, esperado, resultado)
select 'B1c el motivo sigue siendo el original', 'Se fue la luz en el cuarto técnico', pg_temp.valor($q$
  select motivo_fotos_incompletas from visita_jornadas where id = '00000000-0000-0000-0000-00000000b481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B1d update directo de la jornada (otra labor)', 'RECHAZADO', pg_temp.intentar($q$
  update visita_jornadas set labor_ejecutada = 'Otra cosa' where id = '00000000-0000-0000-0000-00000000b481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B2 reintento IDÉNTICO de la foto ya subida', 'aceptado (0 filas)', pg_temp.intentar(pg_temp.foto('antes'));
insert into resultado (prueba, esperado, resultado)
select 'B2b misma foto (id), contenido DISTINTO (otro momento)', 'RECHAZADO', pg_temp.intentar(pg_temp.foto('despues'));
insert into resultado (prueba, esperado, resultado)
select 'B2c la foto sigue con su momento original', 'antes', pg_temp.valor($q$
  select momento from visita_fotos where id = '00000000-0000-0000-0000-00000000f481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B2d foto NUEVA en la visita firmada', 'RECHAZADO', pg_temp.intentar($q$
  insert into visita_fotos (visita_id, storage_path, momento) values ('00000000-0000-0000-0000-00000000a481', 'x/nueva.jpg', 'despues')$q$);
insert into resultado (prueba, esperado, resultado)
select 'B3 firma del cliente otra vez (on conflict do nothing)', 'aceptado (0 filas)', pg_temp.intentar($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a481', 'cliente', 'Cliente', '79000000', 'x/firma-cliente.png')
  on conflict (visita_id, tipo) do nothing$q$);
insert into resultado (prueba, esperado, resultado)
select 'B4 técnico devuelve la visita firmada a "en curso"', 'RECHAZADO', pg_temp.intentar($q$
  update visitas set estado = 'en_curso' where id = '00000000-0000-0000-0000-00000000a481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B4b técnico la pasa a "cerrada" (no es Operativo)', 'RECHAZADO', pg_temp.intentar($q$
  update visitas set estado = 'cerrada' where id = '00000000-0000-0000-0000-00000000a481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B4c estado después de los intentos del técnico', 'firmada', pg_temp.valor($q$
  select estado from visitas where id = '00000000-0000-0000-0000-00000000a481'$q$);

-- ============================================================ B) Operativo (Jhojan): solo hacia adelante
select set_config('request.jwt.claims',
  '{"sub":"696d9431-5c4d-4043-aee4-3e4597094f26","role":"authenticated"}', true);

insert into resultado (prueba, esperado, resultado)
select 'B5 Operativo devuelve la firmada a "en curso"', 'RECHAZADO', pg_temp.intentar($q$
  update visitas set estado = 'en_curso' where id = '00000000-0000-0000-0000-00000000a481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B5b Operativo cambia la hora de la firma (firmada_en)', 'RECHAZADO', pg_temp.intentar($q$
  update visitas set firmada_en = now() - interval '3 days' where id = '00000000-0000-0000-0000-00000000a481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B6 Operativo la pasa de firmada a cerrada', 'aceptado (1 filas)', pg_temp.intentar($q$
  update visitas set estado = 'cerrada' where id = '00000000-0000-0000-0000-00000000a481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B7 Operativo la saca de cerrada (vuelve a firmada)', 'RECHAZADO', pg_temp.intentar($q$
  update visitas set estado = 'firmada' where id = '00000000-0000-0000-0000-00000000a481'$q$);
insert into resultado (prueba, esperado, resultado)
select 'B7b estado final', 'cerrada', pg_temp.valor($q$
  select estado from visitas where id = '00000000-0000-0000-0000-00000000a481'$q$);

-- ============================================================ limpieza (admin)
reset role;
delete from visita_firmas where visita_id = '00000000-0000-0000-0000-00000000a481';
delete from visita_fotos where visita_id = '00000000-0000-0000-0000-00000000a481';
delete from visita_jornadas where visita_id = '00000000-0000-0000-0000-00000000a481';
delete from visitas where id = '00000000-0000-0000-0000-00000000a481';
delete from perfiles where id = '00000000-0000-0000-0000-0000000000e8';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e8';

-- ============================================================ resultado (última instrucción)
select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

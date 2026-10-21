-- Verificación de la migración 58 (salida después de firmar). Correr DESPUÉS de la migración,
-- todo junto. Crea un TÉCNICO de prueba y dos visitas, con la sesión del técnico (RLS y
-- triggers reales), y BORRA todo antes de mostrar el resultado.
-- Resultado esperado: todas las filas en "OK". Los rechazos tienen que ser DEL CANDADO
-- ("firmada por el cliente"), no de otra regla: así se prueba lo que se quiere probar.
--
-- Orden nuevo: firma del técnico → firma del cliente → marcar salida. La única excepción al
-- candado es la salida, de nulo a valor, una vez, con la visita "firmada".

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

-- El mismo upsert que manda la app al marcar la salida (servidor-supabase.ts → jornada).
-- La entrada es fija (la que guardó el celular); la salida y la labor se pasan.
create or replace function pg_temp.salida(p_jornada uuid, p_visita uuid, p_salida text, p_labor text, p_motivo text)
returns text language sql as $f$
  select format($q$
  insert into visita_jornadas (id, visita_id, fecha, check_in_en, check_in_gps_estado,
                               check_out_en, check_out_gps_estado, check_out_lat, check_out_lng, check_out_precision_m,
                               labor_ejecutada, pendiente, fotos_al_salir, motivo_fotos_incompletas)
  values (%L, %L, current_date, '2026-10-21 08:00-05', 'sin_senal',
          %L, 'concedido', 4.630000, -74.150000, 12.0,
          %L, 'Seguir mañana', '1 de 6 · 1 antes, 0 durante, 0 después', %L)
  on conflict (id) do update set
    check_out_en = excluded.check_out_en, check_out_gps_estado = excluded.check_out_gps_estado,
    check_out_lat = excluded.check_out_lat, check_out_lng = excluded.check_out_lng,
    check_out_precision_m = excluded.check_out_precision_m,
    labor_ejecutada = excluded.labor_ejecutada, pendiente = excluded.pendiente,
    fotos_al_salir = excluded.fotos_al_salir, motivo_fotos_incompletas = excluded.motivo_fotos_incompletas$q$,
    p_jornada, p_visita, p_salida, p_labor, p_motivo)
$f$;

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e9', 'authenticated', 'authenticated', 'tecnico.prueba.58@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre, cedula)
select '00000000-0000-0000-0000-0000000000e9', r.id, '__Técnico prueba 58__', '1000000058'
from roles r where r.nombre = 'Técnicos'
on conflict (id) do update set rol_id = excluded.rol_id;
-- Visita 1: el camino normal. Visita 2: Operativo la cierra antes de la salida.
insert into visitas (id, titulo, tipo, tecnico_id, fecha_programada, fotos_minimas_dia) values
  ('00000000-0000-0000-0000-00000000a581', '__prueba 58 (1)__', 'visita', '00000000-0000-0000-0000-0000000000e9', current_date, 6),
  ('00000000-0000-0000-0000-00000000a582', '__prueba 58 (2)__', 'visita', '00000000-0000-0000-0000-0000000000e9', current_date, 6);

set local role authenticated;

-- ============================================================ el técnico: entrada, reporte, foto y firmas
select pg_temp.como('00000000-0000-0000-0000-0000000000e9');
insert into resultado (prueba, esperado, resultado)
select '1a entrada y reporte del día (visita 1)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_jornadas (id, visita_id, fecha, check_in_en, check_in_gps_estado, labor_ejecutada, pendiente)
  values ('00000000-0000-0000-0000-00000000b581', '00000000-0000-0000-0000-00000000a581', current_date,
          '2026-10-21 08:00-05', 'sin_senal', 'Revisión de 3 cámaras', 'Seguir mañana')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b una foto', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_fotos (id, visita_id, jornada_id, storage_path, momento, bytes)
  values ('00000000-0000-0000-0000-00000000f581', '00000000-0000-0000-0000-00000000a581', '00000000-0000-0000-0000-00000000b581',
          '00000000-0000-0000-0000-00000000a581/00000000-0000-0000-0000-00000000f581.jpg', 'antes', 200000)$q$);
insert into resultado (prueba, esperado, resultado)
select '1c firma del técnico', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a581', 'tecnico', '__Técnico prueba 58__', '1000000058', 'x/firma-tecnico.png')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d firma del cliente, SIN salida todavía', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a581', 'cliente', 'Cliente', '79000000', 'x/firma-cliente.png')$q$);
insert into resultado (prueba, esperado, resultado)
select '1e la visita quedó firmada', 'firmada', pg_temp.valor($q$
  select estado from visitas where id = '00000000-0000-0000-0000-00000000a581'$q$);

-- ============================================================ 2) la salida después de firmar
insert into resultado (prueba, esperado, resultado)
select '2a salida que además cambia el reporte (colada en el mismo upsert)', 'contiene: firmada por el cliente',
  pg_temp.intentar(pg_temp.salida('00000000-0000-0000-0000-00000000b581', '00000000-0000-0000-0000-00000000a581',
    '2026-10-21 16:00-05', 'Revisión de 3 cámaras y otra cosa', 'Faltó luz'));
insert into resultado (prueba, esperado, resultado)
select '2b MARCAR SALIDA después de firmar (upsert de la app)', 'aceptado (1 filas)',
  pg_temp.intentar(pg_temp.salida('00000000-0000-0000-0000-00000000b581', '00000000-0000-0000-0000-00000000a581',
    '2026-10-21 16:00-05', 'Revisión de 3 cámaras', 'Faltó luz'));
insert into resultado (prueba, esperado, resultado)
select '2c la salida quedó guardada', 'true', pg_temp.valor($q$
  select (check_out_en = '2026-10-21 16:00-05' and check_out_gps_estado = 'concedido'
          and fotos_al_salir is not null and motivo_fotos_incompletas = 'Faltó luz')::text
  from visita_jornadas where id = '00000000-0000-0000-0000-00000000b581'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d reintento IDÉNTICO de la cola', 'aceptado (0 filas)',
  pg_temp.intentar(pg_temp.salida('00000000-0000-0000-0000-00000000b581', '00000000-0000-0000-0000-00000000a581',
    '2026-10-21 16:00-05', 'Revisión de 3 cámaras', 'Faltó luz'));
insert into resultado (prueba, esperado, resultado)
select '2e MARCAR SALIDA DOS VECES (otra hora)', 'contiene: firmada por el cliente',
  pg_temp.intentar(pg_temp.salida('00000000-0000-0000-0000-00000000b581', '00000000-0000-0000-0000-00000000a581',
    '2026-10-21 17:30-05', 'Revisión de 3 cámaras', 'Faltó luz'));
insert into resultado (prueba, esperado, resultado)
select '2f cambiar el motivo después de la salida', 'contiene: firmada por el cliente', pg_temp.intentar($q$
  update visita_jornadas set motivo_fotos_incompletas = 'Otro motivo' where id = '00000000-0000-0000-0000-00000000b581'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g la salida sigue siendo la primera', '2026-10-21 16:00', pg_temp.valor($q$
  select to_char(check_out_en at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') from visita_jornadas
  where id = '00000000-0000-0000-0000-00000000b581'$q$);

-- ============================================================ 3) lo demás sigue cerrado
insert into resultado (prueba, esperado, resultado)
select '3a CAMBIAR labor_ejecutada después de firmar', 'contiene: firmada por el cliente', pg_temp.intentar($q$
  update visita_jornadas set labor_ejecutada = 'Otra cosa' where id = '00000000-0000-0000-0000-00000000b581'$q$);
insert into resultado (prueba, esperado, resultado)
select '3b cambiar pendiente / observaciones', 'contiene: firmada por el cliente', pg_temp.intentar($q$
  update visita_jornadas set observaciones = 'Agregado después' where id = '00000000-0000-0000-0000-00000000b581'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c CAMBIAR UNA FOTO después de firmar (otro momento)', 'contiene: firmada por el cliente', pg_temp.intentar($q$
  update visita_fotos set momento = 'despues' where id = '00000000-0000-0000-0000-00000000f581'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d foto NUEVA después de firmar', 'contiene: firmada por el cliente', pg_temp.intentar($q$
  insert into visita_fotos (visita_id, storage_path, momento) values ('00000000-0000-0000-0000-00000000a581', 'x/nueva.jpg', 'despues')$q$);
insert into resultado (prueba, esperado, resultado)
select '3e sugerencia NUEVA después de firmar', 'contiene: firmada por el cliente', pg_temp.intentar($q$
  insert into visita_sugerencias (visita_id, descripcion) values ('00000000-0000-0000-0000-00000000a581', 'Cable')$q$);
insert into resultado (prueba, esperado, resultado)
select '3f jornada NUEVA después de firmar', 'contiene: firmada por el cliente', pg_temp.intentar($q$
  insert into visita_jornadas (visita_id, fecha, check_in_en) values ('00000000-0000-0000-0000-00000000a581', current_date + 1, now())$q$);
insert into resultado (prueba, esperado, resultado)
select '3g la labor sigue siendo la original', 'Revisión de 3 cámaras', pg_temp.valor($q$
  select labor_ejecutada from visita_jornadas where id = '00000000-0000-0000-0000-00000000b581'$q$);

-- ============================================================ 4) visita "cerrada" (final): ni la salida
insert into resultado (prueba, esperado, resultado)
select '4a visita 2: entrada, firmas', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into visita_jornadas (id, visita_id, fecha, check_in_en, check_in_gps_estado, labor_ejecutada, pendiente)
  values ('00000000-0000-0000-0000-00000000b582', '00000000-0000-0000-0000-00000000a582', current_date,
          '2026-10-21 08:00-05', 'sin_senal', 'Revisión de 3 cámaras', 'Seguir mañana')$q$);
select pg_temp.intentar($q$insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a582', 'tecnico', '__Técnico prueba 58__', '1000000058', 'x/t.png')$q$);
select pg_temp.intentar($q$insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
  values ('00000000-0000-0000-0000-00000000a582', 'cliente', 'Cliente', '79000000', 'x/c.png')$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '4b Operativo (Jhojan) cierra la visita 2', 'aceptado (1 filas)', pg_temp.intentar($q$
  update visitas set estado = 'cerrada' where id = '00000000-0000-0000-0000-00000000a582'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000000e9');
insert into resultado (prueba, esperado, resultado)
select '4c salida en una visita CERRADA', 'contiene: firmada por el cliente',
  pg_temp.intentar(pg_temp.salida('00000000-0000-0000-0000-00000000b582', '00000000-0000-0000-0000-00000000a582',
    '2026-10-21 16:00-05', 'Revisión de 3 cámaras', null));

-- ============================================================ 5) privilegios
reset role;
insert into resultado (prueba, esperado, resultado)
select '5a fn_es_salida_tras_firma no la ejecuta anon', 'false',
  has_function_privilege('anon', 'public.fn_es_salida_tras_firma(jsonb, jsonb)', 'EXECUTE')::text;

-- ============================================================ limpieza (admin)
delete from visita_fotos where visita_id in ('00000000-0000-0000-0000-00000000a581', '00000000-0000-0000-0000-00000000a582');
delete from visita_firmas where visita_id in ('00000000-0000-0000-0000-00000000a581', '00000000-0000-0000-0000-00000000a582');
delete from visita_sugerencias where visita_id in ('00000000-0000-0000-0000-00000000a581', '00000000-0000-0000-0000-00000000a582');
delete from visita_jornadas where visita_id in ('00000000-0000-0000-0000-00000000a581', '00000000-0000-0000-0000-00000000a582');
delete from visitas where id in ('00000000-0000-0000-0000-00000000a581', '00000000-0000-0000-0000-00000000a582');
delete from perfiles where id = '00000000-0000-0000-0000-0000000000e9';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e9';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

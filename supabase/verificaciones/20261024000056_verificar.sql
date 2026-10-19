-- Verificación de la migración 56 (eventos sin "equipo"). Correr DESPUÉS de la migración,
-- todo junto. Crea un COORDINADOR y un TÉCNICO de prueba y eventos; BORRA todo antes de
-- mostrar el resultado.
-- Resultado esperado: todas las filas en "OK".
--
-- Jhojan tiene operativo/trabajar: con la 55 él SÍ podía crear un evento "equipo". Por eso
-- los casos 1a y 1c se prueban con él: si pasan, es el check el que lo impide, no el permiso.

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

-- Personas: Jhojan 696d…; coordinador …0f1; técnico …0f2. Eventos …7f1 a …7f4.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'c.prueba.56@invalid.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 't.prueba.56@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select x.id::uuid, r.id, x.nombre
from (values ('00000000-0000-0000-0000-0000000000f1', 'Coordinador', '__Coordinador prueba 56__'),
             ('00000000-0000-0000-0000-0000000000f2', 'Técnicos', '__Técnico prueba 56__')) as x(id, rol, nombre)
join roles r on r.nombre = x.rol
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre;

set local role authenticated;

-- ============================================================ 1) "equipo" ya no existe
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '1a Jhojan (con Operativo) crea un evento "equipo"', 'contiene: eventos_visibilidad_check', pg_temp.intentar($q$
  insert into eventos (titulo, inicio, fin, visibilidad) values ('x', '2026-10-27 10:00-05', '2026-10-27 11:00-05', 'equipo')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b Jhojan crea una cita interna', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into eventos (id, titulo, inicio, fin) values
    ('00000000-0000-0000-0000-0000000007f1', 'Cita interna', '2026-10-27 10:00-05', '2026-10-27 11:00-05')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c … y la intenta pasar a "equipo"', 'contiene: eventos_visibilidad_check', pg_temp.intentar($q$
  update eventos set visibilidad = 'equipo' where id = '00000000-0000-0000-0000-0000000007f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d Jhojan crea una reunión compartida', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into eventos (id, titulo, inicio, fin, visibilidad) values
    ('00000000-0000-0000-0000-0000000007f2', 'Reunión compartida', '2026-10-28 10:00-05', '2026-10-28 11:00-05', 'compartida')$q$);
insert into resultado (prueba, esperado, resultado)
select '1e … y la comparte con el coordinador', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into evento_participantes (evento_id, perfil_id) values ('00000000-0000-0000-0000-0000000007f2', '00000000-0000-0000-0000-0000000000f1')$q$);

-- ============================================================ 2) lo demás sigue igual
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
insert into resultado (prueba, esperado, resultado)
select '2a el coordinador ve la reunión compartida', '1', pg_temp.valor($q$select count(*) from eventos where id = '00000000-0000-0000-0000-0000000007f2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b el coordinador NO ve la cita interna de Jhojan', '0', pg_temp.valor($q$select count(*) from eventos where id = '00000000-0000-0000-0000-0000000007f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c el coordinador NO edita la reunión (filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update eventos set titulo = 'otro' where id = '00000000-0000-0000-0000-0000000007f2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d el coordinador crea su propia cita', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into eventos (id, titulo, inicio, fin) values
    ('00000000-0000-0000-0000-0000000007f3', 'Médico', '2026-10-29 08:00-05', '2026-10-29 09:00-05')$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
insert into resultado (prueba, esperado, resultado)
select '2e el técnico NO crea eventos', 'RECHAZADO', pg_temp.intentar($q$
  insert into eventos (titulo, inicio, fin) values ('x', now(), now())$q$);
insert into resultado (prueba, esperado, resultado)
select '2f el técnico no ve ningún evento', '0', pg_temp.valor($q$select count(*) from eventos$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2g volver interna una compartida con participantes', 'contiene: Quita a los participantes', pg_temp.intentar($q$
  update eventos set visibilidad = 'interna' where id = '00000000-0000-0000-0000-0000000007f2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2h día completo con hora de la tarde', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into eventos (id, titulo, inicio, fin, todo_el_dia) values
    ('00000000-0000-0000-0000-0000000007f4', 'Festivo 56', '2026-10-30 15:00-05', '2026-10-30 16:00-05', true)$q$);
insert into resultado (prueba, esperado, resultado)
select '2i … sigue yendo a la medianoche de Bogotá', '2026-10-30 00:00', pg_temp.valor($q$
  select to_char(inicio at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') from eventos where id = '00000000-0000-0000-0000-0000000007f4'$q$);

-- ============================================================ 3) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '3a el check de visibilidad no menciona "equipo"', '0', count(*)::text
from pg_constraint
where conrelid = 'public.eventos'::regclass and conname = 'eventos_visibilidad_check'
  and pg_get_constraintdef(oid) like '%equipo%';
insert into resultado (prueba, esperado, resultado)
select '3b … y el check existe', '1', count(*)::text
from pg_constraint where conrelid = 'public.eventos'::regclass and conname = 'eventos_visibilidad_check';
insert into resultado (prueba, esperado, resultado)
select '3c políticas de eventos que mencionan "equipo"', '0', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'eventos'
  and (coalesce(qual, '') like '%equipo%' or coalesce(with_check, '') like '%equipo%');
insert into resultado (prueba, esperado, resultado)
select '3d funciones de eventos que mencionan "equipo"', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_puede_ver_evento', 'fn_eventos_reglas') and p.prosrc like '%equipo%';
-- La regla de siempre: si una migración se olvida del revoke de PUBLIC, esto se cae.
insert into resultado (prueba, esperado, resultado)
select '3e funciones de eventos ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_es_participante_evento', 'fn_puede_ver_evento', 'fn_evento_tiene_participantes',
                    'fn_grupos_para_compartir', 'fn_eventos_reglas', 'fn_evento_participantes_reglas', 'fn_eventos_historial')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '3f fn_puede_ver_evento sigue ejecutable por authenticated', 'true', has_function_privilege('authenticated', 'public.fn_puede_ver_evento(uuid)', 'EXECUTE')::text;
insert into resultado (prueba, esperado, resultado)
select '3g quedan eventos "equipo"', '0', count(*)::text from eventos where visibilidad = 'equipo';

-- ============================================================ limpieza (admin)
delete from evento_participantes where evento_id::text like '00000000-0000-0000-0000-0000000007f%';
delete from evento_historial where evento_id::text like '00000000-0000-0000-0000-0000000007f%';
delete from eventos where id::text like '00000000-0000-0000-0000-0000000007f%';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

-- Verificación de las migraciones 98 y 99 (EN_EVALUACION y seguimiento de cotizaciones). Correr
-- DESPUÉS de las dos, todo junto. Crea un usuario de Comercial, un técnico, un cliente y tres
-- cotizaciones de prueba; BORRA todo al final. Todas las filas deben decir OK.
-- Cada cambio y su comprobación van en statements separados.
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

-- C = Comercial "trabajar". T = Técnicos. Cotizaciones …99c1 (borrador), …99c2 (enviada hoy),
-- …99c3 (enviada hace 30 días).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000099a0', 'authenticated', 'authenticated', 'comercial.99@invalid.local'),
  ('00000000-0000-0000-0000-0000000099b0', 'authenticated', 'authenticated', 'tecnico.99@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Comercial 99__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select id, 'comercial', 'trabajar', false from roles where nombre = '__Comercial 99__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000099a0', '__Comercial 99__', '__C 99__'),
             ('00000000-0000-0000-0000-0000000099b0', 'Técnicos', '__T 99__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into clientes (id, nombre) values ('00000000-0000-0000-0000-0000000099e0', '__Cliente prueba 99__');
insert into cotizaciones (id, codigo, anio, cliente_id, descripcion, estado, fecha_emision) values
  ('00000000-0000-0000-0000-0000000099c1', '__COT-99-1__', 2026, '00000000-0000-0000-0000-0000000099e0', 'Prueba 99 uno', 'BORRADOR', current_date),
  ('00000000-0000-0000-0000-0000000099c2', '__COT-99-2__', 2026, '00000000-0000-0000-0000-0000000099e0', 'Prueba 99 dos', 'BORRADOR', current_date),
  ('00000000-0000-0000-0000-0000000099c3', '__COT-99-3__', 2026, '00000000-0000-0000-0000-0000000099e0', 'Prueba 99 tres', 'ENVIADA', current_date - 30);
update cotizaciones set enviada_en = now() - interval '30 days' where id = '00000000-0000-0000-0000-0000000099c3';

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000099a0');

-- ============================================================ 1) transiciones
insert into resultado (prueba, esperado, resultado)
select '1a de borrador no se salta a en evaluación', 'contiene: no pasa de BORRADOR a EN_EVALUACION', pg_temp.intentar($q$
  update cotizaciones set estado = 'EN_EVALUACION' where id = '00000000-0000-0000-0000-0000000099c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b borrador → enviada', 'aceptado (1 filas)', pg_temp.intentar($q$
  update cotizaciones set estado = 'ENVIADA' where id = '00000000-0000-0000-0000-0000000099c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c … y queda la fecha de envío', 'true', pg_temp.valor($q$
  select (enviada_en is not null)::text from cotizaciones where id = '00000000-0000-0000-0000-0000000099c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d enviada → en evaluación', 'aceptado (1 filas)', pg_temp.intentar($q$
  update cotizaciones set estado = 'EN_EVALUACION' where id = '00000000-0000-0000-0000-0000000099c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e en evaluación → enviada (versión nueva)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update cotizaciones set estado = 'ENVIADA' where id = '00000000-0000-0000-0000-0000000099c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f enviada → aprobada', 'aceptado (1 filas)', pg_temp.intentar($q$
  update cotizaciones set estado = 'APROBADA' where id = '00000000-0000-0000-0000-0000000099c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1g … con su fecha de aprobación', 'true', pg_temp.valor($q$
  select (fecha_aprobacion is not null)::text from cotizaciones where id = '00000000-0000-0000-0000-0000000099c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1h aprobada no vuelve atrás', 'contiene: no pasa de APROBADA a ENVIADA', pg_temp.intentar($q$
  update cotizaciones set estado = 'ENVIADA' where id = '00000000-0000-0000-0000-0000000099c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1i la cotización dos se envía hoy', 'aceptado (1 filas)', pg_temp.intentar($q$
  update cotizaciones set estado = 'ENVIADA' where id = '00000000-0000-0000-0000-0000000099c2'$q$);

-- ============================================================ 2) seguimientos
insert into resultado (prueba, esperado, resultado)
select '2a próximo paso: llamada, con fecha ya pasada', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into cotizacion_seguimientos (id, cotizacion_id, tipo, fecha_programada, responsable_id)
  values ('00000000-0000-0000-0000-0000000099f1', '00000000-0000-0000-0000-0000000099c2', 'llamada', current_date - 3,
          '00000000-0000-0000-0000-0000000099a0')$q$);
insert into resultado (prueba, esperado, resultado)
select '2b un segundo paso abierto en la misma cotización, no', 'contiene: uq_cotizacion_un_paso_abierto', pg_temp.intentar($q$
  insert into cotizacion_seguimientos (cotizacion_id, tipo) values ('00000000-0000-0000-0000-0000000099c2', 'correo')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c "otro" sin decir cuál, no', 'contiene: cotizacion_seguimientos_otro', pg_temp.intentar($q$
  insert into cotizacion_seguimientos (cotizacion_id, tipo) values ('00000000-0000-0000-0000-0000000099c3', 'otro')$q$);
insert into resultado (prueba, esperado, resultado)
select '2d un tipo que no está en el catálogo, no', 'contiene: cotizacion_seguimientos_tipo_check', pg_temp.intentar($q$
  insert into cotizacion_seguimientos (cotizacion_id, tipo) values ('00000000-0000-0000-0000-0000000099c3', 'fax')$q$);
insert into resultado (prueba, esperado, resultado)
select '2e alertas de la dos: paso vencido, validez al día', 'vencido / validez al día', pg_temp.valor($q$
  select case when paso_vencido then 'vencido' else 'al día' end || ' / ' || case when validez_vencida then 'validez vencida' else 'validez al día' end
  from v_cotizaciones_alertas where cotizacion_id = '00000000-0000-0000-0000-0000000099c2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f alertas de la tres (enviada hace 30 días, validez 10): sin paso y validez vencida', 'sin paso / validez vencida', pg_temp.valor($q$
  select case when sin_paso then 'sin paso' else 'con paso' end || ' / ' || case when validez_vencida then 'validez vencida' else 'validez al día' end
  from v_cotizaciones_alertas where cotizacion_id = '00000000-0000-0000-0000-0000000099c3'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g cerrar sin resultado, no', 'contiene: Escribe el resultado', pg_temp.intentar($q$
  select fn_cerrar_seguimiento('00000000-0000-0000-0000-0000000099f1', '  ')$q$);
insert into resultado (prueba, esperado, resultado)
select '2h cerrar la llamada y dejar "espera de consejo" para dentro de 20 días', 'aceptado (1 filas)', pg_temp.intentar($q$
  select fn_cerrar_seguimiento('00000000-0000-0000-0000-0000000099f1', 'Habló con la administradora: lo lleva al consejo.',
                               'espera_consejo_o_asamblea', current_date + 20, '00000000-0000-0000-0000-0000000099a0')$q$);
insert into resultado (prueba, esperado, resultado)
select '2i el cerrado quedó con su resultado y quién; el nuevo abierto es la espera', 'true / espera_consejo_o_asamblea', pg_temp.valor($q$
  select (select (realizado_en is not null and cerrado_por = '00000000-0000-0000-0000-0000000099a0' and resultado like 'Habló%')::text
          from cotizacion_seguimientos where id = '00000000-0000-0000-0000-0000000099f1') || ' / ' ||
         (select tipo from cotizacion_seguimientos where cotizacion_id = '00000000-0000-0000-0000-0000000099c2' and realizado_en is null)$q$);
insert into resultado (prueba, esperado, resultado)
select '2j con la espera del consejo a futuro, ya no está vencido', 'al día', pg_temp.valor($q$
  select case when paso_vencido then 'vencido' else 'al día' end from v_cotizaciones_alertas where cotizacion_id = '00000000-0000-0000-0000-0000000099c2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2k un paso cerrado no se edita', 'contiene: ya se cerró', pg_temp.intentar($q$
  update cotizacion_seguimientos set resultado = 'otro' where id = '00000000-0000-0000-0000-0000000099f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2l un paso no se borra', 'contiene: permission denied', pg_temp.intentar($q$
  delete from cotizacion_seguimientos where id = '00000000-0000-0000-0000-0000000099f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2m paso "por definir" (sin tipo ni fecha) en la tres', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into cotizacion_seguimientos (cotizacion_id) values ('00000000-0000-0000-0000-0000000099c3')$q$);
insert into resultado (prueba, esperado, resultado)
select '2n … y la alerta lo dice', 'por definir', pg_temp.valor($q$
  select case when paso_por_definir then 'por definir' else 'definido' end from v_cotizaciones_alertas where cotizacion_id = '00000000-0000-0000-0000-0000000099c3'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000099b0');
insert into resultado (prueba, esperado, resultado)
select '2o el técnico no ve seguimientos', '0', pg_temp.valor($q$select count(*)::text from cotizacion_seguimientos$q$);

-- ============================================================ 3) la CSE-26-157 y estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '3a la CSE-26-157 quedó en evaluación con un paso por definir (sin tipo ni fecha)', 'EN_EVALUACION / 1 / sin tipo / sin fecha', pg_temp.valor($q$
  select c.estado::text || ' / ' || count(s.id)::text || ' / ' ||
         case when bool_and(s.tipo is null) then 'sin tipo' else 'con tipo' end || ' / ' ||
         case when bool_and(s.fecha_programada is null) then 'sin fecha' else 'con fecha' end
  from cotizaciones c left join cotizacion_seguimientos s on s.cotizacion_id = c.id and s.realizado_en is null
  where c.id = '3e613c30-a47f-4c4d-b177-765226ed1e63'
  group by c.estado$q$);
insert into resultado (prueba, esperado, resultado)
select '3b funciones del seguimiento ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_cotizacion_estado_reglas', 'fn_cotizacion_seguimientos_reglas', 'fn_cerrar_seguimiento')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '3c el listado de cotizaciones sigue leyendo (con el estado nuevo)', 'true', pg_temp.valor($q$
  select (count(*) >= 0)::text from v_cotizaciones_listado$q$);

-- ============================================================ limpieza (admin)
delete from cotizacion_seguimientos where cotizacion_id::text like '00000000-0000-0000-0000-0000000099c_';
delete from cotizaciones where id::text like '00000000-0000-0000-0000-0000000099c_';
delete from clientes where id = '00000000-0000-0000-0000-0000000099e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000099_0';
delete from permisos_rol where rol_id in (select id from roles where nombre = '__Comercial 99__');
delete from roles where nombre = '__Comercial 99__';
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000099_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

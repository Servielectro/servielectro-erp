-- Verificación de la migración 115. Correr DESPUÉS de la migración, todo junto. Crea dos usuarios de
-- prueba y toca el estándar 5.1.1 de 2026; lo DEJA COMO ESTABA y borra los usuarios. Todo OK.
-- Las pruebas de rechazo usan usuarios que SÍ pasan la RLS de update (SG-SST "trabajar"), así que lo
-- que rebota es la regla del trigger y no la RLS: cada una espera el mensaje de la regla.
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

create temporary table antes_511 on commit drop as
select calificacion, motivo_no_aplica, calificado_por, calificado_en from sst_plan_items where anio = 2026 and codigo = '5.1.1';

-- G = gestión SST ("responsable"). T = SG-SST "trabajar".
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001150a0', 'authenticated', 'authenticated', 'gestion.115@invalid.local'),
  ('00000000-0000-0000-0000-0000001150b0', 'authenticated', 'authenticated', 'trabajar.115@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Gestión 115__'), ('__Trabajar 115__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'sgsst', v.nivel::nivel_permiso, false
from (values ('__Gestión 115__', 'responsable'), ('__Trabajar 115__', 'trabajar')) v(rol, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000001150a0', '__Gestión 115__', '__G 115__'),
             ('00000000-0000-0000-0000-0000001150b0', '__Trabajar 115__', '__T 115__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

set local role authenticated;

-- ============================================================ 1) quién califica
select pg_temp.como('00000000-0000-0000-0000-0000001150b0');
insert into resultado (prueba, esperado, resultado)
select '1a "trabajar" no califica (pasa la RLS; lo frena la regla)', 'contiene: Calificar los estándares es de la gestión SST', pg_temp.intentar($q$
  update sst_plan_items set calificacion = 'cumple' where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1b "trabajar" no cambia el peso', 'contiene: no se cambian desde la app', pg_temp.intentar($q$
  update sst_plan_items set valor = 10 where anio = 2026 and codigo = '5.1.1'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000001150a0');
insert into resultado (prueba, esperado, resultado)
select '1c la gestión califica "cumple"', 'aceptado (1 filas)', pg_temp.intentar($q$
  update sst_plan_items set calificacion = 'cumple' where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d … y quién y cuándo los puso la base', 'G / con fecha',
  pg_temp.valor($q$select case when calificado_por = '00000000-0000-0000-0000-0000001150a0' then 'G' else '?' end || ' / '
                       || case when calificado_en is not null then 'con fecha' else 'sin fecha' end
                   from sst_plan_items where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1e "no aplica" sin motivo (lo frena el CHECK de la 108)', 'contiene: sst_plan_items_no_aplica_con_motivo', pg_temp.intentar($q$
  update sst_plan_items set calificacion = 'no_aplica' where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f ni la gestión cambia el peso', 'contiene: no se cambian desde la app', pg_temp.intentar($q$
  update sst_plan_items set valor = 10 where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1g ni marca un peso como verificado', 'contiene: no se cambian desde la app', pg_temp.intentar($q$
  update sst_plan_items set valor_verificado = false where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1h quién calificó no se escribe a mano', 'contiene: Quién y cuándo calificó lo registra la base', pg_temp.intentar($q$
  update sst_plan_items set calificado_por = '00000000-0000-0000-0000-0000001150b0' where anio = 2026 and codigo = '5.1.1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1i un estándar de la Resolución no se agrega desde la app', 'contiene: no se agregan desde la app', pg_temp.intentar($q$
  insert into sst_plan_items (estandar, anio, codigo, ciclo, grupo, valor) values ('__115__', 2027, '1.1.1', 'PLANEAR', 'x', 0.5)$q$);
insert into resultado (prueba, esperado, resultado)
select '1j volver a pendiente borra quién calificó', '(vacío)', pg_temp.valor($q$
  with u as (update sst_plan_items set calificacion = 'pendiente' where anio = 2026 and codigo = '5.1.1' returning calificado_por)
  select calificado_por::text from u$q$);

-- ============================================================ el 5.1.1 vuelve a como estaba (admin)
reset role;
update sst_plan_items i
   set calificacion = a.calificacion, motivo_no_aplica = a.motivo_no_aplica, calificado_por = a.calificado_por, calificado_en = a.calificado_en
  from antes_511 a where i.anio = 2026 and i.codigo = '5.1.1';
insert into resultado (prueba, esperado, resultado)
select '2 el 5.1.1 quedó como estaba', 'true',
  (select (i.calificacion = a.calificacion and i.calificado_por is not distinct from a.calificado_por)::text
     from sst_plan_items i, antes_511 a where i.anio = 2026 and i.codigo = '5.1.1');

delete from perfiles where id::text like '00000000-0000-0000-0000-0000001150_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Gestión 115__', '__Trabajar 115__'));
delete from roles where nombre in ('__Gestión 115__', '__Trabajar 115__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000001150_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

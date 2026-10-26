-- Verificación de la migración 74 (CRM: origen del lead y nombres de responsables). Correr
-- DESPUÉS de la migración, todo junto. Prueba: el origen solo acepta la lista; los negocios sin
-- origen siguen sirviendo; Comercial ve id y nombre de los responsables (no de quien no es
-- comercial) sin que se le abra la tabla perfiles; sin Comercial no ve nada.
-- Crea personas, un cliente y un negocio de prueba y BORRA todo antes del resultado.
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
-- C = Comercial "trabajar". K = Comercial "consultar". T = técnico (sin Comercial).
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000074a0', 'authenticated', 'authenticated', 'comercial.74@invalid.local'),
  ('00000000-0000-0000-0000-0000000074b0', 'authenticated', 'authenticated', 'consulta.74@invalid.local'),
  ('00000000-0000-0000-0000-0000000074c0', 'authenticated', 'authenticated', 'tecnico.74@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Comercial prueba 74__'), ('__consulta prueba 74__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'comercial', case r.nombre when '__Comercial prueba 74__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__Comercial prueba 74__', '__consulta prueba 74__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000074a0', '__Comercial prueba 74__', '__C 74__'),
  ('00000000-0000-0000-0000-0000000074b0', '__consulta prueba 74__', '__K 74__'),
  ('00000000-0000-0000-0000-0000000074c0', 'Técnicos', '__T 74__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into clientes (id, nombre) values ('00000000-0000-0000-0000-0000000074d1', '__Cliente 74__');

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000074a0');
insert into resultado (prueba, esperado, resultado)
select '1a negocio con origen de la lista', 'referido',
  pg_temp.valor($q$with n as (insert into oportunidades (id, nombre, cliente_id, etapa_id, origen_lead) values
                  ('00000000-0000-0000-0000-0000000074e1', '__Negocio 74__', '00000000-0000-0000-0000-0000000074d1', 'solicitud', 'referido') returning origen_lead)
                  select origen_lead from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1b origen fuera de la lista', 'contiene: oportunidades_origen_lead', pg_temp.intentar($q$
  update oportunidades set origen_lead = 'Referido' where id = '00000000-0000-0000-0000-0000000074e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c sin origen sigue sirviendo (los negocios viejos)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update oportunidades set origen_lead = null where id = '00000000-0000-0000-0000-0000000074e1'$q$);

insert into resultado (prueba, esperado, resultado)
select '2a Comercial ve los nombres de C (responsable) y no los de T', '__C 74__ / sin T',
  pg_temp.valor($q$select (select string_agg(nombre, ',') from fn_crm_responsables() where nombre like '%74%') || ' / ' ||
                  case when exists (select 1 from fn_crm_responsables() where nombre = '__T 74__') then 'con T' else 'sin T' end$q$);
insert into resultado (prueba, esperado, resultado)
select '2b ... pero la tabla perfiles le sigue cerrada', '1',
  pg_temp.valor($q$select count(*)::text from perfiles where id::text like '00000000-0000-0000-0000-0000000074_0'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000074b0');
insert into resultado (prueba, esperado, resultado)
select '2c Comercial "consultar" también ve los nombres', '__C 74__',
  pg_temp.valor($q$select string_agg(nombre, ',') from fn_crm_responsables() where nombre like '%74%'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000074c0');
insert into resultado (prueba, esperado, resultado)
select '2d el técnico (sin Comercial) no ve nombres', '0', pg_temp.valor($q$select count(*)::text from fn_crm_responsables()$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '2e anónimo no la ejecuta', 'false',
  pg_temp.valor($q$select has_function_privilege('anon', 'fn_crm_responsables()', 'execute')::text$q$);

-- ============================================================ limpieza (admin)
delete from oportunidad_etapas_historial where oportunidad_id = '00000000-0000-0000-0000-0000000074e1';
delete from oportunidades where id = '00000000-0000-0000-0000-0000000074e1';
delete from clientes where id = '00000000-0000-0000-0000-0000000074d1';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000074_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Comercial prueba 74__', '__consulta prueba 74__'));
delete from roles where nombre in ('__Comercial prueba 74__', '__consulta prueba 74__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000074_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

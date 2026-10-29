-- Verificación de la migración 104 (observaciones en Registrar problema). Correr DESPUÉS de la
-- migración, todo junto. Crea una revisora de SST (SG-SST "consultar") y reportes de prueba, y
-- BORRA todo antes de mostrar el resultado. Todo debe decir OK.
-- (La verificación de la 73 usaba el estado 'no_es_error', que desde aquí es 'descartado'.)
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

-- S = revisora de SST (SG-SST "consultar", nada más). J = Jhojan (Configuración "responsable").
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001040a0', 'authenticated', 'authenticated', 'revisora-sst.104@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Revisión SST 104__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'sgsst', 'consultar', false from roles r where r.nombre = '__Revisión SST 104__'
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select '00000000-0000-0000-0000-0000001040a0', r.id, '__S 104__' from roles r where r.nombre = '__Revisión SST 104__'
on conflict (id) do update set rol_id = excluded.rol_id;

set local role authenticated;

-- ============================================================ 1) la revisora deja observaciones
select pg_temp.como('00000000-0000-0000-0000-0000001040a0');
insert into resultado (prueba, esperado, resultado)
select '1a hallazgo con norma: nace nuevo, módulo de la ruta', 'nuevo / hallazgo / sgsst / Formatos',
  pg_temp.valor($q$with n as (insert into reportes_problema (id, ruta, seccion, tipo, norma, que_paso) values
                  ('00000000-0000-0000-0000-0000001040c1', '/sgsst/formatos/abc', 'Formatos', 'hallazgo', 'Resolución 0312 de 2019, art. 16',
                   'La inspección no pide la firma del responsable del SG-SST') returning estado, tipo, modulo, seccion)
                  select estado || ' / ' || tipo || ' / ' || modulo || ' / ' || seccion from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1b hallazgo SIN norma', 'contiene: reportes_problema_norma', pg_temp.intentar($q$
  insert into reportes_problema (ruta, tipo, que_paso) values ('/sgsst', 'hallazgo', 'Falta algo')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c sugerencia sin norma ni gravedad', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into reportes_problema (id, ruta, tipo, que_paso) values ('00000000-0000-0000-0000-0000001040c2', '/sgsst/plan', 'sugerencia', 'Que el plan se pueda filtrar por estándar')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d una sugerencia no guarda gravedad aunque la manden', '(vacío)', pg_temp.valor($q$
  with n as (insert into reportes_problema (ruta, tipo, que_paso, gravedad) values ('/sgsst', 'duda', '¿Dónde se ve el plan anual?', 'bloquea') returning gravedad)
  select gravedad from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1e un problema sigue exigiendo la gravedad', 'contiene: reportes_problema_gravedad_requerida', pg_temp.intentar($q$
  insert into reportes_problema (ruta, tipo, que_paso) values ('/sgsst', 'problema', 'No carga')$q$);
insert into resultado (prueba, esperado, resultado)
select '1f un tipo que no existe', 'contiene: reportes_problema_tipo', pg_temp.intentar($q$
  insert into reportes_problema (ruta, tipo, que_paso) values ('/sgsst', 'queja', 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '1g no cambia la norma de lo que ya dejó', 'aceptado (0 filas)', pg_temp.intentar($q$
  update reportes_problema set norma = 'otra' where id = '00000000-0000-0000-0000-0000001040c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1h la revisora no se acepta sus propias observaciones', 'aceptado (0 filas)', pg_temp.intentar($q$
  update reportes_problema set estado = 'aceptado' where id = '00000000-0000-0000-0000-0000001040c1'$q$);

-- ============================================================ 2) Jhojan decide
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '2a en estudio', 'aceptado (1 filas)', pg_temp.intentar($q$
  update reportes_problema set estado = 'en_revision' where id = '00000000-0000-0000-0000-0000001040c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b aceptada (sin nota obligatoria), queda quién', 'aceptado / J', pg_temp.valor($q$
  with n as (update reportes_problema set estado = 'aceptado' where id = '00000000-0000-0000-0000-0000001040c1' returning estado, revisado_por)
  select estado || ' / ' || case when revisado_por = '696d9431-5c4d-4043-aee4-3e4597094f26' then 'J' else '?' end from n$q$);
insert into resultado (prueba, esperado, resultado)
select '2c implementada sin decir qué se hizo', 'contiene: reportes_problema_cierre', pg_temp.intentar($q$
  update reportes_problema set estado = 'resuelto' where id = '00000000-0000-0000-0000-0000001040c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d implementada con nota', 'aceptado (1 filas)', pg_temp.intentar($q$
  update reportes_problema set estado = 'resuelto', nota_cierre = 'La inspección pide ahora la firma del responsable' where id = '00000000-0000-0000-0000-0000001040c1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e descartar SIN razón', 'contiene: reportes_problema_cierre', pg_temp.intentar($q$
  update reportes_problema set estado = 'descartado' where id = '00000000-0000-0000-0000-0000001040c2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f descartar con razón', 'aceptado (1 filas)', pg_temp.intentar($q$
  update reportes_problema set estado = 'descartado', nota_cierre = 'El plan ya se filtra por ciclo PHVA; por estándar no aporta' where id = '00000000-0000-0000-0000-0000001040c2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g de descartada no pasa a aceptada sin reabrir', 'contiene: no pasa de', pg_temp.intentar($q$
  update reportes_problema set estado = 'aceptado' where id = '00000000-0000-0000-0000-0000001040c2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2h el estado viejo "no_es_error" ya no existe', 'contiene: reportes_problema_estado_check', pg_temp.intentar($q$
  update reportes_problema set estado = 'en_revision' where id = '00000000-0000-0000-0000-0000001040c2'$q$)
  || pg_temp.intentar($q$update reportes_problema set estado = 'no_es_error', nota_cierre = 'x' where id = '00000000-0000-0000-0000-0000001040c2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2i ni Jhojan edita lo que ella escribió', 'contiene: Lo reportado no se edita', pg_temp.intentar($q$
  update reportes_problema set tipo = 'sugerencia' where id = '00000000-0000-0000-0000-0000001040c1'$q$);

-- ============================================================ 3) ella ve en qué quedó cada una
select pg_temp.como('00000000-0000-0000-0000-0000001040a0');
insert into resultado (prueba, esperado, resultado)
select '3a ve las suyas con estado y respuesta', 'resuelto: La inspección pide ahora la firma del responsable | en_revision',
  pg_temp.valor($q$select string_agg(estado || coalesce(': ' || nota_cierre, ''), ' | ' order by id)
                   from reportes_problema where id in ('00000000-0000-0000-0000-0000001040c1', '00000000-0000-0000-0000-0000001040c2')$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '3b no quedó ningún reporte en el estado viejo', '0',
  (select count(*)::text from reportes_problema where estado = 'no_es_error');

-- ============================================================ limpieza (admin)
delete from reportes_problema where reportado_por = '00000000-0000-0000-0000-0000001040a0';
delete from perfiles where id = '00000000-0000-0000-0000-0000001040a0';
delete from permisos_rol where rol_id in (select id from roles where nombre = '__Revisión SST 104__');
delete from roles where nombre = '__Revisión SST 104__';
delete from auth.users where id = '00000000-0000-0000-0000-0000001040a0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

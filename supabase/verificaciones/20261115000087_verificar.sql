-- Verificación de la migración 87 (contratistas). Correr DESPUÉS de la migración, todo junto.
-- Crea un CONTRATISTA, un TÉCNICO y un COORDINADOR de prueba, tarifas, una planilla y cuentas de
-- cobro; BORRA todo antes de mostrar el resultado.
-- Resultado esperado: todas las filas en "OK".
--
-- Supuestos (los confirma el caso 0): Jhojan (696d…) es Administrador (con Administrativo y,
-- desde esta migración, Contratistas "responsable"). La tarifa la ven SOLO él y el contratista
-- (Jhojan, 2026-10-27): el caso 0d cuenta quiénes la ven y 0e dice sus nombres.
-- Lo que NO prueba: las políticas del bucket "contratistas" (Storage); se prueban desde la app.

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

-- Personas: Jhojan 696d…; contratista …8c1; técnico …8c2; coordinador …8c3.
-- Contratista …8a1; tarifas …8b1 / …8b2; planilla …8d1; cuentas …8e1 / …8e2.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000008c1', 'authenticated', 'authenticated', 'contratista.prueba.87@invalid.local'),
  ('00000000-0000-0000-0000-0000000008c2', 'authenticated', 'authenticated', 'tecnico.prueba.87@invalid.local'),
  ('00000000-0000-0000-0000-0000000008c3', 'authenticated', 'authenticated', 'coordinador.prueba.87@invalid.local')
on conflict (id) do nothing;
insert into perfiles (id, rol_id, nombre)
select x.id::uuid, r.id, x.nombre
from (values ('00000000-0000-0000-0000-0000000008c1', 'Contratistas', '__Contratista prueba 87__'),
             ('00000000-0000-0000-0000-0000000008c2', 'Técnicos', '__Técnico prueba 87__'),
             ('00000000-0000-0000-0000-0000000008c3', 'Coordinador', '__Coordinador prueba 87__')) as x(id, rol, nombre)
join roles r on r.nombre = x.rol
on conflict (id) do update set rol_id = excluded.rol_id, nombre = excluded.nombre;

-- ============================================================ 0) supuestos
insert into resultado (prueba, esperado, resultado)
select '0a Jhojan tiene Administrativo y Contratistas responsable', 'true', pg_temp.valor($q$
  select (2 = (select count(*) from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id
               where p.id = '696d9431-5c4d-4043-aee4-3e4597094f26' and pr.nivel = 'responsable'
                 and pr.modulo_id in ('administrativo', 'contratistas')))::text$q$);
insert into resultado (prueba, esperado, resultado)
select '0b solo el rol Administrador tiene Contratistas responsable', 'Administrador', pg_temp.valor($q$
  select string_agg(r.nombre, ',' order by r.nombre) from roles r join permisos_rol pr on pr.rol_id = r.id
  where pr.modulo_id = 'contratistas' and pr.nivel = 'responsable'$q$);
insert into resultado (prueba, esperado, resultado)
select '0c el rol Contratistas solo tiene el módulo contratistas', 'contratistas', pg_temp.valor($q$
  select string_agg(pr.modulo_id, ',' order by pr.modulo_id) from roles r join permisos_rol pr on pr.rol_id = r.id where r.nombre = 'Contratistas'$q$);
-- "Solo lo vemos el contratista y yo": personas reales (no las de prueba) que verían TODAS las tarifas.
insert into resultado (prueba, esperado, resultado)
select '0d personas que ven todas las tarifas', '1', pg_temp.valor($q$
  select count(*)::text from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id
  where pr.modulo_id = 'contratistas' and pr.nivel = 'responsable' and p.id::text not like '00000000-0000-0000-0000-0000000008%'$q$);
insert into resultado (prueba, esperado, resultado)
select '0e … quién es (tiene que ser Jhojan)', '(informativo)', pg_temp.valor($q$
  select string_agg(coalesce(p.nombre, p.id::text), ', ') from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id
  where pr.modulo_id = 'contratistas' and pr.nivel = 'responsable' and p.id::text not like '00000000-0000-0000-0000-0000000008%'$q$);

set local role authenticated;

-- ============================================================ 1) alta y tarifa (Jhojan)
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '1a Jhojan da de alta al contratista con su usuario', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into contratistas (id, perfil_id, nombre, tipo_documento, numero_documento)
  values ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000008c1', 'Contratista Prueba 87', 'CC', '87000001')$q$);
insert into resultado (prueba, esperado, resultado)
select '1b Jhojan pacta la tarifa por día', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into contratista_tarifas (id, contratista_id, modalidad, valor, vigente_desde)
  values ('00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008a1', 'dia', 150000, '2026-10-01')$q$);
insert into resultado (prueba, esperado, resultado)
select '1c obra/labor sin decir qué se pactó', 'contiene: contratista_tarifas_obra_describe', pg_temp.intentar($q$
  insert into contratista_tarifas (contratista_id, modalidad, valor, vigente_desde)
  values ('00000000-0000-0000-0000-0000000008a1', 'obra_labor', 2000000, '2026-10-01')$q$);
insert into resultado (prueba, esperado, resultado)
select '1d … con la obra/labor descrita', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into contratista_tarifas (id, contratista_id, modalidad, valor, descripcion, vigente_desde)
  values ('00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008a1', 'obra_labor', 2000000, 'Cableado piso 3', '2026-10-01')$q$);
insert into resultado (prueba, esperado, resultado)
-- Sin política de update: la fila ni siquiera se alcanza (0 filas). El trigger es la segunda
-- barrera, por si algún día se abre una política.
select '1e una tarifa pactada no se cambia (filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update contratista_tarifas set valor = 1 where id = '00000000-0000-0000-0000-0000000008b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1f ni se borra', 'contiene: permission denied', pg_temp.intentar($q$
  delete from contratista_tarifas where id = '00000000-0000-0000-0000-0000000008b1'$q$);

-- ============================================================ 2) quién ve la tarifa
select pg_temp.como('00000000-0000-0000-0000-0000000008c1');
insert into resultado (prueba, esperado, resultado)
select '2a el contratista ve sus dos tarifas', '2', pg_temp.valor($q$select count(*) from contratista_tarifas$q$);
insert into resultado (prueba, esperado, resultado)
select '2b el contratista NO se pacta una tarifa', 'contiene: row-level security', pg_temp.intentar($q$
  insert into contratista_tarifas (contratista_id, modalidad, valor, vigente_desde)
  values ('00000000-0000-0000-0000-0000000008a1', 'dia', 999999, '2026-10-01')$q$);
insert into resultado (prueba, esperado, resultado)
select '2c el contratista NO se edita su ficha (filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update contratistas set nombre = 'otro' where id = '00000000-0000-0000-0000-0000000008a1'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000008c2');
insert into resultado (prueba, esperado, resultado)
select '2d el técnico NO ve tarifas', '0', pg_temp.valor($q$select count(*) from contratista_tarifas$q$);
insert into resultado (prueba, esperado, resultado)
select '2e el técnico NO ve contratistas', '0', pg_temp.valor($q$select count(*) from contratistas$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000008c3');
insert into resultado (prueba, esperado, resultado)
select '2f el coordinador NO ve tarifas', '0', pg_temp.valor($q$select count(*) from contratista_tarifas$q$);

-- ============================================================ 3) planilla: inferida hasta que alguien la confirme
select pg_temp.como('00000000-0000-0000-0000-0000000008c1');
insert into resultado (prueba, esperado, resultado)
select '3a el contratista sube la planilla (y pretende que nazca confirmada)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into contratista_planillas (id, contratista_id, archivo_path, estado, vigencia_desde, vigencia_hasta)
  values ('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008a1',
          '00000000-0000-0000-0000-0000000008a1/planillas/pila-octubre.pdf', 'confirmada', '2026-10-01', '2026-10-31')$q$);
insert into resultado (prueba, esperado, resultado)
select '3b … nació inferida y sin vigencia confirmada', 'inferida / (vacío)', pg_temp.valor($q$
  select estado || ' / ' || coalesce(vigencia_desde::text, '(vacío)') from contratista_planillas where id = '00000000-0000-0000-0000-0000000008d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c la lectura escribe lo inferido', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratista_planillas set lectura_estado = 'leida', lectura_en = now(), periodo_inferido = '2026-10',
         vigencia_desde_inferida = '2026-10-01', vigencia_hasta_inferida = '2026-10-31'
  where id = '00000000-0000-0000-0000-0000000008d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3d la lectura no puede escribir la vigencia confirmada', 'contiene: se confirma al revisar', pg_temp.intentar($q$
  update contratista_planillas set vigencia_desde = '2026-10-01' where id = '00000000-0000-0000-0000-0000000008d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3e la lectura agrega dos personas', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into contratista_planilla_personas (planilla_id, fuente, nombre, numero_documento, dias_cotizados) values
    ('00000000-0000-0000-0000-0000000008d1', 'lectura', 'Ayudante Uno', '87000011', 30),
    ('00000000-0000-0000-0000-0000000008d1', 'lectura', 'Ayudante Dos', '87000012', 30)$q$);
insert into resultado (prueba, esperado, resultado)
select '3f el contratista NO confirma su propia planilla', 'contiene: requiere Administrativo', pg_temp.intentar($q$
  update contratista_planillas set estado = 'confirmada', vigencia_desde = '2026-10-01', vigencia_hasta = '2026-10-31'
  where id = '00000000-0000-0000-0000-0000000008d1'$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3g mientras es inferida, la cobertura del 15/10 es cero', '0', pg_temp.valor($q$
  select count(*) from fn_contratista_cobertura('00000000-0000-0000-0000-0000000008a1', '2026-10-15')$q$);
insert into resultado (prueba, esperado, resultado)
select '3h quien revisa descarta una persona mal leída', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratista_planilla_personas set descartada = true
  where planilla_id = '00000000-0000-0000-0000-0000000008d1' and numero_documento = '87000012'$q$);
insert into resultado (prueba, esperado, resultado)
select '3i confirmar sin escribir la vigencia', 'contiene: escribe la vigencia', pg_temp.intentar($q$
  update contratista_planillas set estado = 'confirmada' where id = '00000000-0000-0000-0000-0000000008d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3j Jhojan confirma con la vigencia revisada', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratista_planillas set estado = 'confirmada', vigencia_desde = '2026-10-01', vigencia_hasta = '2026-10-31'
  where id = '00000000-0000-0000-0000-0000000008d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3k cobertura del 15/10: una persona (la descartada no cuenta)', '1', pg_temp.valor($q$
  select count(*) from fn_contratista_cobertura('00000000-0000-0000-0000-0000000008a1', '2026-10-15')$q$);
insert into resultado (prueba, esperado, resultado)
select '3l confirmada: el personal queda sellado', 'contiene: quedó sellado', pg_temp.intentar($q$
  insert into contratista_planilla_personas (planilla_id, nombre, numero_documento)
  values ('00000000-0000-0000-0000-0000000008d1', 'Colado', '87000099')$q$);
insert into resultado (prueba, esperado, resultado)
select '3m confirmada: la planilla no se cambia', 'contiene: ya fue revisada', pg_temp.intentar($q$
  update contratista_planillas set vigencia_hasta = '2026-12-31' where id = '00000000-0000-0000-0000-0000000008d1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3n una planilla no se borra', 'contiene: permission denied', pg_temp.intentar($q$
  delete from contratista_planillas where id = '00000000-0000-0000-0000-0000000008d1'$q$);

-- ============================================================ 4) cuentas de cobro
select pg_temp.como('00000000-0000-0000-0000-0000000008c1');
insert into resultado (prueba, esperado, resultado)
select '4a el contratista crea su cuenta de octubre (y escribe otro valor unitario)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into contratista_cuentas_cobro (id, contratista_id, periodo_desde, periodo_hasta, concepto, tarifa_id, cantidad, valor_unitario, valor_total)
  values ('00000000-0000-0000-0000-0000000008e1', '00000000-0000-0000-0000-0000000008a1', '2026-10-01', '2026-10-31',
          'Días trabajados octubre', '00000000-0000-0000-0000-0000000008b1', 20, 1, 1)$q$);
insert into resultado (prueba, esperado, resultado)
select '4b el valor sale de la tarifa pactada: 20 × 150.000', '3000000.00', pg_temp.valor($q$
  select valor_total::text from contratista_cuentas_cobro where id = '00000000-0000-0000-0000-0000000008e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4c la radica', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratista_cuentas_cobro set estado = 'radicada' where id = '00000000-0000-0000-0000-0000000008e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4d … y recibe el consecutivo 1', '1', pg_temp.valor($q$
  select numero::text from contratista_cuentas_cobro where id = '00000000-0000-0000-0000-0000000008e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4e radicada no se edita', 'contiene: no se edita', pg_temp.intentar($q$
  update contratista_cuentas_cobro set cantidad = 25 where id = '00000000-0000-0000-0000-0000000008e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4f el contratista NO se aprueba la cuenta', 'contiene: quien maneja los contratistas', pg_temp.intentar($q$
  update contratista_cuentas_cobro set estado = 'aprobada' where id = '00000000-0000-0000-0000-0000000008e1'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000008c2');
insert into resultado (prueba, esperado, resultado)
select '4g el técnico NO ve cuentas de cobro', '0', pg_temp.valor($q$select count(*) from contratista_cuentas_cobro$q$);
insert into resultado (prueba, esperado, resultado)
select '4h el técnico NO ve el historial', '0', pg_temp.valor($q$select count(*) from contratista_eventos$q$);

select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '4i cuenta de noviembre radicada por Jhojan', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into contratista_cuentas_cobro (id, contratista_id, periodo_desde, periodo_hasta, concepto, valor_total)
  values ('00000000-0000-0000-0000-0000000008e2', '00000000-0000-0000-0000-0000000008a1', '2026-11-01', '2026-11-05', 'Días noviembre', 750000)$q$);
insert into resultado (prueba, esperado, resultado)
select '4j … se radica', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratista_cuentas_cobro set estado = 'radicada' where id = '00000000-0000-0000-0000-0000000008e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4k noviembre sin planilla confirmada: NO se aprueba', 'contiene: sin planilla de parafiscales CONFIRMADA', pg_temp.intentar($q$
  update contratista_cuentas_cobro set estado = 'aprobada' where id = '00000000-0000-0000-0000-0000000008e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4l octubre (cubierto) se aprueba', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratista_cuentas_cobro set estado = 'aprobada' where id = '00000000-0000-0000-0000-0000000008e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4m pagar sin fecha', 'contiene: fecha del pago', pg_temp.intentar($q$
  update contratista_cuentas_cobro set estado = 'pagada' where id = '00000000-0000-0000-0000-0000000008e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4n pagar con fecha', 'aceptado (1 filas)', pg_temp.intentar($q$
  update contratista_cuentas_cobro set estado = 'pagada', pagada_en = '2026-11-10' where id = '00000000-0000-0000-0000-0000000008e1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4o rechazar sin motivo', 'contiene: motivo del rechazo', pg_temp.intentar($q$
  update contratista_cuentas_cobro set estado = 'rechazada' where id = '00000000-0000-0000-0000-0000000008e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4p una cuenta no se borra', 'contiene: permission denied', pg_temp.intentar($q$
  delete from contratista_cuentas_cobro where id = '00000000-0000-0000-0000-0000000008e2'$q$);
insert into resultado (prueba, esperado, resultado)
select '4q el historial registró tarifas, planilla y cuentas', '>= 9', pg_temp.valor($q$
  select count(*) from contratista_eventos where contratista_id = '00000000-0000-0000-0000-0000000008a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '4r el historial no se escribe a mano', 'contiene: permission denied', pg_temp.intentar($q$
  insert into contratista_eventos (contratista_id, tipo) values ('00000000-0000-0000-0000-0000000008a1', 'x')$q$);

-- ============================================================ 5) el contratista pierde el rol
reset role;
update perfiles set rol_id = (select id from roles where nombre = 'Técnicos') where id = '00000000-0000-0000-0000-0000000008c1';
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000008c1');
insert into resultado (prueba, esperado, resultado)
select '5a sin el rol Contratistas, deja de ver sus tarifas', '0', pg_temp.valor($q$select count(*) from contratista_tarifas$q$);

-- ============================================================ 6) estructura
reset role;
-- La regla de siempre: si una migración se olvida del revoke de PUBLIC, esto se cae.
insert into resultado (prueba, esperado, resultado)
select '6a funciones de contratistas ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_contratistas_valores_admin', 'fn_es_contratista', 'fn_contratista_de_planilla', 'fn_contratista_ve_valores', 'fn_contratista_ve_planillas',
                    'fn_contratista_cobertura', 'fn_contratista_dias_sin_cobertura', 'fn_contratista_archivo',
                    'fn_contratista_tarifas_reglas', 'fn_contratista_planillas_reglas', 'fn_contratista_personas_reglas',
                    'fn_contratista_cuentas_reglas', 'fn_contratista_historial')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '6b privilegios de anon en las tablas de contratistas', '0', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon' and table_name like 'contratista%';
insert into resultado (prueba, esperado, resultado)
select '6c el bucket contratistas es privado', 'false', (select public::text from storage.buckets where id = 'contratistas');
insert into resultado (prueba, esperado, resultado)
select '6d políticas de tarifas y cuentas que mencionan Técnicos u Operativo', '0', count(*)::text
from pg_policies
where schemaname = 'public' and tablename in ('contratista_tarifas', 'contratista_cuentas_cobro')
  and (coalesce(qual, '') ~ 'tecnico|operativo' or coalesce(with_check, '') ~ 'tecnico|operativo');

-- ============================================================ limpieza (admin)
delete from contratista_eventos where contratista_id = '00000000-0000-0000-0000-0000000008a1';
delete from contratista_cuentas_cobro where contratista_id = '00000000-0000-0000-0000-0000000008a1';
delete from contratista_planilla_personas where planilla_id = '00000000-0000-0000-0000-0000000008d1';
delete from contratista_planillas where contratista_id = '00000000-0000-0000-0000-0000000008a1';
delete from contratista_tarifas where contratista_id = '00000000-0000-0000-0000-0000000008a1';
delete from contratistas where id = '00000000-0000-0000-0000-0000000008a1';
delete from perfiles where id in ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000008c2', '00000000-0000-0000-0000-0000000008c3');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000008c2', '00000000-0000-0000-0000-0000000008c3');

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado like '>= %' and resultado ~ '^[0-9]+$' and resultado::int >= substring(esperado from 4)::int then 'OK'
    when esperado = '(informativo)' then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

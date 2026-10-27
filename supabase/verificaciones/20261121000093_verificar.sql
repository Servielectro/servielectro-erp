-- (2a falla con "malformed array literal" hasta correr la 97, que arregla el mensaje.)
-- Verificación de la migración 93 (datos del contrato: inferido → confirmado → otrosí). Correr
-- DESPUÉS de la migración (y de la 90), todo junto. Crea usuarios, un proyecto, documentos y
-- contratos de prueba; BORRA todo al final. Todas las filas deben decir OK.
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

-- P = Proyectos "responsable" (confirma). Q = Proyectos "trabajar" (carga). T = Técnicos.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000093a0', 'authenticated', 'authenticated', 'proy-resp.93@invalid.local'),
  ('00000000-0000-0000-0000-0000000093b0', 'authenticated', 'authenticated', 'proy-trab.93@invalid.local'),
  ('00000000-0000-0000-0000-0000000093c0', 'authenticated', 'authenticated', 'tecnico.93@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__Proy resp 93__'), ('__Proy trab 93__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'proyectos', v.nivel::nivel_permiso, false
from (values ('__Proy resp 93__', 'responsable'), ('__Proy trab 93__', 'trabajar')) v(rol, nivel)
join roles r on r.nombre = v.rol
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values ('00000000-0000-0000-0000-0000000093a0', '__Proy resp 93__', '__P 93__'),
             ('00000000-0000-0000-0000-0000000093b0', '__Proy trab 93__', '__Q 93__'),
             ('00000000-0000-0000-0000-0000000093c0', 'Técnicos', '__T 93__')) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;
insert into proyectos (id, codigo, nombre) values ('00000000-0000-0000-0000-0000000093e0', '__PRY-93__', '__Obra prueba 93__')
on conflict (id) do nothing;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000093b0');
-- El contrato firmado y un informe (que no es contrato).
insert into proyecto_documentos (id, proyecto_id, tipo, nombre, nombre_archivo, path, mime, bytes, sha256) values
  ('00000000-0000-0000-0000-0000000093d1', '00000000-0000-0000-0000-0000000093e0', 'contrato_firmado', 'Contrato', 'c.pdf',
   '00000000-0000-0000-0000-0000000093e0/c.pdf', 'application/pdf', 100, repeat('a', 64)),
  ('00000000-0000-0000-0000-0000000093d2', '00000000-0000-0000-0000-0000000093e0', 'informe_tecnico', 'Informe', 'i.pdf',
   '00000000-0000-0000-0000-0000000093e0/i.pdf', 'application/pdf', 100, repeat('b', 64));

-- ============================================================ 1) la propuesta entra como inferida
insert into resultado (prueba, esperado, resultado)
select '1a Q carga la propuesta (y pretende que nazca confirmada)', 'inferido / (vacío)', pg_temp.valor($q$
  with n as (insert into proyecto_contratos (id, proyecto_id, documento_id, numero, estado, confirmado_por, propuesta, propuesta_modelo, propuesta_en)
    values ('00000000-0000-0000-0000-0000000093f1', '00000000-0000-0000-0000-0000000093e0', '00000000-0000-0000-0000-0000000093d1', 'CSE-93',
            'confirmado', '00000000-0000-0000-0000-0000000093b0',
            '{"objeto": {"valor": "Mantenimiento de puertas", "pagina": 1, "cita": "…"}}', 'modelo-de-prueba', now())
    returning estado, confirmado_por)
  select estado || ' / ' || coalesce(confirmado_por::text, '(vacío)') from n$q$);
insert into resultado (prueba, esperado, resultado)
select '1b el documento tiene que ser el contrato firmado', 'contiene: contrato firmado del mismo proyecto', pg_temp.intentar($q$
  update proyecto_contratos set documento_id = '00000000-0000-0000-0000-0000000093d2' where id = '00000000-0000-0000-0000-0000000093f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1c Q revisa y escribe los campos (sigue inferido)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update proyecto_contratos set objeto = 'Mantenimiento de puertas vehiculares', valor_total = 16970535,
         plazo_cantidad = 12, plazo_unidad = 'dias_habiles', plazo_inicia = 'acta_inicio',
         forma_pago = '[{"concepto": "Anticipo", "porcentaje": 50}, {"concepto": "Corte", "porcentaje": 20}, {"concepto": "Entrega", "porcentaje": 50}, {"concepto": "Retegarantía", "porcentaje": 10}]'
  where id = '00000000-0000-0000-0000-0000000093f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '1d Q (trabajar) no confirma', 'contiene: lo hace el responsable', pg_temp.intentar($q$
  update proyecto_contratos set estado = 'confirmado' where id = '00000000-0000-0000-0000-0000000093f1'$q$);

-- ============================================================ 2) confirmar
select pg_temp.como('00000000-0000-0000-0000-0000000093a0');
insert into resultado (prueba, esperado, resultado)
select '2a sin alcance no se confirma', 'contiene: Para confirmar falta: alcance', pg_temp.intentar($q$
  update proyecto_contratos set estado = 'confirmado' where id = '00000000-0000-0000-0000-0000000093f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b una forma de pago que suma 130 % no se confirma', 'contiene: suma 130', pg_temp.intentar($q$
  update proyecto_contratos set estado = 'confirmado', alcance = 'Desmonte, cambio de rodamientos y puesta en marcha'
  where id = '00000000-0000-0000-0000-0000000093f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c corregida a 50/50, se confirma', 'aceptado (1 filas)', pg_temp.intentar($q$
  update proyecto_contratos set estado = 'confirmado', alcance = 'Desmonte, cambio de rodamientos y puesta en marcha',
         forma_pago = '[{"concepto": "Anticipo", "porcentaje": 50}, {"concepto": "Entrega", "porcentaje": 50}]'
  where id = '00000000-0000-0000-0000-0000000093f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d quedó quién confirmó', 'true', pg_temp.valor($q$
  select (confirmado_por = '00000000-0000-0000-0000-0000000093a0' and confirmado_en is not null)::text from proyecto_contratos where id = '00000000-0000-0000-0000-0000000093f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e confirmado, no se edita', 'contiene: un cambio es un otrosí', pg_temp.intentar($q$
  update proyecto_contratos set valor_total = 1 where id = '00000000-0000-0000-0000-0000000093f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f la vista vigente lo trae', '16970535.00', pg_temp.valor($q$
  select valor_total::text from v_proyecto_contrato_vigente where proyecto_id = '00000000-0000-0000-0000-0000000093e0'$q$);

-- ============================================================ 3) otrosí
select pg_temp.como('00000000-0000-0000-0000-0000000093b0');
insert into resultado (prueba, esperado, resultado)
select '3a Q carga el otrosí', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into proyecto_contratos (id, proyecto_id, documento_id, reemplaza_id, numero, objeto, alcance, valor_total,
                                  plazo_cantidad, plazo_unidad, plazo_inicia, forma_pago)
  values ('00000000-0000-0000-0000-0000000093f2', '00000000-0000-0000-0000-0000000093e0', '00000000-0000-0000-0000-0000000093d1',
          '00000000-0000-0000-0000-0000000093f1', 'CSE-93 otrosí 1', 'Mantenimiento de puertas vehiculares',
          'Desmonte, cambio de rodamientos, puesta en marcha y motor adicional', 18000000, 15, 'dias_habiles', 'acta_inicio',
          '[{"concepto": "Anticipo", "porcentaje": 50}, {"concepto": "Entrega", "porcentaje": 50}]')$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000093a0');
insert into resultado (prueba, esperado, resultado)
select '3b P confirma el otrosí', 'aceptado (1 filas)', pg_temp.intentar($q$
  update proyecto_contratos set estado = 'confirmado' where id = '00000000-0000-0000-0000-0000000093f2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3c el anterior quedó reemplazado y el vigente es el otrosí', 'reemplazado / 18000000.00', pg_temp.valor($q$
  select (select estado from proyecto_contratos where id = '00000000-0000-0000-0000-0000000093f1') || ' / ' ||
         (select valor_total::text from v_proyecto_contrato_vigente where proyecto_id = '00000000-0000-0000-0000-0000000093e0')$q$);
insert into resultado (prueba, esperado, resultado)
select '3d un reemplazado no se toca', 'contiene: fue reemplazado', pg_temp.intentar($q$
  update proyecto_contratos set estado = 'confirmado' where id = '00000000-0000-0000-0000-0000000093f1'$q$);
insert into resultado (prueba, esperado, resultado)
select '3e un contrato no se borra', 'contiene: permission denied', pg_temp.intentar($q$
  delete from proyecto_contratos where id = '00000000-0000-0000-0000-0000000093f2'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000093c0');
insert into resultado (prueba, esperado, resultado)
select '3f el técnico no ve contratos', '0', pg_temp.valor($q$select count(*)::text from proyecto_contratos$q$);

-- ============================================================ 4) estructura
reset role;
insert into resultado (prueba, esperado, resultado)
select '4a funciones del contrato ejecutables por anon', '0', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_contrato_confirma', 'fn_contrato_documento_tipo', 'fn_proyecto_contratos_reglas')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- ============================================================ limpieza (admin)
delete from proyecto_contratos where proyecto_id = '00000000-0000-0000-0000-0000000093e0' and reemplaza_id is not null;
delete from proyecto_contratos where proyecto_id = '00000000-0000-0000-0000-0000000093e0';
delete from proyecto_documentos where proyecto_id = '00000000-0000-0000-0000-0000000093e0';
delete from proyectos where id = '00000000-0000-0000-0000-0000000093e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000093_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__Proy resp 93__', '__Proy trab 93__'));
delete from roles where nombre in ('__Proy resp 93__', '__Proy trab 93__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000093_0';

select prueba, esperado, resultado,
  case
    when esperado = 'RECHAZADO' and resultado like 'RECHAZADO%' then 'OK'
    when esperado like 'contiene: %' and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

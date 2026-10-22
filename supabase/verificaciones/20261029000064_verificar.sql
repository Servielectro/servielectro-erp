-- Verificación de la migración 64 (RRHH, primera vuelta). Requiere la 63 (Proyectos). Correr DESPUÉS de la migración,
-- todo junto. Crea personas, un proyecto y una visita de prueba, y BORRA todo antes de mostrar
-- el resultado. No toca datos reales: J (Jhojan) solo actúa como aprobador y Operativo.
--
-- Personas: J = Jhojan (aprobador). A y B = técnicos de prueba (rol Técnicos). R = RRHH de
-- prueba (rol con RRHH "trabajar", como tendrá Alejandra). C = un rol con RRHH "consultar"
-- solamente: el chuleo accidental que no puede abrir lo ajeno.
-- No crea archivos en el almacenamiento: prueba las funciones que deciden quién lee y sube.
-- Resultado esperado: todas las filas en "OK".

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

-- ============================================================ datos de prueba (admin)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000063a0', 'authenticated', 'authenticated', 'tecnico.a.63@invalid.local'),
  ('00000000-0000-0000-0000-0000000063b0', 'authenticated', 'authenticated', 'tecnico.b.63@invalid.local'),
  ('00000000-0000-0000-0000-0000000063c0', 'authenticated', 'authenticated', 'consulta.63@invalid.local'),
  ('00000000-0000-0000-0000-0000000063d0', 'authenticated', 'authenticated', 'rrhh.63@invalid.local')
on conflict (id) do nothing;
insert into roles (nombre) values ('__RRHH prueba 64__'), ('__consulta prueba 64__') on conflict (nombre) do nothing;
insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'rrhh', case r.nombre when '__RRHH prueba 64__' then 'trabajar' else 'consultar' end::nivel_permiso, false
from roles r where r.nombre in ('__RRHH prueba 64__', '__consulta prueba 64__')
on conflict (rol_id, modulo_id) do nothing;
insert into perfiles (id, rol_id, nombre)
select v.id::uuid, r.id, v.nombre
from (values
  ('00000000-0000-0000-0000-0000000063a0', 'Técnicos', '__Técnico A 64__'),
  ('00000000-0000-0000-0000-0000000063b0', 'Técnicos', '__Técnico B 64__'),
  ('00000000-0000-0000-0000-0000000063c0', '__consulta prueba 64__', '__Consulta 64__'),
  ('00000000-0000-0000-0000-0000000063d0', '__RRHH prueba 64__', '__RRHH 64__')
) v(id, rol, nombre)
join roles r on r.nombre = v.rol
on conflict (id) do update set rol_id = excluded.rol_id;

-- Proyecto P, con la visita de A (firmada por el cliente para probar el candado).
insert into clientes (id, nombre) values ('00000000-0000-0000-0000-0000000063e0', 'PRUEBA MIGRACION 64 (se borra)');
insert into cotizaciones (id, codigo, anio, cliente_id, descripcion, estado)
values ('00000000-0000-0000-0000-0000000063e1', 'PRUEBA-64', 2026, '00000000-0000-0000-0000-0000000063e0', 'prueba 64', 'APROBADA');
insert into proyectos (id, codigo, nombre, cliente_id, cotizacion_aprobada_id)
values ('00000000-0000-0000-0000-0000000063e2', 'PRUEBA-64', '__Proyecto prueba 64__',
        '00000000-0000-0000-0000-0000000063e0', '00000000-0000-0000-0000-0000000063e1');
insert into visitas (id, titulo, tipo, estado, tecnico_id, fecha_programada, proyecto_id, creada_por) values
  ('00000000-0000-0000-0000-0000000063f0', '__visita A prueba 64__', 'obra', 'en_curso',
   '00000000-0000-0000-0000-0000000063a0', current_date, '00000000-0000-0000-0000-0000000063e2',
   '696d9431-5c4d-4043-aee4-3e4597094f26'),
  ('00000000-0000-0000-0000-0000000063f1', '__visita firmada prueba 64__', 'visita', 'en_curso',
   '00000000-0000-0000-0000-0000000063a0', current_date, null, '696d9431-5c4d-4043-aee4-3e4597094f26');
insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
values ('00000000-0000-0000-0000-0000000063f1', 'tecnico', 'T', '1', '00000000-0000-0000-0000-0000000063f1/firma-tecnico.png');
insert into visita_firmas (visita_id, tipo, nombre, cedula, imagen_path)
values ('00000000-0000-0000-0000-0000000063f1', 'cliente', 'C', '2', '00000000-0000-0000-0000-0000000063f1/firma-cliente.png');

-- Registros de A (como A, para que pasen por las reglas).
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000063a0');
insert into gastos (id, tipo, categoria_costo, monto, descripcion, pagado_con, proyecto_id)
values ('00000000-0000-0000-0000-0000000063a1', 'compra', 'MATERIAL', 85000, 'Cable 12 AWG', 'propio',
        '00000000-0000-0000-0000-0000000063e2');
insert into permisos_laborales (id, tipo, desde, hasta, motivo, compensacion_propuesta)
values ('00000000-0000-0000-0000-0000000063a2', 'asunto_personal', current_date + 3, current_date + 3, 'Diligencia', 'sin_goce');
insert into abonos (id, monto, motivo) values ('00000000-0000-0000-0000-0000000063a3', 200000, 'Arriendo');

-- ============================================================ 1) proyectos del técnico
insert into resultado (prueba, esperado, resultado)
select '1a A ve el proyecto de su visita (solo id, código y nombre)', '__Proyecto prueba 64__',
  pg_temp.valor($q$select string_agg(nombre, ',') from fn_proyectos_del_tecnico()$q$);
insert into resultado (prueba, esperado, resultado)
select '1b A no lee la tabla proyectos (Comercial)', '0',
  pg_temp.valor($q$select count(*)::text from proyectos$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063b0');
insert into resultado (prueba, esperado, resultado)
select '1c B, sin asignación, no ve ningún proyecto', '0',
  pg_temp.valor($q$select count(*)::text from fn_proyectos_del_tecnico()$q$);
insert into resultado (prueba, esperado, resultado)
select '1d B carga un gasto al proyecto de A', 'contiene: no está entre los tuyos', pg_temp.intentar($q$
  insert into gastos (tipo, categoria_costo, monto, descripcion, pagado_con, proyecto_id)
  values ('compra', 'MATERIAL', 1000, 'x', 'empresa', '00000000-0000-0000-0000-0000000063e2')$q$);
insert into resultado (prueba, esperado, resultado)
select '1e B guarda un gasto SIN proyecto (caso normal)', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into gastos (id, tipo, categoria_costo, monto, descripcion, pagado_con, origen, destino)
  values ('00000000-0000-0000-0000-0000000063b1', 'transporte', 'TRANSPORTE', 18000, 'Taxi con herramienta', 'propio',
          'Bodega', 'Obra')$q$);
insert into resultado (prueba, esperado, resultado)
select '1f transporte con categoría de material', 'contiene: gastos_tipo_y_categoria', pg_temp.intentar($q$
  insert into gastos (tipo, categoria_costo, monto, descripcion, pagado_con)
  values ('transporte', 'MATERIAL', 1000, 'x', 'empresa')$q$);
insert into resultado (prueba, esperado, resultado)
select '1g gasto con fecha futura', 'contiene: no puede ser futura', pg_temp.intentar($q$
  insert into gastos (tipo, categoria_costo, monto, descripcion, pagado_con, fecha)
  values ('compra', 'OTRO', 1000, 'x', 'empresa', current_date + 5)$q$);

-- ============================================================ 2) B intenta lo de A
insert into resultado (prueba, esperado, resultado)
select '2a B lee el GASTO de A', '0',
  pg_temp.valor($q$select count(*)::text from gastos where persona_id = '00000000-0000-0000-0000-0000000063a0'$q$);
insert into resultado (prueba, esperado, resultado)
select '2b B lee el PERMISO de A', '0',
  pg_temp.valor($q$select count(*)::text from permisos_laborales where persona_id = '00000000-0000-0000-0000-0000000063a0'$q$);
insert into resultado (prueba, esperado, resultado)
select '2c B lee el ABONO de A', '0',
  pg_temp.valor($q$select count(*)::text from abonos where persona_id = '00000000-0000-0000-0000-0000000063a0'$q$);
insert into resultado (prueba, esperado, resultado)
select '2d B edita el gasto de A', 'aceptado (0 filas)', pg_temp.intentar($q$
  update gastos set monto = 1 where id = '00000000-0000-0000-0000-0000000063a1'$q$);
insert into resultado (prueba, esperado, resultado)
select '2e B anula el permiso de A', 'aceptado (0 filas)', pg_temp.intentar($q$
  update permisos_laborales set estado = 'anulado' where id = '00000000-0000-0000-0000-0000000063a2'$q$);
insert into resultado (prueba, esperado, resultado)
select '2f B edita el abono de A', 'aceptado (0 filas)', pg_temp.intentar($q$
  update abonos set monto = 1 where id = '00000000-0000-0000-0000-0000000063a3'$q$);
insert into resultado (prueba, esperado, resultado)
select '2g B adjunta una factura al gasto de A', 'contiene: row-level security', pg_temp.intentar($q$
  insert into gasto_soportes (gasto_id, storage_path)
  values ('00000000-0000-0000-0000-0000000063a1', 'gastos/00000000-0000-0000-0000-0000000063a1/x.jpg')$q$);
insert into resultado (prueba, esperado, resultado)
select '2h B registra un gasto a nombre de A', 'contiene: a nombre propio', pg_temp.intentar($q$
  insert into gastos (persona_id, tipo, categoria_costo, monto, descripcion, pagado_con)
  values ('00000000-0000-0000-0000-0000000063a0', 'compra', 'OTRO', 1000, 'x', 'empresa')$q$);
insert into resultado (prueba, esperado, resultado)
select '2i B abre (Storage) la factura y el pantallazo de A', 'false',
  (fn_rrhh_soporte_visible('gastos/00000000-0000-0000-0000-0000000063a1/f.jpg')
   or fn_rrhh_soporte_visible('abonos/00000000-0000-0000-0000-0000000063a3/p.jpg'))::text;
insert into resultado (prueba, esperado, resultado)
select '2j B sube un archivo en la carpeta del gasto o del abono de A', 'false',
  (fn_rrhh_soporte_subible('gastos/00000000-0000-0000-0000-0000000063a1/f.jpg')
   or fn_rrhh_soporte_subible('abonos/00000000-0000-0000-0000-0000000063a3/p.jpg'))::text;
insert into resultado (prueba, esperado, resultado)
select '2k B aprueba el abono de A', 'aceptado (0 filas)', pg_temp.intentar($q$
  update abonos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000063a3'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063c0');
insert into resultado (prueba, esperado, resultado)
select '2l rol con RRHH "consultar" (chuleo accidental) lee gastos, permisos y abonos ajenos', '0',
  pg_temp.valor($q$select ((select count(*) from gastos) + (select count(*) from permisos_laborales)
                         + (select count(*) from abonos))::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063a0');
insert into resultado (prueba, esperado, resultado)
select '2m A sí ve lo suyo (gasto, permiso, abono)', '3',
  pg_temp.valor($q$select ((select count(*) from gastos) + (select count(*) from permisos_laborales)
                         + (select count(*) from abonos))::text$q$);

-- ============================================================ 3) permisos
insert into resultado (prueba, esperado, resultado)
select '3a CITA MÉDICA para hoy', 'contiene: Para hoy solo se puede pedir calamidad', pg_temp.intentar($q$
  insert into permisos_laborales (tipo, desde, hasta, motivo) values ('cita_medica', current_date, current_date, 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '3b asunto personal para hoy', 'contiene: Para hoy solo se puede pedir calamidad', pg_temp.intentar($q$
  insert into permisos_laborales (tipo, desde, hasta, motivo) values ('asunto_personal', current_date, current_date, 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '3c CALAMIDAD DOMÉSTICA para hoy', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into permisos_laborales (id, tipo, desde, hasta, motivo, compensacion_propuesta)
  values ('00000000-0000-0000-0000-0000000063a4', 'calamidad_domestica', current_date, current_date, 'Accidente de mi hijo', 'con_goce')$q$);
insert into resultado (prueba, esperado, resultado)
select '3d calamidad de AYER (Jhojan: solo el mismo día)', 'contiene: no para días anteriores', pg_temp.intentar($q$
  insert into permisos_laborales (tipo, desde, hasta, motivo) values ('calamidad_domestica', current_date - 1, current_date, 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '3e la pantalla puede pedir el motivo del bloqueo (cita médica hoy)', 'Para hoy solo se puede pedir calamidad doméstica (accidente propio o de un familiar). Los demás permisos, desde mañana.',
  pg_temp.valor($q$select fn_permiso_fecha_bloqueada('cita_medica', current_date)$q$);
insert into resultado (prueba, esperado, resultado)
select '3f medio día sin horas', 'contiene: permisos_horas', pg_temp.intentar($q$
  insert into permisos_laborales (tipo, desde, hasta, motivo) values ('medio_dia', current_date + 1, current_date + 1, 'x')$q$);
insert into resultado (prueba, esperado, resultado)
select '3g A aprueba su propio permiso', 'contiene: Solo el aprobador', pg_temp.intentar($q$
  update permisos_laborales set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000063a2'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063d0');
insert into resultado (prueba, esperado, resultado)
select '3h RRHH (no aprobador) aprueba un permiso', 'contiene: Solo el aprobador', pg_temp.intentar($q$
  update permisos_laborales set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000063a2'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '3i J aprueba: la compensación queda la propuesta si no la cambia', 'sin_goce',
  pg_temp.valor($q$with u as (update permisos_laborales set estado = 'aprobado'
                  where id = '00000000-0000-0000-0000-0000000063a2' returning compensacion) select compensacion from u$q$);
insert into resultado (prueba, esperado, resultado)
select '3j J aprueba la calamidad cambiando la compensación', 'reposicion',
  pg_temp.valor($q$with u as (update permisos_laborales set estado = 'aprobado', compensacion = 'reposicion'
                  where id = '00000000-0000-0000-0000-0000000063a4' returning compensacion) select compensacion from u$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063a0');
insert into resultado (prueba, esperado, resultado)
select '3k A cambia la fecha de un permiso ya aprobado', 'contiene: mientras no esté decidido', pg_temp.intentar($q$
  update permisos_laborales set desde = current_date + 4, hasta = current_date + 4 where id = '00000000-0000-0000-0000-0000000063a2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3l A se marca el permiso como gozado', 'contiene: lo marca RRHH', pg_temp.intentar($q$
  update permisos_laborales set estado = 'gozado' where id = '00000000-0000-0000-0000-0000000063a4'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063d0');
insert into resultado (prueba, esperado, resultado)
select '3m RRHH marca gozado un permiso que no ha empezado', 'contiene: Todavía no empieza', pg_temp.intentar($q$
  update permisos_laborales set estado = 'gozado' where id = '00000000-0000-0000-0000-0000000063a2'$q$);
insert into resultado (prueba, esperado, resultado)
select '3n RRHH marca gozada la calamidad de hoy', 'aceptado (1 filas)', pg_temp.intentar($q$
  update permisos_laborales set estado = 'gozado' where id = '00000000-0000-0000-0000-0000000063a4'$q$);
insert into resultado (prueba, esperado, resultado)
select '3o RRHH ve los permisos de todos (filtra por técnico)', '2',
  pg_temp.valor($q$select count(*)::text from permisos_laborales where persona_id = '00000000-0000-0000-0000-0000000063a0'$q$);

-- ============================================================ 4) abonos
insert into resultado (prueba, esperado, resultado)
select '4a RRHH ve el abono pero no lo modifica', '1 / aceptado (0 filas)',
  pg_temp.valor($q$select count(*)::text from abonos where id = '00000000-0000-0000-0000-0000000063a3'$q$) || ' / ' ||
  pg_temp.intentar($q$update abonos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000063a3'$q$);
select pg_temp.como('696d9431-5c4d-4043-aee4-3e4597094f26');
insert into resultado (prueba, esperado, resultado)
select '4b J puede subir el pantallazo del abono de A (antes del desembolso)', 'true',
  fn_rrhh_soporte_subible('abonos/00000000-0000-0000-0000-0000000063a3/pantallazo.jpg')::text;
insert into resultado (prueba, esperado, resultado)
select '4c desembolsar sin pantallazo', 'contiene: sube el pantallazo', pg_temp.intentar($q$
  update abonos set estado = 'desembolsado', fecha_desembolso = current_date where id = '00000000-0000-0000-0000-0000000063a3'$q$);
insert into resultado (prueba, esperado, resultado)
select '4d pantallazo de la carpeta de otro abono', 'contiene: no corresponde a este abono', pg_temp.intentar($q$
  update abonos set estado = 'desembolsado', fecha_desembolso = current_date,
    pantallazo_path = 'abonos/00000000-0000-0000-0000-000000000000/p.jpg' where id = '00000000-0000-0000-0000-0000000063a3'$q$);
insert into resultado (prueba, esperado, resultado)
select '4e aprobar y desembolsar en un paso', 'desembolsado / J',
  pg_temp.valor($q$with u as (update abonos set estado = 'desembolsado', fecha_desembolso = current_date,
                    pantallazo_path = 'abonos/00000000-0000-0000-0000-0000000063a3/pantallazo.jpg'
                  where id = '00000000-0000-0000-0000-0000000063a3' returning estado, decidido_por)
                  select estado || ' / ' || case when decidido_por = '696d9431-5c4d-4043-aee4-3e4597094f26' then 'J' else '?' end from u$q$);
insert into resultado (prueba, esperado, resultado)
select '4f cambiar el pantallazo ya desembolsado', 'contiene: ya se desembolsó', pg_temp.intentar($q$
  update abonos set pantallazo_path = 'abonos/00000000-0000-0000-0000-0000000063a3/otro.jpg' where id = '00000000-0000-0000-0000-0000000063a3'$q$);
insert into resultado (prueba, esperado, resultado)
select '4g ya desembolsado: no se sube otro archivo a su carpeta', 'false',
  fn_rrhh_soporte_subible('abonos/00000000-0000-0000-0000-0000000063a3/otro.jpg')::text;
insert into abonos (id, monto, motivo) values ('00000000-0000-0000-0000-0000000063a5', 1000, 'prueba');
insert into resultado (prueba, esperado, resultado)
select '4h J pide un abono y se lo aprueba', 'contiene: Nadie aprueba su propio abono', pg_temp.intentar($q$
  update abonos set estado = 'aprobado' where id = '00000000-0000-0000-0000-0000000063a5'$q$);
reset role;
insert into resultado (prueba, esperado, resultado)
select '4i ni el administrador por SQL cambia un abono desembolsado', 'contiene: ya se desembolsó', pg_temp.intentar($q$
  update abonos set monto = 1 where id = '00000000-0000-0000-0000-0000000063a3'$q$);
insert into resultado (prueba, esperado, resultado)
select '4j quincena del descuento: desembolso el 15 / el 16 / el 31', '2026-10-01 / 2026-10-16 / 2026-10-16',
  pg_temp.valor($q$
    with d(f) as (values (date '2026-10-15'), (date '2026-10-16'), (date '2026-10-31'))
    select string_agg(make_date(extract(year from f)::int, extract(month from f)::int,
                       case when extract(day from f) <= 15 then 1 else 16 end)::text, ' / ' order by f) from d$q$);
insert into resultado (prueba, esperado, resultado)
select '4k la columna quincena_descuento del abono real', 'true',
  pg_temp.valor($q$select (quincena_descuento = make_date(extract(year from current_date)::int, extract(month from current_date)::int,
                           case when extract(day from current_date) <= 15 then 1 else 16 end))::text
                  from abonos where id = '00000000-0000-0000-0000-0000000063a3'$q$);

-- ============================================================ 5) gastos: lo que hace RRHH
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000063d0');
insert into resultado (prueba, esperado, resultado)
select '5a RRHH asigna el proyecto al gasto "sin proyecto" de B (queda quién)', 'R',
  pg_temp.valor($q$with u as (update gastos set proyecto_id = '00000000-0000-0000-0000-0000000063e2'
                  where id = '00000000-0000-0000-0000-0000000063b1' returning proyecto_asignado_por)
                  select case when proyecto_asignado_por = '00000000-0000-0000-0000-0000000063d0' then 'R' else '?' end from u$q$);
insert into resultado (prueba, esperado, resultado)
select '5b RRHH cambia el monto', 'contiene: Solo quien registró el gasto', pg_temp.intentar($q$
  update gastos set monto = 1 where id = '00000000-0000-0000-0000-0000000063b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '5c RRHH observa sin decir qué corregir', 'contiene: Escribe qué hay que corregir', pg_temp.intentar($q$
  update gastos set estado = 'observado' where id = '00000000-0000-0000-0000-0000000063b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '5d RRHH observa con motivo', 'aceptado (1 filas)', pg_temp.intentar($q$
  update gastos set estado = 'observado', observacion = 'Falta la foto del recibo' where id = '00000000-0000-0000-0000-0000000063b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '5e RRHH lista proyectos y personas para asignar y filtrar', 'true',
  pg_temp.valor($q$select ((select count(*) from fn_proyectos_nombres() where id = '00000000-0000-0000-0000-0000000063e2') = 1
                          and (select count(*) from fn_personas_rrhh() where id = '00000000-0000-0000-0000-0000000063a0') = 1)::text$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063b0');
insert into resultado (prueba, esperado, resultado)
select '5f B corrige el gasto observado: vuelve a registrado y la observación queda', 'registrado / Falta la foto del recibo',
  pg_temp.valor($q$with u as (update gastos set monto = 19000 where id = '00000000-0000-0000-0000-0000000063b1' returning estado, observacion)
                  select estado || ' / ' || observacion from u$q$);
insert into resultado (prueba, esperado, resultado)
select '5g B se marca el reembolso', 'contiene: lo marca RRHH', pg_temp.intentar($q$
  update gastos set reembolsado_quincena = current_date where id = '00000000-0000-0000-0000-0000000063b1'$q$);
insert into resultado (prueba, esperado, resultado)
select '5h B adjunta la foto a su propio gasto', 'aceptado (1 filas) / true',
  pg_temp.intentar($q$insert into gasto_soportes (gasto_id, storage_path)
                      values ('00000000-0000-0000-0000-0000000063b1', 'gastos/00000000-0000-0000-0000-0000000063b1/recibo.jpg')$q$)
  || ' / ' || fn_rrhh_soporte_subible('gastos/00000000-0000-0000-0000-0000000063b1/recibo.jpg')::text;
insert into resultado (prueba, esperado, resultado)
select '5i la foto no se cambia ni se borra', 'aceptado (0 filas) / aceptado (0 filas)',
  pg_temp.intentar($q$update gasto_soportes set storage_path = 'gastos/x/y.jpg' where gasto_id = '00000000-0000-0000-0000-0000000063b1'$q$)
  || ' / ' || pg_temp.intentar($q$delete from gasto_soportes where gasto_id = '00000000-0000-0000-0000-0000000063b1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063d0');
insert into resultado (prueba, esperado, resultado)
select '5j RRHH marca el reembolso del gasto de bolsillo (columna lista, pantalla después)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update gastos set reembolsado_quincena = current_date where id = '00000000-0000-0000-0000-0000000063b1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063b0');
insert into resultado (prueba, esperado, resultado)
select '5k reembolsado: B ya no lo edita', 'contiene: anulado o reembolsado', pg_temp.intentar($q$
  update gastos set descripcion = 'otra' where id = '00000000-0000-0000-0000-0000000063b1'$q$);

-- ============================================================ 7) certificados emitidos
select pg_temp.como('00000000-0000-0000-0000-0000000063d0');
insert into resultado (prueba, esperado, resultado)
select '7a RRHH registra un certificado emitido', 'aceptado (1 filas)', pg_temp.intentar($q$
  insert into certificados_emitidos (id, persona_id, dirigido_a, datos)
  values ('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063a0', 'A quien interese', '{"cargo":"Técnico"}')$q$);
insert into resultado (prueba, esperado, resultado)
select '7b el registro no se modifica (no hay política de update: 0 filas)', 'aceptado (0 filas)', pg_temp.intentar($q$
  update certificados_emitidos set dirigido_a = 'otro' where id = '00000000-0000-0000-0000-0000000063c1'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063a0');
insert into resultado (prueba, esperado, resultado)
select '7c el técnico no lee el registro (todavía no se muestra)', '0',
  pg_temp.valor($q$select count(*)::text from certificados_emitidos$q$);

-- ============================================================ 9) documentos con destinatario (desprendibles)
-- "Que no se vea el uno con el otro, sino que únicamente los vea el técnico al que le pertenezca."
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000063d0');
insert into resultado (prueba, esperado, resultado)
select '9a RRHH sube el desprendible de A (pide firma) y el de B', 'aceptado (2 filas)', pg_temp.intentar($q$
  insert into documentos_personal (id, persona_id, tipo, titulo, periodo_inicio, periodo_fin, storage_path, requiere_firma) values
    ('00000000-0000-0000-0000-0000000063da', '00000000-0000-0000-0000-0000000063a0', 'desprendible', 'Desprendible 1a quincena', current_date - 20, current_date - 6,
     'documentos/00000000-0000-0000-0000-0000000063a0/desprendible.pdf', true),
    ('00000000-0000-0000-0000-0000000063db', '00000000-0000-0000-0000-0000000063b0', 'desprendible', 'Desprendible 1a quincena', current_date - 20, current_date - 6,
     'documentos/00000000-0000-0000-0000-0000000063b0/desprendible.pdf', false)$q$);
insert into resultado (prueba, esperado, resultado)
select '9b RRHH sube un documento para A con el archivo en la carpeta de B', 'contiene: documentos_ruta', pg_temp.intentar($q$
  insert into documentos_personal (persona_id, tipo, titulo, storage_path)
  values ('00000000-0000-0000-0000-0000000063a0', 'otro', 'x', 'documentos/00000000-0000-0000-0000-0000000063b0/otro.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '9c RRHH puede subir archivos a la carpeta de una persona', 'true',
  fn_rrhh_soporte_subible('documentos/00000000-0000-0000-0000-0000000063a0/desprendible.pdf')::text;

select pg_temp.como('00000000-0000-0000-0000-0000000063b0');
insert into resultado (prueba, esperado, resultado)
select '9d B LEE el documento de A', '0',
  pg_temp.valor($q$select count(*)::text from documentos_personal where persona_id = '00000000-0000-0000-0000-0000000063a0'$q$);
insert into resultado (prueba, esperado, resultado)
select '9e B ABRE el archivo de A en Storage', 'false',
  fn_rrhh_soporte_visible('documentos/00000000-0000-0000-0000-0000000063a0/desprendible.pdf')::text;
insert into resultado (prueba, esperado, resultado)
select '9f B sube un archivo o una firma a la carpeta de A', 'false',
  (fn_rrhh_soporte_subible('documentos/00000000-0000-0000-0000-0000000063a0/x.pdf')
   or fn_rrhh_soporte_subible('documentos/00000000-0000-0000-0000-0000000063a0/firmas/00000000-0000-0000-0000-0000000063da.png')
   or fn_rrhh_soporte_subible('documentos/00000000-0000-0000-0000-0000000063b0/firmas/00000000-0000-0000-0000-0000000063da.png'))::text;
insert into resultado (prueba, esperado, resultado)
select '9g B marca visto o firma el documento de A', 'aceptado (0 filas)', pg_temp.intentar($q$
  update documentos_personal set visto_en = now(), firma_path = 'documentos/00000000-0000-0000-0000-0000000063b0/firmas/00000000-0000-0000-0000-0000000063da.png' where id = '00000000-0000-0000-0000-0000000063da'$q$);
insert into resultado (prueba, esperado, resultado)
select '9h B se crea un documento', 'contiene: row-level security', pg_temp.intentar($q$
  insert into documentos_personal (persona_id, tipo, titulo, storage_path) values ('00000000-0000-0000-0000-0000000063b0', 'otro', 'x', 'documentos/00000000-0000-0000-0000-0000000063b0/y.pdf')$q$);
insert into resultado (prueba, esperado, resultado)
select '9i B ve el suyo y lo abre', '1 / true',
  pg_temp.valor($q$select count(*)::text from documentos_personal$q$) || ' / ' ||
  fn_rrhh_soporte_visible('documentos/00000000-0000-0000-0000-0000000063b0/desprendible.pdf')::text;
insert into resultado (prueba, esperado, resultado)
select '9j B firma un documento que no pide firma', 'contiene: no pide firma', pg_temp.intentar($q$
  update documentos_personal set firma_path = 'documentos/00000000-0000-0000-0000-0000000063b0/firmas/00000000-0000-0000-0000-0000000063db.png' where id = '00000000-0000-0000-0000-0000000063db'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000063c0');
insert into resultado (prueba, esperado, resultado)
select '9k rol con RRHH "consultar" (chuleo) lee documentos ajenos', '0',
  pg_temp.valor($q$select count(*)::text from documentos_personal$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000063a0');
insert into resultado (prueba, esperado, resultado)
select '9l A marca su documento como visto (una vez)', 'aceptado (1 filas) / contiene: ya estaba marcado',
  pg_temp.intentar($q$update documentos_personal set visto_en = now() where id = '00000000-0000-0000-0000-0000000063da'$q$) || ' / contiene: ' ||
  substring(pg_temp.intentar($q$update documentos_personal set visto_en = now() + interval '1 day' where id = '00000000-0000-0000-0000-0000000063da'$q$) from 'ya estaba marcado');
insert into resultado (prueba, esperado, resultado)
select '9m A sube su firma y firma (una vez)', 'true / aceptado (1 filas)',
  fn_rrhh_soporte_subible('documentos/00000000-0000-0000-0000-0000000063a0/firmas/00000000-0000-0000-0000-0000000063da.png')::text || ' / ' ||
  pg_temp.intentar($q$update documentos_personal set firma_path = 'documentos/00000000-0000-0000-0000-0000000063a0/firmas/00000000-0000-0000-0000-0000000063da.png' where id = '00000000-0000-0000-0000-0000000063da'$q$);
insert into resultado (prueba, esperado, resultado)
select '9n firmado: no se firma otra vez ni se sube otra firma', 'contiene: ya está firmado', pg_temp.intentar($q$
  update documentos_personal set firma_path = 'documentos/00000000-0000-0000-0000-0000000063a0/firmas/00000000-0000-0000-0000-0000000063da.jpg' where id = '00000000-0000-0000-0000-0000000063da'$q$);
insert into resultado (prueba, esperado, resultado)
select '9o A cambia el título o el archivo', 'contiene: no se edita', pg_temp.intentar($q$
  update documentos_personal set storage_path = 'documentos/00000000-0000-0000-0000-0000000063a0/otro.pdf' where id = '00000000-0000-0000-0000-0000000063da'$q$);

select pg_temp.como('00000000-0000-0000-0000-0000000063d0');
insert into resultado (prueba, esperado, resultado)
select '9p RRHH anula sin motivo', 'contiene: Escribe por qué se anula', pg_temp.intentar($q$
  update documentos_personal set anulado_en = now() where id = '00000000-0000-0000-0000-0000000063db'$q$);
insert into resultado (prueba, esperado, resultado)
select '9q RRHH anula el de B con motivo (archivo equivocado)', 'aceptado (1 filas)', pg_temp.intentar($q$
  update documentos_personal set motivo_anulacion = 'Archivo equivocado' where id = '00000000-0000-0000-0000-0000000063db'$q$);
select pg_temp.como('00000000-0000-0000-0000-0000000063b0');
insert into resultado (prueba, esperado, resultado)
select '9r anulado: B ya no lo ve ni lo abre', '0 / false',
  pg_temp.valor($q$select count(*)::text from documentos_personal$q$) || ' / ' ||
  fn_rrhh_soporte_visible('documentos/00000000-0000-0000-0000-0000000063b0/desprendible.pdf')::text;

-- ============================================================ 8) roles y privilegios
reset role;
insert into resultado (prueba, esperado, resultado)
select '8a el rol Técnicos no tiene RRHH "trabajar" ni "responsable"', '0',
  (select count(*)::text from permisos_rol pr join roles r on r.id = pr.rol_id
   where r.nombre = 'Técnicos' and pr.modulo_id = 'rrhh' and pr.nivel in ('trabajar', 'responsable'));
insert into resultado (prueba, esperado, resultado)
select '8b aprobadores: solo Jhojan', '696d9431-5c4d-4043-aee4-3e4597094f26',
  (select string_agg(perfil_id::text, ',') from rrhh_aprobadores);
insert into resultado (prueba, esperado, resultado)
select '8c funciones de RRHH ejecutables por anon', '0',
  coalesce(nullif(string_agg(p.proname::text, ', ' order by p.proname), ''), '0')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_rrhh_ve_todo', 'fn_es_aprobador_rrhh', 'fn_personas_rrhh', 'fn_permiso_fecha_bloqueada',
  'fn_rrhh_id_de_ruta', 'fn_rrhh_documento_de_firma', 'fn_rrhh_soporte_visible', 'fn_rrhh_soporte_subible',
  'fn_gastos_reglas', 'fn_permisos_reglas', 'fn_abonos_reglas', 'fn_certificados_inmutable', 'fn_documentos_reglas')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '8d funciones de trigger ejecutables por authenticated', '0',
  coalesce(nullif(string_agg(p.proname::text, ', ' order by p.proname), ''), '0')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('fn_gastos_reglas', 'fn_permisos_reglas', 'fn_abonos_reglas', 'fn_certificados_inmutable', 'fn_documentos_reglas')
  and has_function_privilege('authenticated', p.oid, 'EXECUTE');
insert into resultado (prueba, esperado, resultado)
select '8e bucket rrhh-soportes privado, sin políticas de update ni delete', 'false / 0',
  (select public::text from storage.buckets where id = 'rrhh-soportes') || ' / ' ||
  (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'rrhh_soportes%' and cmd in ('UPDATE', 'DELETE', 'ALL'));

-- ============================================================ limpieza (admin)
delete from documentos_personal where id::text like '00000000-0000-0000-0000-0000000063d_';
delete from certificados_emitidos where id = '00000000-0000-0000-0000-0000000063c1';
delete from gasto_soportes where gasto_id::text like '00000000-0000-0000-0000-000000006%';
delete from gastos where persona_id::text like '00000000-0000-0000-0000-000000006%';
delete from permisos_laborales where persona_id::text like '00000000-0000-0000-0000-000000006%';
delete from abonos where id::text like '00000000-0000-0000-0000-0000000063%';
delete from visita_firmas where visita_id::text like '00000000-0000-0000-0000-0000000063f%';
delete from visitas where id::text like '00000000-0000-0000-0000-0000000063f%';
delete from proyectos where id = '00000000-0000-0000-0000-0000000063e2';
delete from cotizaciones where id = '00000000-0000-0000-0000-0000000063e1';
delete from clientes where id = '00000000-0000-0000-0000-0000000063e0';
delete from perfiles where id::text like '00000000-0000-0000-0000-0000000063_0';
delete from permisos_rol where rol_id in (select id from roles where nombre in ('__RRHH prueba 64__', '__consulta prueba 64__'));
delete from roles where nombre in ('__RRHH prueba 64__', '__consulta prueba 64__');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000063_0';

select prueba, esperado, resultado,
  case
    when esperado like 'contiene: %' and resultado like 'RECHAZADO%'
         and position(substring(esperado from 11) in resultado) > 0 then 'OK'
    when esperado = resultado then 'OK'
    else 'REVISAR'
  end as estado
from resultado
order by orden;

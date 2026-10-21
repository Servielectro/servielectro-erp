-- Verificación de la migración 57 (IVA FULL sin AIU). Correr DESPUÉS de la migración, todo
-- junto, en el editor SQL. Crea un cliente y dos cotizaciones de prueba con los números de la
-- cotización real de Jhojan (subtotal 1.028.602, A 5 %, I 6 %, U 5 %), más una tercera con
-- A 8 %, I 6 %, U 4 % (distintos entre sí, para que el IVA sobre la utilidad se distinga del
-- IVA sobre la administración), y los BORRA antes
-- de mostrar el resultado: no queda nada guardado ni se mueve el consecutivo (el código de prueba no es CSE-AA-NNN).
-- Resultado esperado: todas las filas en "OK".

begin;

create temporary table resultado (orden serial, prueba text, esperado text, obtenido text) on commit drop;

with cli as (
  insert into public.clientes (nombre) values ('PRUEBA MIGRACION 57 (se borra)') returning id
), cot as (
  insert into public.cotizaciones
  -- Descripción distinta por cotización: (anio, version, cliente_id, descripcion) es única.
    (codigo, anio, cliente_id, descripcion, esquema_iva, pct_admin, pct_imprevistos, pct_utilidad_aiu, factor_recargo_proyecto)
  select v.codigo, 2026, cli.id, 'prueba 57 ' || v.codigo, v.esquema::esquema_iva, v.a, v.i, v.u, 1
  from cli, (values
    ('PRUEBA-57-FULL', 'IVA_FULL', 0.05, 0.06, 0.05),
    ('PRUEBA-57-AIU', 'IVA_AIU', 0.05, 0.06, 0.05),
    -- A, I y U distintos entre sí: con A = U (5 % y 5 %) el IVA sale igual tomando la
    -- administración o la utilidad como base, y la prueba no distingue las dos reglas.
    ('PRUEBA-57-AIU-864', 'IVA_AIU', 0.08, 0.06, 0.04)
  ) v(codigo, esquema, a, i, u)
  returning id
)
insert into public.cotizacion_items
  (cotizacion_id, categoria, descripcion, unidad, cantidad, valor_compra_unitario, factor_rentabilidad_linea)
select cot.id, 'EQUIPO', 'línea de prueba', 'UNI', 1, 1028602, 1 from cot;

insert into resultado (prueba, esperado, obtenido)
select 'IVA FULL: ' || x.p, x.e, x.o
from public.v_cotizacion_totales_iva t,
lateral (values
  ('subtotal', '1028602', round(t.subtotal_calculo)::text),
  ('A + I + U', '0', (t.valor_admin + t.valor_imprevistos + t.valor_utilidad_aiu)::int::text),
  ('IVA', '195434', round(t.valor_iva)::text),
  ('total', '1224036', round(t.total_cotizacion)::text)
) x(p, e, o)
where t.codigo = 'PRUEBA-57-FULL';

insert into resultado (prueba, esperado, obtenido)
select 'AIU: ' || x.p, x.e, x.o
from public.v_cotizacion_totales_iva t,
lateral (values
  ('subtotal', '1028602', round(t.subtotal_calculo)::text),
  ('administración', '51430', round(t.valor_admin)::text),
  ('imprevistos', '61716', round(t.valor_imprevistos)::text),
  ('utilidad', '51430', round(t.valor_utilidad_aiu)::text),
  ('IVA (19 % de la utilidad)', '9772', round(t.valor_iva)::text),
  ('total', '1202950', round(t.total_cotizacion)::text)
) x(p, e, o)
where t.codigo = 'PRUEBA-57-AIU';

-- Subtotal 1.028.602, A 8 %, I 6 %, U 4 %. IVA = 19 % de la UTILIDAD (41.144,08) = 7.817,38.
-- Si la base fuera la administración (82.288,16) daría 15.634,75 y total 1.229.385.
insert into resultado (prueba, esperado, obtenido)
select 'AIU 8/6/4: ' || x.p, x.e, x.o
from public.v_cotizacion_totales_iva t,
lateral (values
  ('administración', '82288', round(t.valor_admin)::text),
  ('imprevistos', '61716', round(t.valor_imprevistos)::text),
  ('utilidad', '41144', round(t.valor_utilidad_aiu)::text),
  ('IVA (19 % de la utilidad, no de la administración)', '7817', round(t.valor_iva)::text),
  ('total', '1221568', round(t.total_cotizacion)::text)
) x(p, e, o)
where t.codigo = 'PRUEBA-57-AIU-864';

insert into resultado (prueba, esperado, obtenido)
select 'v_cotizacion_totales con security_invoker', 'true',
  coalesce((select 'true' from pg_class where oid = 'public.v_cotizacion_totales'::regclass
            and 'security_invoker=true' = any(reloptions)), 'false');

-- Limpieza antes de mostrar el resultado (los ítems se van en cascada).
delete from public.cotizaciones where codigo in ('PRUEBA-57-FULL', 'PRUEBA-57-AIU', 'PRUEBA-57-AIU-864');
delete from public.clientes where nombre = 'PRUEBA MIGRACION 57 (se borra)';

select orden, prueba, esperado, obtenido,
       case when esperado = obtenido then 'OK' else 'FALLA' end as estado
from resultado order by orden;

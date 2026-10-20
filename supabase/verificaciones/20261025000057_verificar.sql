-- Verificación de la migración 57 (IVA FULL sin AIU). Correr DESPUÉS de la migración, todo
-- junto, en el editor SQL. Crea un cliente y dos cotizaciones de prueba con los números de la
-- cotización real de Jhojan (subtotal 1.028.602, A 5 %, I 6 %, U 5 %) y los BORRA antes
-- de mostrar el resultado: no queda nada guardado ni se mueve el consecutivo (el código de prueba no es CSE-AA-NNN).
-- Resultado esperado: todas las filas en "OK".

begin;

create temporary table resultado (orden serial, prueba text, esperado text, obtenido text) on commit drop;

with cli as (
  insert into public.clientes (nombre) values ('PRUEBA MIGRACION 57 (se borra)') returning id
), cot as (
  insert into public.cotizaciones
    (codigo, anio, cliente_id, descripcion, esquema_iva, pct_admin, pct_imprevistos, pct_utilidad_aiu, factor_recargo_proyecto)
  select v.codigo, 2026, cli.id, 'prueba 57', v.esquema::esquema_iva, 0.05, 0.06, 0.05, 1
  from cli, (values ('PRUEBA-57-FULL', 'IVA_FULL'), ('PRUEBA-57-AIU', 'IVA_AIU')) v(codigo, esquema)
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

insert into resultado (prueba, esperado, obtenido)
select 'v_cotizacion_totales con security_invoker', 'true',
  coalesce((select 'true' from pg_class where oid = 'public.v_cotizacion_totales'::regclass
            and 'security_invoker=true' = any(reloptions)), 'false');

-- Limpieza antes de mostrar el resultado (los ítems se van en cascada).
delete from public.cotizaciones where codigo in ('PRUEBA-57-FULL', 'PRUEBA-57-AIU');
delete from public.clientes where nombre = 'PRUEBA MIGRACION 57 (se borra)';

select orden, prueba, esperado, obtenido,
       case when esperado = obtenido then 'OK' else 'FALLA' end as estado
from resultado order by orden;

-- Módulo 1: Proyectos — CORRECCIÓN: v_items_catalogo_con_precio no traía nombre_corto,
-- rompía el buscador de ítems de la cotización con "column ... nombre_corto does not exist".
-- Idempotente: se puede correr más de una vez sin romper.
--
-- Causa (encontrada probando la app contra la base ya migrada, 2026-09-25): la vista se creó
-- en la migración 20260923000002 con `select c.*, ...` sobre items_catalogo. En Postgres,
-- el `*` de una vista se expande a la lista de columnas de la tabla en el momento en que la
-- vista se crea — no se actualiza sola cuando la tabla gana una columna nueva después. La
-- migración 20260924000017 agregó `items_catalogo.nombre_corto` con un ALTER TABLE, pero
-- nadie volvió a recrear esta vista para que su `c.*` la recogiera. Verificado en vivo con
-- un `curl` directo a la vista (publishable key): devolvía 42703 "column ... does not exist".
--
-- Se recrea igual que antes (mismo `c.*`, que ahora sí incluye nombre_corto porque se
-- recrea DESPUÉS del ALTER TABLE) y se le agrega `security_invoker = true` explícito —
-- una vista recreada de cero no hereda esa opción de la versión anterior, hay que
-- repetirla (ver 20260924000016 y la regla fija en docs §12).

drop view if exists v_items_catalogo_con_precio;
create view v_items_catalogo_con_precio
with (security_invoker = true)
as
select
  c.*,
  p.valor_compra_iva,
  p.vigente_desde as precio_vigente_desde,
  p.actualizado_en as precio_actualizado_en,
  round(p.valor_compra_iva / c.factor_rentabilidad_linea, 2) as valor_venta_unitario
from items_catalogo c
left join v_items_precio_actual p on p.item_id = c.id;

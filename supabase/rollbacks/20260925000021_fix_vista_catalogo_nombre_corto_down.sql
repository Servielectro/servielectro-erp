-- Rollback de 20260925000021_fix_vista_catalogo_nombre_corto.sql
-- Vuelve a la forma de la vista tal como quedó en 20260924000016 (con security_invoker,
-- pero sin nombre_corto en el `c.*` porque en ese punto la columna todavía no existía).
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

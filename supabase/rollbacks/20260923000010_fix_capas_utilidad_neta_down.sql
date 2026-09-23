-- Rollback de 20260923000010_fix_capas_utilidad_neta.sql
-- Restaura la versión anterior de v_capas_utilidad (deducciones sobre utilidad_aiu),
-- que se sabe matemáticamente incorrecta contra datos reales — solo para revertir si hace falta.
create or replace view v_capas_utilidad as
select
  c.id as cotizacion_id,
  c.codigo,
  t.subtotal_venta - t.subtotal_compra as capa1_margen_linea,
  t.subtotal_calculo - t.subtotal_venta as capa2_recargo_proyecto,
  t.valor_admin as capa3_admin,
  t.valor_imprevistos as capa4_imprevistos,
  t.valor_utilidad_aiu as capa5_utilidad_aiu_bruta,
  round(t.valor_utilidad_aiu * c.pct_admin_gasto_interno, 2) as deduccion_admin_interno,
  round(t.valor_utilidad_aiu * c.pct_renta, 2) as deduccion_renta,
  round(t.valor_utilidad_aiu * (c.ica_por_mil / 1000.0), 2) as deduccion_ica,
  round(t.valor_utilidad_aiu * c.pct_comision_comercial, 2) as deduccion_comision_comercial,
  round(
    t.valor_utilidad_aiu
    - (t.valor_utilidad_aiu * c.pct_admin_gasto_interno)
    - (t.valor_utilidad_aiu * c.pct_renta)
    - (t.valor_utilidad_aiu * (c.ica_por_mil / 1000.0))
    - (t.valor_utilidad_aiu * c.pct_comision_comercial)
  , 2) as capa5_utilidad_aiu_neta,
  t.subtotal_general,
  round(
    ((t.subtotal_venta - t.subtotal_compra) + (t.subtotal_calculo - t.subtotal_venta)
      + t.valor_admin + t.valor_imprevistos
      + (t.valor_utilidad_aiu
          - (t.valor_utilidad_aiu * c.pct_admin_gasto_interno)
          - (t.valor_utilidad_aiu * c.pct_renta)
          - (t.valor_utilidad_aiu * (c.ica_por_mil / 1000.0))
          - (t.valor_utilidad_aiu * c.pct_comision_comercial))
    ) / nullif(t.subtotal_general, 0) * 100
  , 2) as pct_utilidad_neta_sobre_venta
from cotizaciones c
join v_cotizacion_totales t on t.cotizacion_id = c.id;

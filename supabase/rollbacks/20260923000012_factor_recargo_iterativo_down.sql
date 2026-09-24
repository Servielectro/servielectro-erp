-- Rollback de 20260923000012_factor_recargo_iterativo.sql
-- Vuelve v_capas_utilidad a la versión con los campos en null (20260923000010)
create or replace view v_capas_utilidad as
select
  c.id as cotizacion_id,
  c.codigo,
  t.subtotal_venta - t.subtotal_compra as capa1_margen_linea,
  t.subtotal_calculo - t.subtotal_venta as capa2_recargo_proyecto,
  t.valor_admin as capa3_admin,
  t.valor_imprevistos as capa4_imprevistos,
  t.valor_utilidad_aiu as capa5_utilidad_aiu_bruta,
  null::numeric as deduccion_admin_interno,
  null::numeric as deduccion_renta,
  null::numeric as deduccion_ica,
  null::numeric as deduccion_comision_comercial,
  null::numeric as capa5_utilidad_aiu_neta,
  t.subtotal_general,
  null::numeric as pct_utilidad_neta_sobre_venta,
  'PENDIENTE: bases de admin/renta/ICA sin confirmar, ver docs §13' as nota_utilidad_neta
from cotizaciones c
join v_cotizacion_totales t on t.cotizacion_id = c.id;

drop function if exists fn_calcular_factor_recargo(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, esquema_iva
);

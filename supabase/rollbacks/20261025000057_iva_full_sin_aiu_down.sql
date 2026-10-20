-- Rollback de 20261025000057: vuelve v_cotizacion_totales a la versión de la migración 06
-- (AIU sumado siempre; IVA FULL sobre subtotal + AIU). Ojo: esa versión es la que producía
-- el documento híbrido. Solo para deshacer si la 57 rompe algo.

create or replace view public.v_cotizacion_totales
with (security_invoker = true) as
select
  c.id as cotizacion_id,
  c.codigo,
  c.esquema_iva,
  coalesce(sum(ci.valor_compra_unitario * ci.cantidad), 0) as subtotal_compra,
  coalesce(sum(ci.valor_venta_unitario * ci.cantidad), 0) as subtotal_venta,
  coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) as subtotal_calculo,
  round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_admin, 2) as valor_admin,
  round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_imprevistos, 2) as valor_imprevistos,
  round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_utilidad_aiu, 2) as valor_utilidad_aiu,
  coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0)
    + round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_admin, 2)
    + round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_imprevistos, 2)
    + round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_utilidad_aiu, 2)
    as subtotal_general,
  case
    when c.esquema_iva = 'IVA_AIU'
      then 'UTILIDAD_AIU (esquema IVA AIU elegido en la cotización)'
    else 'SUBTOTAL_GENERAL (esquema IVA FULL elegido en la cotización)'
  end as iva_base_motivo,
  case
    when c.esquema_iva = 'IVA_AIU'
      then round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_utilidad_aiu, 2)
    else coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0)
      + round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_admin, 2)
      + round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_imprevistos, 2)
      + round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_utilidad_aiu, 2)
  end as iva_base_valor,
  c.iva_pct
from public.cotizaciones c
left join public.cotizacion_items ci on ci.cotizacion_id = c.id
group by c.id;

alter view public.v_cotizacion_totales set (security_invoker = true);

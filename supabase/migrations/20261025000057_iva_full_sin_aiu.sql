-- Totales de cotización: IVA FULL y AIU son excluyentes.
--
-- Hallazgo del 2026-10-19 (cotización real de Jhojan): con IVA FULL el documento igual
-- sumaba Administración, Imprevistos y Utilidad y además cobraba IVA sobre todo eso. No es
-- ninguno de los dos regímenes. El precio de cada línea ya trae la ganancia; acá solo se suma.
--
--   IVA_FULL: sin AIU (valor 0, no se suma). IVA = iva_pct × subtotal_calculo.
--   IVA_AIU:  A, I y U sobre subtotal_calculo con los % de la cotización.
--             IVA = iva_pct × UTILIDAD, no del subtotal. NO es un error: regla de Jhojan
--             para obra civil, validada con su contador, facturada así desde hace cinco
--             años. No "corregirla".
--
-- Prueba de aceptación (subtotal 1.028.602, A 5 %, I 6 %, U 5 %):
--   IVA_FULL → IVA 195.434, total 1.224.036
--   IVA_AIU  → A 51.430 + I 61.716 + U 51.430, IVA 9.772, total 1.202.950
--
-- Qué NO cambia: fn_calcular_factor_recargo (la cadena de precios) ni las bases de los
-- gastos internos de v_capas_utilidad (admin sobre compra, renta e ICA sobre el bloque
-- venta), que se calculan con los % de la cotización y no con estas columnas.
-- v_cotizacion_totales_iva no se toca: ya suma subtotal_general + iva_base_valor × iva_pct.
--
-- Mismas fórmulas que calcularTotales en src/lib/pricing.ts.
-- Mismas columnas, mismo orden y mismo tipo que la versión de la migración 06: alcanza con
-- create or replace. security_invoker explícito para que no se pierda al reemplazarla.
-- Hoy hay 0 cotizaciones guardadas, así que no cambia ningún total ya emitido.
-- Idempotente.
-- Verificación: supabase/verificaciones/20261025000057_verificar.sql
-- Rollback:     supabase/rollbacks/20261025000057_iva_full_sin_aiu_down.sql

create or replace view public.v_cotizacion_totales
with (security_invoker = true) as
select
  c.id as cotizacion_id,
  c.codigo,
  c.esquema_iva,
  coalesce(sum(ci.valor_compra_unitario * ci.cantidad), 0) as subtotal_compra,
  coalesce(sum(ci.valor_venta_unitario * ci.cantidad), 0) as subtotal_venta,
  coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) as subtotal_calculo,
  case when c.esquema_iva = 'IVA_AIU'
    then round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_admin, 2)
    else 0::numeric
  end as valor_admin,
  case when c.esquema_iva = 'IVA_AIU'
    then round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_imprevistos, 2)
    else 0::numeric
  end as valor_imprevistos,
  case when c.esquema_iva = 'IVA_AIU'
    then round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_utilidad_aiu, 2)
    else 0::numeric
  end as valor_utilidad_aiu,
  -- Suma de partes ya redondeadas, para que el total cuadre con la suma de las líneas.
  coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0)
    + case when c.esquema_iva = 'IVA_AIU'
        then round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_admin, 2)
           + round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_imprevistos, 2)
           + round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_utilidad_aiu, 2)
        else 0::numeric
      end
    as subtotal_general,
  case
    when c.esquema_iva = 'IVA_AIU'
      then 'UTILIDAD_AIU (esquema IVA AIU elegido en la cotización)'
    else 'SUBTOTAL (esquema IVA FULL elegido en la cotización, sin AIU)'
  end as iva_base_motivo,
  case
    when c.esquema_iva = 'IVA_AIU'
      then round(coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0) * c.pct_utilidad_aiu, 2)
    else coalesce(sum(ci.valor_calculo_unitario * ci.cantidad), 0)
  end as iva_base_valor,
  c.iva_pct
from public.cotizaciones c
left join public.cotizacion_items ci on ci.cotizacion_id = c.id
group by c.id;

alter view public.v_cotizacion_totales set (security_invoker = true);

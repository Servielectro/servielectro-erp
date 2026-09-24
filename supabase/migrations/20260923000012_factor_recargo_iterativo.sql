-- Módulo 1: Proyectos — factor_recargo_proyecto calculado por iteración de punto fijo,
-- y v_capas_utilidad con las bases reales de los gastos internos.
-- Idempotente: se puede correr más de una vez sin romper.
--
-- Verificado contra el proyecto real Tintalá (2026-09-23): compra_total=$10.970.200,
-- venta_total=$12.846.434 -> converge a factor=0.8852934706 (real: 0.8852934680),
-- utilidad_total=$5.467.491 (exacto), gastos=$1.946.631 (exacto). Ver
-- docs/ERP-Servielectro-Modulo1-Proyectos.md §13 para el detalle de cada fórmula.

create or replace function fn_calcular_factor_recargo(
  p_compra_total numeric,
  p_venta_total numeric,
  p_pct_admin_aiu numeric,
  p_pct_imprevistos numeric,
  p_pct_utilidad_aiu numeric,
  p_pct_admin_gasto numeric,
  p_pct_renta numeric,
  p_ica_por_mil numeric,
  p_pct_comision numeric,
  p_iva_pct numeric,
  p_esquema_iva esquema_iva
)
returns numeric
language plpgsql
as $$
declare
  v_factor numeric := 1.0;
  v_factor_anterior numeric;
  v_calculo_subtotal numeric;
  v_subtotal_general_calculo numeric;
  v_utilidad_calculo numeric;
  v_iva_calculo numeric;
  v_total_con_iva numeric;
  v_admin_venta numeric;
  v_imprevistos_venta numeric;
  v_utilidad_venta numeric;
  v_subtotal_general_venta numeric;
  v_admin_gasto numeric;
  v_renta_base numeric;
  v_renta_gasto numeric;
  v_ica_gasto numeric;
  v_comision_gasto numeric;
  v_total_gastos numeric;
  v_iteraciones int := 0;
begin
  if p_venta_total is null or p_venta_total = 0 then
    return 1.0;
  end if;

  -- Bloque VENTA (análisis interno, sin el recargo de proyecto) — no depende del factor
  v_admin_venta := p_pct_admin_aiu * p_venta_total;
  v_imprevistos_venta := p_pct_imprevistos * p_venta_total;
  v_utilidad_venta := p_pct_utilidad_aiu * p_venta_total;
  v_subtotal_general_venta := p_venta_total + v_admin_venta + v_imprevistos_venta + v_utilidad_venta;

  -- Gastos que no dependen del factor (admin sobre compra, renta e ICA sobre el bloque venta)
  v_admin_gasto := p_pct_admin_gasto * p_compra_total;

  -- Renta: sobre la utilidad AIU si el esquema es IVA_AIU, sobre la utilidad total
  -- (las 3 capas del AIU combinadas) si el esquema es IVA_FULL. Confirmado con Tintalá
  -- (esquema IVA_AIU) — el caso IVA_FULL sigue el mismo patrón de nombres pero no está
  -- verificado con un ejemplo real todavía.
  v_renta_base := case when p_esquema_iva = 'IVA_AIU'
    then v_utilidad_venta
    else (v_subtotal_general_venta - p_venta_total)
  end;
  v_renta_gasto := p_pct_renta * v_renta_base;
  v_ica_gasto := (p_ica_por_mil / 1000.0) * v_subtotal_general_venta;

  -- Iteración de punto fijo: el factor depende del total con IVA, que depende del factor.
  -- Converge en Tintalá en ~13 vueltas; se limita a 30 por seguridad.
  loop
    v_iteraciones := v_iteraciones + 1;
    v_factor_anterior := v_factor;

    v_calculo_subtotal := p_venta_total / v_factor;
    v_subtotal_general_calculo := v_calculo_subtotal
      * (1 + p_pct_admin_aiu + p_pct_imprevistos + p_pct_utilidad_aiu);
    v_utilidad_calculo := p_pct_utilidad_aiu * v_calculo_subtotal;

    v_iva_calculo := case when p_esquema_iva = 'IVA_AIU'
      then p_iva_pct * v_utilidad_calculo
      else p_iva_pct * v_subtotal_general_calculo
    end;
    v_total_con_iva := v_subtotal_general_calculo + v_iva_calculo;

    -- Comisión comercial: NO verificada contra un caso real (siempre fue 0 en Tintalá).
    -- Base asumida: total del proyecto con IVA (convención habitual de comisión sobre venta).
    v_comision_gasto := p_pct_comision * v_total_con_iva;

    v_total_gastos := v_admin_gasto + v_renta_gasto + v_ica_gasto + v_comision_gasto;
    v_factor := 1 - (v_total_gastos / v_total_con_iva);

    exit when abs(v_factor - v_factor_anterior) < 0.0000001 or v_iteraciones >= 30;
  end loop;

  return round(v_factor, 10);
end;
$$;

-- v_capas_utilidad con las bases reales de los gastos internos (verificadas contra Tintalá).
-- Reemplaza los null de la migración 20260923000010.
create or replace view v_capas_utilidad as
select
  c.id as cotizacion_id,
  c.codigo,
  c.esquema_iva,
  t.subtotal_venta - t.subtotal_compra as capa1_margen_linea,
  t.subtotal_calculo - t.subtotal_venta as capa2_recargo_proyecto,
  t.valor_admin as capa3_admin,
  t.valor_imprevistos as capa4_imprevistos,
  t.valor_utilidad_aiu as capa5_utilidad_aiu_bruta,

  round(c.pct_admin_gasto_interno * t.subtotal_compra, 2) as gasto_admin,
  round(
    c.pct_renta * (
      case when c.esquema_iva = 'IVA_AIU'
        then c.pct_utilidad_aiu * t.subtotal_venta
        else t.subtotal_venta * (c.pct_admin + c.pct_imprevistos + c.pct_utilidad_aiu)
      end
    ), 2) as gasto_renta,
  round(
    (c.ica_por_mil / 1000.0) * (t.subtotal_venta * (1 + c.pct_admin + c.pct_imprevistos + c.pct_utilidad_aiu))
  , 2) as gasto_ica,
  round(c.pct_comision_comercial * t.total_cotizacion, 2) as gasto_comision,

  round(
    (c.pct_admin_gasto_interno * t.subtotal_compra)
    + c.pct_renta * (
        case when c.esquema_iva = 'IVA_AIU'
          then c.pct_utilidad_aiu * t.subtotal_venta
          else t.subtotal_venta * (c.pct_admin + c.pct_imprevistos + c.pct_utilidad_aiu)
        end
      )
    + (c.ica_por_mil / 1000.0) * (t.subtotal_venta * (1 + c.pct_admin + c.pct_imprevistos + c.pct_utilidad_aiu))
    + (c.pct_comision_comercial * t.total_cotizacion)
  , 2) as total_gastos,

  -- Utilidad Total: margen del bloque venta (subtotal general venta − compra) + el admin del
  -- gasto sumado de vuelta (es provisión para administración propia, no sale de caja).
  round(
    (t.subtotal_venta * (1 + c.pct_admin + c.pct_imprevistos + c.pct_utilidad_aiu) - t.subtotal_compra)
    + (c.pct_admin_gasto_interno * t.subtotal_compra)
  , 2) as utilidad_total,

  round(
    (
      (t.subtotal_venta * (1 + c.pct_admin + c.pct_imprevistos + c.pct_utilidad_aiu) - t.subtotal_compra)
      + (c.pct_admin_gasto_interno * t.subtotal_compra)
    ) / nullif(t.total_cotizacion, 0) * 100
  , 2) as pct_utilidad_total,

  round(
    c.pct_renta * (
      case when c.esquema_iva = 'IVA_AIU'
        then c.pct_utilidad_aiu * t.subtotal_venta
        else t.subtotal_venta * (c.pct_admin + c.pct_imprevistos + c.pct_utilidad_aiu)
      end
    )
    + (c.ica_por_mil / 1000.0) * (t.subtotal_venta * (1 + c.pct_admin + c.pct_imprevistos + c.pct_utilidad_aiu))
    + t.valor_iva
  , 2) as impuestos_a_transferir,

  t.subtotal_general,
  t.total_cotizacion
from cotizaciones c
join v_cotizacion_totales_iva t on t.cotizacion_id = c.id;

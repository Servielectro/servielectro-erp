-- Módulo 1: Proyectos — vistas analíticas
-- Totales de cotización, capas de utilidad, presupuesto vs ejecución, flujo de caja.

-- 1) Totales de una cotización, con la base de IVA según tipo de contrato
create view v_cotizacion_totales as
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
  -- Suma de partes ya redondeadas (no el subtotal_calculo * factor combinado), para que el
  -- total cuadre exactamente con la suma de las líneas que se le muestran a Jhojan.
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
from cotizaciones c
left join cotizacion_items ci on ci.cotizacion_id = c.id
group by c.id;

-- agrega valor de IVA y total, ya con la base resuelta arriba
create view v_cotizacion_totales_iva as
select
  t.*,
  round(t.iva_base_valor * t.iva_pct, 2) as valor_iva,
  round(t.subtotal_general + (t.iva_base_valor * t.iva_pct), 2) as total_cotizacion
from v_cotizacion_totales t;

-- 2) Las 5 capas de utilidad de una cotización (bruto), con deducciones internas sobre la utilidad AIU
-- Base de las deducciones internas (admin interno, renta, ICA, comisión) = utilidad_aiu bruta.
-- Pendiente de confirmar con Jhojan (ver Decisión abierta #2): ICA normalmente se calcula sobre
-- ingresos brutos en Colombia, no sobre la utilidad; aquí se deja configurable a nivel de vista.
create view v_capas_utilidad as
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

-- 3) Presupuesto vs. Ejecución por proyecto (comparación por línea)
create view v_presupuesto_vs_ejecucion as
select
  p.id as proyecto_id,
  p.codigo as proyecto_codigo,
  ci.id as presupuesto_item_id,
  ci.categoria,
  ci.descripcion,
  ci.unidad,
  ci.cantidad as cantidad_presupuestada,
  ci.valor_calculo_unitario as valor_unitario_presupuestado,
  ci.cantidad * ci.valor_calculo_unitario as valor_total_presupuestado,
  coalesce(sum(ej.cantidad), 0) as cantidad_ejecutada,
  coalesce(sum(ej.cantidad * ej.valor_compra_real_unitario), 0) as valor_total_ejecutado,
  coalesce(sum(ej.cantidad), 0) - ci.cantidad as desviacion_cantidad,
  coalesce(sum(ej.cantidad * ej.valor_compra_real_unitario), 0) - (ci.cantidad * ci.valor_calculo_unitario) as desviacion_valor
from proyectos p
join cotizacion_items ci on ci.cotizacion_id = p.cotizacion_aprobada_id
left join proyecto_ejecucion_items ej on ej.presupuesto_item_id = ci.id
group by p.id, ci.id;

-- Gastos ejecutados sin línea de presupuesto asociada (imprevistos reales no cotizados)
create view v_ejecucion_sin_presupuesto as
select
  ej.proyecto_id,
  ej.id as ejecucion_id,
  ej.categoria,
  ej.descripcion,
  ej.cantidad,
  ej.valor_compra_real_unitario,
  ej.cantidad * ej.valor_compra_real_unitario as valor_total,
  ej.fecha
from proyecto_ejecucion_items ej
where ej.presupuesto_item_id is null;

-- 4) Flujo de caja del proyecto: ingresos (hitos cobrados) vs egresos (ejecución real), por fecha
create view v_flujo_caja as
select
  proyecto_id,
  fecha,
  tipo,
  concepto,
  valor
from (
  select
    proyecto_id,
    fecha_cobrado as fecha,
    'INGRESO'::text as tipo,
    nombre as concepto,
    valor_cobrado as valor
  from hitos_cobro
  where estado = 'COBRADO' and fecha_cobrado is not null

  union all

  select
    proyecto_id,
    fecha,
    'EGRESO'::text as tipo,
    descripcion as concepto,
    cantidad * valor_compra_real_unitario as valor
  from proyecto_ejecucion_items
) movimientos
order by fecha;

create view v_flujo_caja_saldo as
select
  proyecto_id,
  fecha,
  tipo,
  concepto,
  valor,
  sum(case when tipo = 'INGRESO' then valor else -valor end)
    over (partition by proyecto_id order by fecha, tipo rows between unbounded preceding and current row) as saldo_acumulado
from v_flujo_caja;

-- Resumen de cobros pendientes por proyecto
create view v_cobros_pendientes as
select
  proyecto_id,
  count(*) filter (where estado <> 'COBRADO') as hitos_pendientes,
  coalesce(sum(valor_programado) filter (where estado <> 'COBRADO'), 0) as valor_pendiente_cobro,
  coalesce(sum(valor_cobrado) filter (where estado = 'COBRADO'), 0) as valor_cobrado_total
from hitos_cobro
group by proyecto_id;

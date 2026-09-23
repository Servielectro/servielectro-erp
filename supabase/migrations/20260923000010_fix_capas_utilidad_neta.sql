-- Módulo 1: Proyectos — corrige v_capas_utilidad: deja de presentar una "utilidad neta"
-- que se sabe matemáticamente incorrecta.
-- Idempotente: se puede correr más de una vez sin romper.
--
-- Contexto (ver docs/ERP-Servielectro-Modulo1-Proyectos.md §13): con datos reales de
-- Tintalá, los gastos internos (admin 14% + renta 36% + ICA 12.05‰) suman $1.946.631,
-- casi 2.7 veces la utilidad_aiu bruta ($725.547). Aplicando esas tasas SOLO sobre
-- utilidad_aiu el máximo posible es ~$371.516 (51.205% de $725.547) — nunca puede llegar
-- a $1.946.631. La implementación anterior (deducir de utilidad_aiu únicamente) es
-- matemáticamente imposible de conciliar con los datos reales: se deja en null en vez
-- de mostrar una cifra de utilidad "neta" que se sabe falsa, hasta tener el desglose real
-- (cuánto de esos $1.946.631 es admin, cuánto renta, cuánto ICA, y sobre qué base exacta
-- se calcula cada uno).

create or replace view v_capas_utilidad as
select
  c.id as cotizacion_id,
  c.codigo,
  t.subtotal_venta - t.subtotal_compra as capa1_margen_linea,
  t.subtotal_calculo - t.subtotal_venta as capa2_recargo_proyecto,
  t.valor_admin as capa3_admin,
  t.valor_imprevistos as capa4_imprevistos,
  t.valor_utilidad_aiu as capa5_utilidad_aiu_bruta,
  -- Deducciones internas: PENDIENTES DE VALIDAR. No se sabe todavía sobre qué base exacta
  -- se calcula cada una (ver docs §13) — se dejan en null en vez de una cifra adivinada.
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

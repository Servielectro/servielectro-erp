-- Rollback de 20260924000016_fix_vistas_bypass_rls.sql
-- ADVERTENCIA: esto vuelve a exponer todas estas vistas a cualquiera sin sesión.
-- Solo usar si algo se rompe y hay que revertir de urgencia, nunca dejarlo así.
alter view v_items_precio_actual set (security_invoker = false);
alter view v_items_catalogo_con_precio set (security_invoker = false);
alter view v_cotizacion_totales set (security_invoker = false);
alter view v_cotizacion_totales_iva set (security_invoker = false);
alter view v_capas_utilidad set (security_invoker = false);
alter view v_presupuesto_vs_ejecucion set (security_invoker = false);
alter view v_ejecucion_sin_presupuesto set (security_invoker = false);
alter view v_flujo_caja set (security_invoker = false);
alter view v_flujo_caja_saldo set (security_invoker = false);
alter view v_cobros_pendientes set (security_invoker = false);
alter view v_cotizaciones_listado set (security_invoker = false);
alter view v_hitos_cotizacion set (security_invoker = false);
alter view v_rut_vigente_cliente set (security_invoker = false);

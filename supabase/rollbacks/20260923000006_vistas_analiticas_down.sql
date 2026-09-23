-- Rollback de 20260923000006_vistas_analiticas.sql
drop view if exists v_cobros_pendientes;
drop view if exists v_flujo_caja_saldo;
drop view if exists v_flujo_caja;
drop view if exists v_ejecucion_sin_presupuesto;
drop view if exists v_presupuesto_vs_ejecucion;
drop view if exists v_capas_utilidad;
drop view if exists v_cotizacion_totales_iva;
drop view if exists v_cotizacion_totales;

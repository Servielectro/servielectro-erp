-- Rollback de 20260923000008_rpc_guardar_cotizacion.sql
drop function if exists fn_guardar_cotizacion_completa(
  text, uuid, esquema_iva, text, numeric, numeric, numeric, numeric, numeric, jsonb
);

-- Rollback de 20260923000004_cotizaciones.sql
drop trigger if exists trg_cotizacion_items_bloqueo on cotizacion_items;
drop function if exists fn_bloquear_edicion_cotizacion_aprobada();
drop trigger if exists trg_cotizaciones_recalcular_items on cotizaciones;
drop function if exists fn_recalcular_items_por_cambio_factor();
drop trigger if exists trg_cotizacion_items_calculo on cotizacion_items;
drop function if exists fn_calcular_valor_calculo_item();
drop trigger if exists trg_cotizacion_items_updated_at on cotizacion_items;
drop table if exists cotizacion_items;
drop trigger if exists trg_cotizaciones_updated_at on cotizaciones;
drop table if exists cotizaciones;
drop function if exists fn_siguiente_codigo_cotizacion(smallint);
drop table if exists cotizacion_consecutivos;

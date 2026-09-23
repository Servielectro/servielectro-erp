-- Rollback de 20260923000005_proyectos_ejecucion.sql
drop trigger if exists trg_hitos_validar_suma on hitos_cobro;
drop function if exists fn_validar_suma_hitos();
drop trigger if exists trg_hitos_updated_at on hitos_cobro;
drop table if exists hitos_cobro;
drop trigger if exists trg_ejecucion_updated_at on proyecto_ejecucion_items;
drop table if exists proyecto_ejecucion_items;
drop trigger if exists trg_proyectos_validar_cotizacion on proyectos;
drop function if exists fn_validar_proyecto_desde_cotizacion_aprobada();
drop trigger if exists trg_proyectos_updated_at on proyectos;
drop table if exists proyectos;

-- Deshace 20261126000100 (seguimiento de cotizaciones). BORRA el historial de seguimientos:
-- correrlo solo si no hay datos reales. Las cotizaciones EN_EVALUACION vuelven a ENVIADA (el valor
-- del enum de la 99 se queda: Postgres no quita valores de un enum sin recrear el tipo).
drop view if exists public.v_cotizaciones_alertas;
drop function if exists public.fn_cerrar_seguimiento(uuid, text, text, date, uuid, text, text);
drop table if exists public.cotizacion_seguimientos;
drop function if exists public.fn_cotizacion_seguimientos_reglas();
drop trigger if exists trg_cotizacion_estado_reglas on public.cotizaciones;
drop function if exists public.fn_cotizacion_estado_reglas();
update public.cotizaciones set estado = 'ENVIADA' where estado = 'EN_EVALUACION';
alter table public.cotizaciones drop constraint if exists cotizaciones_validez_dias;
alter table public.cotizaciones drop column if exists validez_dias;
alter table public.cotizaciones drop column if exists enviada_en;

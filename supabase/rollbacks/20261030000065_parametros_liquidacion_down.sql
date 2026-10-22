-- Rollback de 20261030000065 (Parámetros de liquidación). OJO: borra los valores de ley que se
-- hayan registrado, con su historial de vigencias. Exportarlos antes si ya hay datos reales.
-- Correr DESPUÉS del rollback de la 66 (empleado_parametros depende de esta).

drop function if exists public.fn_parametros_vigentes(date);
drop table if exists public.parametro_valores;
drop table if exists public.parametros_liquidacion;
drop function if exists public.fn_parametro_valor_inmutable();
drop function if exists public.fn_parametro_valor_quien();

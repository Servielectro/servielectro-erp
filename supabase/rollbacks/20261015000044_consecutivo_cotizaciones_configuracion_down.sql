-- Deshace 20261015000044. NO toca cotizacion_consecutivos: el número queda donde esté
-- (bajarlo podría repetir códigos ya emitidos). Se pierde el historial de ajustes.

drop function if exists public.fn_ajustar_consecutivo(smallint, integer, text);
drop function if exists public.fn_estado_consecutivos();
drop function if exists public.fn_mayor_consecutivo_emitido(smallint);
drop table if exists public.cotizacion_consecutivos_ajustes;

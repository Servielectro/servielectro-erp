-- Rollback de la migración 81: quita las funciones de registrar y revocar dispositivos. Los
-- dispositivos registrados se quedan (para apagar el envío, desactivar el cron de "enviar-push").
drop function if exists public.fn_registrar_suscripcion(text, text, text, text);
drop function if exists public.fn_revocar_suscripcion(text);

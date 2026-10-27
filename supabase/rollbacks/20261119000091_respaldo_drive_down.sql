-- Deshace 20261119000091 (respaldo en Drive). Se pierde el REGISTRO de qué está respaldado y
-- verificado (las copias siguen en Drive, pero la base ya no las conoce: un descarte de audio
-- quedaría sin prueba). Antes: apagar el cron y borrar la función respaldar-drive.

drop trigger if exists trg_respaldo_avisar on public.respaldo_drive_corridas;
drop function if exists public.fn_respaldo_avisar();
drop view if exists public.v_respaldo_drive_resumen;
drop function if exists public.fn_respaldo_tomar_turno();
drop function if exists public.fn_respaldo_pendientes(int);
drop table if exists public.respaldo_drive_corridas;
drop table if exists public.respaldo_drive_carpetas;
drop table if exists public.respaldo_drive_archivos;
delete from public.notificaciones where tipo = 'respaldo_drive';
delete from public.notificacion_preferencias where tipo = 'respaldo_drive';
delete from public.notificacion_tipos where id = 'respaldo_drive';

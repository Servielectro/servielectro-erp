-- Deshace 20261117000089. Si el respaldo ya anotó copias en Drive, esos datos se pierden: correrlo
-- solo antes de conectar Drive.
drop trigger if exists trg_reuniones_copia_drive on public.reuniones;
drop function if exists public.fn_reuniones_copia_drive();
alter table public.reuniones drop constraint if exists reuniones_descarte_con_copia;
alter table public.reuniones drop constraint if exists reuniones_drive_completo;
alter table public.reuniones drop column if exists audio_drive_verificado_en;
alter table public.reuniones drop column if exists audio_drive_md5;
alter table public.reuniones drop column if exists audio_drive_archivo_id;

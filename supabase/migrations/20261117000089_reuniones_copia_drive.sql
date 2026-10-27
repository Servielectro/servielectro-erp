-- Reuniones: dónde se anota la copia del audio en Google Drive (2026-10-27). NO habilita ningún
-- descarte.
--
-- Jhojan: las grabaciones se guardan en Drive al menos 1 año. Orden obligatorio: el audio de
-- Storage NO se descarta hasta que la copia en Drive exista y esté VERIFICADA; que pase el plazo
-- no alcanza. Drive todavía no está conectado, así que:
--   - audio_descartable_desde sigue vacío y la 86 sigue negándose a marcar o descartar.
--   - Se agregan las columnas de la copia: el id del archivo en Drive, su checksum MD5 (el que
--     Drive informa) y cuándo se verificó contra el original.
--   - Las escribe SOLO el proceso de respaldo (service_role), nunca un usuario desde la app: una
--     "prueba" escrita a mano no prueba nada.
--   - Regla dura, en la tabla (vale incluso para postgres): no puede haber audio descartado sin
--     copia verificada en Drive.
-- Cuando se arme el respaldo, el descarte (otra migración) tiene que exigir además que la
-- verificación sea posterior a la subida del audio y que el MD5 coincida con el de Storage.
--
-- Va después de la 86. Idempotente.
-- Verificación: supabase/verificaciones/20261117000089_verificar.sql
-- Rollback:     supabase/rollbacks/20261117000089_reuniones_copia_drive_down.sql

alter table public.reuniones add column if not exists audio_drive_archivo_id text;
alter table public.reuniones add column if not exists audio_drive_md5 text;
alter table public.reuniones add column if not exists audio_drive_verificado_en timestamptz;

alter table public.reuniones drop constraint if exists reuniones_drive_completo;
alter table public.reuniones add constraint reuniones_drive_completo check (
  (audio_drive_archivo_id is null and audio_drive_md5 is null and audio_drive_verificado_en is null)
  or (audio_drive_archivo_id is not null and audio_drive_md5 ~ '^[0-9a-f]{32}$' and audio_drive_verificado_en is not null
      and audio_path is not null)
);
alter table public.reuniones drop constraint if exists reuniones_descarte_con_copia;
alter table public.reuniones add constraint reuniones_descarte_con_copia check (
  audio_descartado_en is null or audio_drive_verificado_en is not null
);

-- La copia la anota solo el respaldo (service_role) o la consola; desde la app, nadie.
create or replace function public.fn_reuniones_copia_drive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.audio_drive_archivo_id := null;
    new.audio_drive_md5 := null;
    new.audio_drive_verificado_en := null;
    return new;
  end if;
  if (new.audio_drive_archivo_id, new.audio_drive_md5, new.audio_drive_verificado_en)
     is distinct from (old.audio_drive_archivo_id, old.audio_drive_md5, old.audio_drive_verificado_en) then
    raise exception 'La copia del audio en Drive la anota el respaldo automático, no se escribe a mano.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reuniones_copia_drive on public.reuniones;
create trigger trg_reuniones_copia_drive
  before insert or update on public.reuniones
  for each row execute function public.fn_reuniones_copia_drive();

-- de trigger: nadie
revoke all on function public.fn_reuniones_copia_drive() from public, anon, authenticated;

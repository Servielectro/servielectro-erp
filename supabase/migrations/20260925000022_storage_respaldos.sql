-- Módulo 1: Proyectos — bucket de Storage privado para los respaldos manuales que
-- genera el menú "Base de datos" (exportar / restaurar). Idempotente: se puede correr
-- más de una vez sin romper.
--
-- Mismo criterio que documentos-clientes (20260923000015): nunca público, solo un
-- usuario autenticado puede leer/escribir.
--
-- Por qué existe este bucket (ver docs §16.2): el plan Free de Supabase no ofrece
-- respaldos automáticos ni restaurar-a-una-fecha. Esta es la red de seguridad real:
-- cada "Exportar" sube una copia acá con fecha y hora en el nombre, y "Restaurar"
-- lista lo que YA existe acá — nunca un calendario que sugiera fechas inventadas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'respaldos',
  'respaldos',
  false,
  52428800, -- 50 MB
  array['application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists respaldos_authenticated_select on storage.objects;
create policy respaldos_authenticated_select on storage.objects
  for select to authenticated
  using (bucket_id = 'respaldos');

drop policy if exists respaldos_authenticated_insert on storage.objects;
create policy respaldos_authenticated_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'respaldos');

drop policy if exists respaldos_authenticated_update on storage.objects;
create policy respaldos_authenticated_update on storage.objects
  for update to authenticated
  using (bucket_id = 'respaldos')
  with check (bucket_id = 'respaldos');

drop policy if exists respaldos_authenticated_delete on storage.objects;
create policy respaldos_authenticated_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'respaldos');

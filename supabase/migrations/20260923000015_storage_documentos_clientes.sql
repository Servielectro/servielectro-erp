-- Módulo 1: Proyectos — bucket de Storage privado para documentos de clientes (RUT) y,
-- después, facturas de proveedor. Idempotente: se puede correr más de una vez sin romper.
--
-- Estructura de carpetas: clientes/{cliente_id}/rut/{timestamp}-{nombre_archivo}
-- Nunca público. Solo un usuario autenticado puede leer/escribir (mismo criterio
-- permisivo del resto del sistema — ver docs §13, RLS demasiado permisiva).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-clientes',
  'documentos-clientes',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documentos_clientes_authenticated_select on storage.objects;
create policy documentos_clientes_authenticated_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos-clientes');

drop policy if exists documentos_clientes_authenticated_insert on storage.objects;
create policy documentos_clientes_authenticated_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos-clientes');

drop policy if exists documentos_clientes_authenticated_update on storage.objects;
create policy documentos_clientes_authenticated_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos-clientes')
  with check (bucket_id = 'documentos-clientes');

drop policy if exists documentos_clientes_authenticated_delete on storage.objects;
create policy documentos_clientes_authenticated_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos-clientes');

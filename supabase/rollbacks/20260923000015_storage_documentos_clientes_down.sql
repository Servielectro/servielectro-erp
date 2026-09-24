-- Rollback de 20260923000015_storage_documentos_clientes.sql
-- Nota: esto NO borra los archivos ya subidos al bucket, solo las políticas y el bucket
-- en sí (Supabase impide borrar un bucket que todavía tiene archivos adentro).
drop policy if exists documentos_clientes_authenticated_delete on storage.objects;
drop policy if exists documentos_clientes_authenticated_update on storage.objects;
drop policy if exists documentos_clientes_authenticated_insert on storage.objects;
drop policy if exists documentos_clientes_authenticated_select on storage.objects;
delete from storage.buckets where id = 'documentos-clientes';

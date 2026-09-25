-- Rollback de 20260925000022_storage_respaldos.sql
drop policy if exists respaldos_authenticated_select on storage.objects;
drop policy if exists respaldos_authenticated_insert on storage.objects;
drop policy if exists respaldos_authenticated_update on storage.objects;
drop policy if exists respaldos_authenticated_delete on storage.objects;
delete from storage.buckets where id = 'respaldos';

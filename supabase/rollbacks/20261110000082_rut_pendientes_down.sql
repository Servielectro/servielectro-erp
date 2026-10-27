-- Rollback de la migración 82: la carpeta de pendientes vuelve a ser solo de Comercial (la
-- política del bucket entero). Los archivos subidos se quedan.
drop policy if exists documentos_clientes_pendientes_insert on storage.objects;
drop policy if exists documentos_clientes_pendientes_select on storage.objects;

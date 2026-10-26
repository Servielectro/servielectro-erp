-- Rollback de la migración 71: el RUT vuelve a ser solo de Comercial. No borra ningún RUT subido.
drop policy if exists documentos_rut_administrativo_select on public.documentos;
drop policy if exists documentos_rut_administrativo_insert on public.documentos;
drop policy if exists documentos_rut_administrativo_update on public.documentos;
drop policy if exists documentos_clientes_rut_administrativo_select on storage.objects;
drop policy if exists documentos_clientes_rut_administrativo_insert on storage.objects;

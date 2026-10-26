-- El RUT de los clientes también para Administrativo (2026-10-26). Desde la 70 Administrativo
-- mantiene los datos fiscales del cliente; el RUT es el papel de donde salen el NIT y el régimen,
-- así que tiene que poder abrirlo y subirlo. No tiene plata.
--
-- Se SUMAN políticas (en Postgres las políticas permisivas se combinan con OR): a Comercial no se
-- le quita nada. Administrativo queda limitado a lo que es RUT:
--   documentos: solo filas tipo 'RUT' (la misma tabla guarda FACTURA_PROVEEDOR, que es plata).
--     Ver = consultar; subir y confirmar = trabajar. Sin borrar.
--   Storage documentos-clientes: solo la carpeta clientes/{id}/rut/ (la que usa subirYLeerRut).
--     Ver = consultar; subir = trabajar. Sin reemplazar ni borrar, igual que Comercial.
--
-- Verificación: supabase/verificaciones/20261103000071_verificar.sql
-- Rollback:     supabase/rollbacks/20261103000071_rut_administrativo_down.sql
-- Idempotente.

drop policy if exists documentos_rut_administrativo_select on public.documentos;
create policy documentos_rut_administrativo_select on public.documentos for select to authenticated
  using (tipo_documento = 'RUT' and fn_tiene_permiso('administrativo', 'consultar'));
drop policy if exists documentos_rut_administrativo_insert on public.documentos;
create policy documentos_rut_administrativo_insert on public.documentos for insert to authenticated
  with check (tipo_documento = 'RUT' and fn_tiene_permiso('administrativo', 'trabajar'));
drop policy if exists documentos_rut_administrativo_update on public.documentos;
create policy documentos_rut_administrativo_update on public.documentos for update to authenticated
  using (tipo_documento = 'RUT' and fn_tiene_permiso('administrativo', 'trabajar'))
  with check (tipo_documento = 'RUT' and fn_tiene_permiso('administrativo', 'trabajar'));

drop policy if exists documentos_clientes_rut_administrativo_select on storage.objects;
create policy documentos_clientes_rut_administrativo_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes'
         and (storage.foldername(name))[1] = 'clientes' and (storage.foldername(name))[3] = 'rut'
         and fn_tiene_permiso('administrativo', 'consultar'));
drop policy if exists documentos_clientes_rut_administrativo_insert on storage.objects;
create policy documentos_clientes_rut_administrativo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes'
              and (storage.foldername(name))[1] = 'clientes' and (storage.foldername(name))[3] = 'rut'
              and fn_tiene_permiso('administrativo', 'trabajar'));

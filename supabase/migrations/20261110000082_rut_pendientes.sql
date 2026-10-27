-- RUT de un cliente que todavía no existe, para Administrativo también (2026-10-27).
--
-- La lectura del RUT ahora sube el archivo DIRECTO del celular a Storage (antes viajaba dentro de
-- la llamada al servidor y chocaba con el límite de 1 MB: "Body exceeded 1 MB limit" en
-- producción). Para un cliente nuevo va a pendientes/{quien}/…; al crear el cliente queda
-- registrado como su RUT. Hasta hoy esa carpeta solo la podía usar Comercial (la política del
-- bucket entero); Administrativo, que también crea clientes, no.
--
--   subir:  pendientes/{su propio id}/…, con Comercial o Administrativo "trabajar".
--   ver:    lo propio; y Administrativo "consultar" ve los RUT de pendientes (como ya ve los de
--           clientes/{id}/rut/, migración 71). Comercial ya veía todo el bucket.
-- Sin reemplazar ni borrar, como el resto del bucket.
--
-- Verificación: supabase/verificaciones/20261110000082_verificar.sql
-- Rollback:     supabase/rollbacks/20261110000082_rut_pendientes_down.sql
-- Idempotente.

drop policy if exists documentos_clientes_pendientes_insert on storage.objects;
create policy documentos_clientes_pendientes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes'
              and (storage.foldername(name))[1] = 'pendientes'
              and (storage.foldername(name))[2] = auth.uid()::text
              and fn_clientes_permiso('trabajar'));

drop policy if exists documentos_clientes_pendientes_select on storage.objects;
create policy documentos_clientes_pendientes_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes'
         and (storage.foldername(name))[1] = 'pendientes'
         and ((storage.foldername(name))[2] = auth.uid()::text or fn_tiene_permiso('administrativo', 'consultar')));

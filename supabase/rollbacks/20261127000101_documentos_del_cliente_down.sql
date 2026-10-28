-- Deshace 20261127000101 (documentos del cliente). BORRA los registros de cliente_documentos (los
-- archivos quedan en el bucket, sin fila): correrlo solo si no hay datos reales.
drop policy if exists documentos_clientes_docs_administrativo_select on storage.objects;
drop policy if exists documentos_clientes_docs_administrativo_insert on storage.objects;
drop function if exists public.fn_cliente_archivo(text, text);
drop table if exists public.cliente_documentos;
drop function if exists public.fn_cliente_documentos_reglas();
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
 where id = 'documentos-clientes';

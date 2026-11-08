-- Licitaciones: permisos del bucket para subir los documentos del proceso (2026-11-08).
--
-- El portal de SECOP rechaza la descarga automática (403 de su firewall, control antibot de
-- Colombia Compra) y eso NO se rodea. Camino aprobado: la persona abre el documento en SECOP y lo
-- sube a la ficha. El bucket 'licitaciones' (143, privado, 100 MB) no tenía políticas.
--
-- Las mismas reglas de la tabla licitacion_documentos (143):
--   ver    = quien ve Oportunidades
--   subir  = quien trabaja Oportunidades
--   borrar = solo quien es responsable
--   editar = nadie: el archivo se identifica por su huella; otra versión es otro archivo.
-- Ruta: {licitacion_id}/{sha256}.{extensión}. La política exige que la carpeta sea una licitación
-- que existe y una extensión de documento (no se guardan ejecutables).

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'licitaciones') then
    raise exception 'Falta el bucket licitaciones (migración 143).';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'licitacion_documentos' and column_name = 'tipo_deducido') then
    raise exception 'Primero la migración 147.';
  end if;
end $$;

drop policy if exists licitaciones_archivos_ver on storage.objects;
create policy licitaciones_archivos_ver on storage.objects for select to authenticated
  using (bucket_id = 'licitaciones' and public.fn_permiso_seccion('licitaciones', 'oportunidades') is not null);

drop policy if exists licitaciones_archivos_subir on storage.objects;
create policy licitaciones_archivos_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'licitaciones'
    and public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'trabajar')
    and exists (select 1 from public.licitaciones l where l.id::text = (storage.foldername(name))[1])
    and lower(storage.extension(name)) = any (array[
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'csv', 'txt', 'rtf', 'odt', 'ods',
      'ppt', 'pptx', 'zip', 'rar', '7z', 'dwg', 'jpg', 'jpeg', 'png', 'tif', 'tiff'])
  );

drop policy if exists licitaciones_archivos_borrar on storage.objects;
create policy licitaciones_archivos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'licitaciones' and public.fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'responsable'));

comment on column public.licitacion_documentos.tipo_deducido is
  'true = el tipo se dedujo del nombre del archivo (SECOP no lo dice en dmgg-8hin). false = lo confirmó o corrigió una persona. EL MOTOR DE ANÁLISIS NO DEBE TRATAR UN TIPO DEDUCIDO COMO CIERTO: un anexo leído como pliego produce requisitos inventados con cara de ciertos.';

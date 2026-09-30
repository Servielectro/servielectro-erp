-- Deshace 20261001000035. OJO: borra el registro de plantillas (los archivos quedan en Storage).
drop policy if exists documentos_rrhh_select on storage.objects;
drop policy if exists documentos_rrhh_insert on storage.objects;
drop function if exists fn_publicar_version_plantilla(uuid, text, text, bigint, text);
drop table if exists plantilla_versiones;
drop table if exists plantillas_documento;
drop function if exists fn_plantilla_version_inmutable();
drop type if exists tipo_plantilla;

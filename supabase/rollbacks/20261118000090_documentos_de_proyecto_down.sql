-- Deshace 20261118000090 (documentos de proyecto). BORRA las filas de documentos, pólizas y
-- amparos: correrlo solo si todavía no hay datos reales. Los ARCHIVOS del bucket
-- documentos-proyectos no se borran desde acá (Storage): vaciarlo a mano antes, si hace falta.

drop policy if exists documentos_proyectos_insert on storage.objects;
drop policy if exists documentos_proyectos_select on storage.objects;

drop view if exists public.v_proyecto_amparos_vigencia;
drop table if exists public.proyecto_poliza_amparos;
drop table if exists public.proyecto_polizas;
drop table if exists public.proyecto_documentos;

drop function if exists public.fn_proyecto_amparos_reglas();
drop function if exists public.fn_proyecto_polizas_reglas();
drop function if exists public.fn_proyecto_documentos_reglas();
drop function if exists public.fn_proyecto_documento_tipo(uuid);
drop function if exists public.fn_proyecto_archivo(text, text);
drop function if exists public.fn_proyecto_documentos_trabajar();
drop function if exists public.fn_proyecto_documento_visible(uuid);
-- El bucket (vacío) se borra desde el panel de Storage.

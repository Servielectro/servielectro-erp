-- Rollback de la migración 75. OJO: BORRA todas las plantillas, formatos llenados, firmas, el plan
-- de trabajo y sus evidencias (son registros de SST con retención por norma: exportarlos antes).
-- Los archivos del bucket sgsst quedan en Storage. El módulo y su permiso se quedan.
drop policy if exists sgsst_archivos_select on storage.objects;
drop policy if exists sgsst_archivos_insert on storage.objects;
drop function if exists public.fn_sst_archivo_subible(text);
drop table if exists public.sst_plan_evidencias;
drop table if exists public.sst_plan_items;
drop table if exists public.sst_formato_firmas;
drop table if exists public.sst_formato_archivos;
drop table if exists public.sst_formatos;
drop table if exists public.sst_plantillas;
drop function if exists public.fn_sst_plantilla_reglas();
drop function if exists public.fn_sst_formato_reglas();
drop function if exists public.fn_sst_archivo_reglas();
drop function if exists public.fn_sst_firma_reglas();
drop function if exists public.fn_sst_plan_reglas();
drop function if exists public.fn_sst_evidencia_reglas();
drop function if exists public.fn_sst_hash_formato(uuid);
drop function if exists public.fn_sst_formato_integro(uuid);
drop function if exists public.fn_sst_formato_tiene_firmas(uuid);
drop function if exists public.fn_sst_faltantes(uuid);
drop function if exists public.fn_sst_campos_problema(jsonb, jsonb);

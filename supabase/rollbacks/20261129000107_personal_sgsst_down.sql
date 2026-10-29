-- Deshace 20261129000107 (personal en SG-SST). BORRA los documentos de personas, los trabajadores
-- de contratistas y el seguimiento de EPP (los archivos quedan en el bucket, sin fila): correrlo
-- solo si no hay datos reales. Las entregas de EPP registradas por SG-SST quedan (son de RRHH).
drop policy if exists sst_personal_select on storage.objects;
drop policy if exists sst_personal_insert on storage.objects;
drop policy if exists dotacion_entregas_select_sgsst_epp on public.dotacion_entregas;
drop policy if exists dotacion_entregas_insert_sgsst_epp on public.dotacion_entregas;
drop table if exists public.epp_inspecciones;
drop table if exists public.epp_seguimiento;
drop table if exists public.persona_documentos;
drop table if exists public.contratista_trabajadores;
drop function if exists public.fn_sst_personal_archivo(text, text);
drop function if exists public.fn_es_entrega_epp(uuid);
drop function if exists public.fn_epp_sst_reglas();
drop function if exists public.fn_persona_documentos_reglas();
drop function if exists public.fn_sst_contratistas();
drop function if exists public.fn_sst_personal_ficha();
drop function if exists public.fn_persona_doc_puede(text);
drop function if exists public.fn_persona_sst_ve();

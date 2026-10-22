-- Rollback de 20261029000064. OJO: borra gastos, facturas registradas, permisos, abonos,
-- documentos del personal (desprendibles) y certificados emitidos. Exportarlos antes si ya hay
-- datos reales. Correrlo ANTES del rollback de la 63, si se deshacen las dos.
-- No borra el bucket rrhh-soportes ni sus archivos: el almacenamiento se vacía solo por la
-- API de Storage (con la clave de servicio), nunca por SQL. Sin las políticas de abajo, nadie
-- con sesión lo puede leer ni escribir.

drop policy if exists rrhh_soportes_select on storage.objects;
drop policy if exists rrhh_soportes_insert on storage.objects;

drop table if exists public.documentos_personal;
drop function if exists public.fn_documentos_reglas();
drop table if exists public.certificados_emitidos;
drop function if exists public.fn_certificados_inmutable();
drop table if exists public.abonos;
drop function if exists public.fn_abonos_reglas();
drop table if exists public.permisos_laborales;
drop function if exists public.fn_permisos_reglas();
drop function if exists public.fn_permiso_fecha_bloqueada(text, date);
drop table if exists public.gasto_soportes;
drop table if exists public.gastos;
drop function if exists public.fn_gastos_reglas();

drop function if exists public.fn_rrhh_soporte_visible(text);
drop function if exists public.fn_rrhh_soporte_subible(text);
drop function if exists public.fn_rrhh_id_de_ruta(text);
drop function if exists public.fn_rrhh_documento_de_firma(text);
drop function if exists public.fn_personas_rrhh();

drop function if exists public.fn_es_aprobador_rrhh(text);
drop table if exists public.rrhh_aprobadores;
drop function if exists public.fn_rrhh_ve_todo();

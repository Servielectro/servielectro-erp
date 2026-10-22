-- Rollback de 20261030000066 (Personal). OJO: borra las fichas del personal (con salarios y
-- datos personales), la hoja de vida registrada, la dotación, las herramientas, las
-- liquidaciones, los desprendibles y la caja menor registrados. Exportarlos antes si ya hay
-- datos reales. Los archivos quedan en el bucket rrhh-personal: el almacenamiento se vacía solo
-- por la API de Storage, nunca por SQL; sin las políticas de abajo nadie con sesión los lee.
-- Correr DESPUÉS del rollback de la 67 y ANTES del de la 65.

drop policy if exists rrhh_personal_select on storage.objects;
drop policy if exists rrhh_personal_insert on storage.objects;

drop view if exists public.v_caja_menor_recibos;
drop table if exists public.caja_menor_soportes;
drop table if exists public.caja_menor_lineas;
drop table if exists public.caja_menor_recibos;
drop table if exists public.desprendibles;
drop table if exists public.liquidacion_lineas;
drop table if exists public.liquidaciones;
drop table if exists public.dotacion_entregas;
drop table if exists public.herramientas;
drop table if exists public.empleado_archivos;
drop table if exists public.empleado_parametros;
drop table if exists public.empleados;
drop function if exists public.fn_rrhh_registro_anulable();
drop function if exists public.fn_rrhh_hijo_de_registro();

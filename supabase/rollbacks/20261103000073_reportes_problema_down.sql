-- Rollback de la migración 73. OJO: borra todos los reportes de problema. Las capturas subidas
-- quedan en el bucket reportes-problema (se borran a mano desde Storage si hace falta).
drop policy if exists reportes_problema_capturas_select on storage.objects;
drop policy if exists reportes_problema_capturas_insert on storage.objects;
drop table if exists public.reportes_problema;
drop function if exists public.fn_reportes_problema_reglas();
drop function if exists public.fn_reportes_problema_admin();

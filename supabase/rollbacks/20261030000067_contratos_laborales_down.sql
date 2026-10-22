-- Rollback de 20261030000067 (Contratos laborales). OJO: borra los contratos, sus cláusulas,
-- pólizas y cronogramas, y las plantillas con el texto que Jhojan haya transcrito. Exportarlos
-- antes si ya hay datos reales. Los PDF firmados quedan en el bucket rrhh-personal (carpeta
-- contratos/): el almacenamiento se vacía solo por la API de Storage, nunca por SQL.
-- Correr ANTES del rollback de la 66, si se deshacen las dos.

drop table if exists public.contrato_cronograma;
drop table if exists public.contrato_polizas;
drop table if exists public.contrato_clausulas;
drop table if exists public.contratos_laborales;
drop table if exists public.contrato_plantilla_cronograma;
drop table if exists public.contrato_plantilla_polizas;
drop table if exists public.contrato_plantilla_clausulas;
drop table if exists public.contrato_plantillas;
drop function if exists public.fn_crear_contrato_laboral(jsonb);
drop function if exists public.fn_contrato_candado();

-- La política de subida vuelve a la de la 66 (sin la carpeta contratos/).
drop policy if exists rrhh_personal_insert on storage.objects;
create policy rrhh_personal_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rrhh-personal' and fn_rrhh_ve_todo()
              and (name like 'personal/%' or name like 'herramientas/%'));

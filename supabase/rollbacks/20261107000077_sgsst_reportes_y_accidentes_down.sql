-- Rollback de la migración 77. OJO: BORRA los reportes de actos o condiciones inseguras, los
-- accidentes e incidentes registrados (registros de SST con retención por norma: exportarlos antes)
-- y los plazos cargados. Los archivos quedan en el bucket sgsst. Vuelven las reglas de archivos de la 75.
drop trigger if exists trg_notif_sst_reporte on public.sst_reportes_inseguros;
drop trigger if exists trg_notif_sst_evento on public.sst_eventos;
drop function if exists public.fn_notif_sst_reporte();
drop function if exists public.fn_notif_sst_evento();
delete from public.notificaciones where tipo in ('reporte_atendido', 'condicion_insegura', 'accidente_registrado');
delete from public.notificacion_preferencias where tipo in ('reporte_atendido', 'condicion_insegura', 'accidente_registrado');
delete from public.notificacion_tipos where id in ('reporte_atendido', 'condicion_insegura', 'accidente_registrado');
alter table public.notificacion_tipos drop constraint if exists notificacion_tipos_para_check;
alter table public.notificacion_tipos add constraint notificacion_tipos_para_check check (para in ('tecnico', 'aprobador', 'rrhh'));

drop policy if exists sgsst_archivos_select on storage.objects;
create policy sgsst_archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'sgsst' and fn_tiene_permiso('sgsst', 'consultar'));
drop function if exists public.fn_sst_archivo_visible(text);
create or replace function public.fn_sst_archivo_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('sgsst', 'trabajar') and case (storage.foldername(p_nombre))[1]
    when 'formatos' then exists (select 1 from sst_formatos f where f.id::text = (storage.foldername(p_nombre))[2] and f.estado = 'borrador')
    when 'plan' then exists (select 1 from sst_plan_items i where i.id::text = (storage.foldername(p_nombre))[2] and i.archivado_en is null)
    else false
  end;
$$;

drop table if exists public.sst_evento_archivos;
drop table if exists public.sst_eventos;
drop table if exists public.sst_reporte_fotos;
drop table if exists public.sst_reportes_inseguros;
drop table if exists public.sst_parametro_valores;
drop table if exists public.sst_parametros;
drop function if exists public.fn_sst_parametro_reglas();
drop function if exists public.fn_sst_reporte_reglas();
drop function if exists public.fn_sst_reporte_foto_reglas();
drop function if exists public.fn_sst_evento_reglas();
drop function if exists public.fn_sst_evento_archivo_reglas();
drop function if exists public.fn_sst_plazos(date);
drop function if exists public.fn_sst_personal();

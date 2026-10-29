-- Deshace 20261129000105: SG-SST deja de leer las actas de Proyectos. Quita las políticas sumadas
-- y las funciones nuevas, y devuelve las tres funciones de lectura a su versión anterior.
drop policy if exists sst_formatos_select_sgsst_actas on public.sst_formatos;
drop policy if exists sst_formato_firmas_select_sgsst_actas on public.sst_formato_firmas;
drop policy if exists sst_formato_archivos_select_sgsst_actas on public.sst_formato_archivos;
drop policy if exists sst_plantillas_select_sgsst_actas on public.sst_plantillas;

create or replace function public.fn_sst_archivo_visible(p_nombre text)
returns boolean language sql stable security definer set search_path = public as $$
  select case (storage.foldername(p_nombre))[1]
    when 'formatos' then exists (select 1 from sst_formatos f where f.id::text = (storage.foldername(p_nombre))[2]
                                 and fn_plantillas_permiso(f.ambito, 'consultar'))
    when 'reportes' then fn_tiene_permiso('sgsst', 'consultar')
      or exists (select 1 from sst_reportes_inseguros r where r.id::text = (storage.foldername(p_nombre))[2] and r.reportado_por = auth.uid())
    else fn_tiene_permiso('sgsst', 'consultar')
  end;
$$;
create or replace function public.fn_sst_formato_integro(p_formato_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select f.hash_contenido is not null
     and f.hash_contenido = fn_sst_hash_formato(f.id)
     and not exists (select 1 from sst_formato_firmas x where x.formato_id = f.id and x.hash_contenido <> f.hash_contenido)
  from sst_formatos f
  where f.id = p_formato_id and fn_plantillas_permiso(f.ambito, 'consultar');
$$;
create or replace function public.fn_sst_hash_formato(p_formato_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to((jsonb_build_object(
    'plantilla', f.plantilla_id,
    'proyecto', f.proyecto_id,
    'cliente', f.cliente_id,
    'lugar', f.lugar,
    'fecha', f.fecha,
    'respuestas', f.respuestas,
    'archivos', coalesce((select jsonb_agg(jsonb_build_array(a.campo_id, a.sha256) order by a.path)
                          from sst_formato_archivos a where a.formato_id = f.id), '[]'::jsonb)
  ) || case when f.tecnicos_en_obra is null then '{}'::jsonb
            else jsonb_build_object('tecnicos_en_obra', f.tecnicos_en_obra) end)::text, 'UTF8')), 'hex')
  from sst_formatos f
  where f.id = p_formato_id
    and (pg_trigger_depth() > 0 or fn_plantillas_permiso(f.ambito, 'consultar'));
$$;

drop function if exists public.fn_sgsst_obras_de_actas();
drop function if exists public.fn_sgsst_ve_plantilla_de_acta(uuid);
drop function if exists public.fn_sgsst_ve_acta_id(uuid);
drop function if exists public.fn_sgsst_ve_acta(text, text);

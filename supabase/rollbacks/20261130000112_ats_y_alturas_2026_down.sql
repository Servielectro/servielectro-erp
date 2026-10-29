-- Deshace 20261130000112. Las plantillas FOR-14 y FOR-15 de 2026 quedan ARCHIVADAS (no se borran:
-- puede haber formatos llenados con ellas). La validación y la regla de firma vuelven a la 75 y
-- la 88: con eso, una plantilla con texto_largo en columnas ya no se podría publicar de nuevo.
update public.sst_plantillas
   set estado = 'archivada', archivada_en = now(), motivo_archivo = 'Rollback de la migración 112.'
 where id in ('00000000-0000-4000-8000-000000112a14', '00000000-0000-4000-8000-000000112a15') and estado = 'publicada';

create or replace function public.fn_sst_tecnicos_firma()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lista jsonb;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if fn_sst_firma_existe(new.id) then
    return new;
  end if;
  v_lista := fn_sst_tecnicos_de(new.formato_id);
  if not fn_sst_formato_tiene_firmas(new.formato_id) and fn_sst_pide_tecnicos(new.formato_id)
     and coalesce(jsonb_array_length(v_lista), 0) = 0 then
    raise exception 'Antes de firmar, anota los técnicos que estuvieron en la obra (nombre y cédula): firman todos.';
  end if;
  if new.rol = 'tecnico' and v_lista is not null then
    if not exists (select 1 from jsonb_array_elements(v_lista) t where fn_sst_doc(t ->> 'documento') = fn_sst_doc(new.documento)) then
      raise exception 'La cédula % no está en la lista de técnicos que estuvieron en la obra.', new.documento;
    end if;
    if exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = 'tecnico'
               and fn_sst_doc(s.documento) = fn_sst_doc(new.documento)) then
      raise exception 'Ese técnico ya firmó este formato.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_sst_tecnicos_firma() from public, anon, authenticated;
drop function if exists public.fn_sst_firma_diaria(uuid, text);

-- fn_sst_campos_problema vuelve a la de la 75: corre la sección de esa función de
-- supabase/migrations/20261105000075_sgsst_plantillas_formatos_plan.sql.
-- La columna control se deja (no estorba y conserva el dato del papel).

-- Deshace 20261130000115: fn_sst_plan_reglas vuelve a la versión de la 75 (sin proteger peso ni calificación).
create or replace function public.fn_sst_plan_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'El plan de trabajo no se borra: se archiva con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
    new.archivado_por := null; new.archivado_en := null; new.motivo_archivo := null;
    return new;
  end if;
  if old.archivado_en is not null then
    raise exception 'El ítem está archivado: no cambia.';
  end if;
  if (new.creado_por, new.creado_en) is distinct from (old.creado_por, old.creado_en) then
    raise exception 'Quién y cuándo lo creó no se cambia.';
  end if;
  -- Estándar, responsable y fecha límite los fija la gestión; el avance lo carga también el SST.
  if (new.estandar, new.descripcion, new.responsable_id, new.fecha_limite, new.orden)
     is distinct from (old.estandar, old.descripcion, old.responsable_id, old.fecha_limite, old.orden)
     and not fn_tiene_permiso('sgsst', 'responsable') then
    raise exception 'El estándar, el responsable y la fecha límite los cambia la gestión SST.';
  end if;
  if new.archivado_en is not null and old.archivado_en is null then
    if not fn_tiene_permiso('sgsst', 'responsable') then
      raise exception 'Solo la gestión SST archiva ítems del plan.';
    end if;
    if length(trim(coalesce(new.motivo_archivo, ''))) = 0 then
      raise exception 'Escribe por qué se archiva.';
    end if;
    new.archivado_por := auth.uid();
    new.archivado_en := now();
  end if;
  return new;
end;
$$;

-- Rollback de 20261027000060. Borra cerrada_en/cerrada_por/cierre_nota (y lo que tengan). Las
-- obras ya cerradas sin firma quedan en "cerrada" (el estado no se toca), pero sin quién y
-- cuándo. El técnico vuelve a poder escribir en visitas cerradas.

drop trigger if exists trg_visita_cierre on public.visitas;
drop function if exists public.fn_visita_cierre();

-- Candado: versión de la migración 58.
create or replace function public.fn_candado_visita()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Por jsonb: visitas no tiene columna visita_id y plpgsql fallaría al resolver old.visita_id.
  v_visita uuid := case when tg_table_name = 'visitas' then old.id
                        else (to_jsonb(old) ->> 'visita_id')::uuid end;
begin
  if current_user in ('postgres', 'supabase_admin') or not fn_visita_firmada(v_visita) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'La visita ya está firmada por el cliente: no se puede borrar. Agrega una nota posterior.';
  end if;

  if tg_table_name = 'visitas' then
    -- Nada fuera del estado cambia, y el estado solo avanza: firmada → cerrada, con
    -- Operativo. Quedarse igual (un update sin cambios) no es error.
    if (to_jsonb(new) - array['estado', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado', 'updated_at']) then
      raise exception 'La visita ya está firmada por el cliente: no se edita. Agrega una nota posterior.';
    end if;
    if new.estado is distinct from old.estado then
      if not (old.estado = 'firmada' and new.estado = 'cerrada') then
        raise exception 'Una visita firmada no vuelve atrás: de "%" no puede pasar a "%".', old.estado, new.estado;
      end if;
      if not fn_tiene_permiso('operativo', 'trabajar') then
        raise exception 'Cerrar una visita firmada requiere permiso de Operativo.';
      end if;
    end if;
    return new;
  end if;

  -- Jornadas, fotos y sugerencias: el contenido de evidencia no cambia. Un update que deja
  -- el contenido igual (reintento) pasa; lo demás de cada tabla (traslado a Drive de la
  -- foto, recorrido de la sugerencia) sí puede cambiar.
  if fn_contenido_evidencia(tg_table_name, to_jsonb(new)) is distinct from fn_contenido_evidencia(tg_table_name, to_jsonb(old)) then
    -- Migración 58: la única excepción, marcar la salida una vez con la visita "firmada".
    if tg_table_name = 'visita_jornadas'
       and (select estado from visitas where id = v_visita) = 'firmada'
       and fn_es_salida_tras_firma(to_jsonb(old), to_jsonb(new)) then
      return new;
    end if;
    raise exception 'La visita ya está firmada por el cliente: ese registro no se puede cambiar. Agrega una nota posterior.';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_candado_visita() from public, anon, authenticated;

-- Permiso de escritura: versión de la migración 45.
create or replace function public.fn_puede_escribir_visita(p_visita_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('operativo', 'trabajar')
      or (fn_tiene_permiso('tecnico', 'trabajar')
          and exists (select 1 from visitas v where v.id = p_visita_id and v.tecnico_id = auth.uid()));
$$;
revoke all on function public.fn_puede_escribir_visita(uuid) from public, anon;
grant execute on function public.fn_puede_escribir_visita(uuid) to authenticated, service_role;

alter table public.visitas drop column if exists cierre_nota;
alter table public.visitas drop column if exists cerrada_por;
alter table public.visitas drop column if exists cerrada_en;

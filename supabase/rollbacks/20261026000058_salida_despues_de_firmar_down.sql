-- Rollback de 20261026000058: el candado vuelve a la versión de la migración 49 (sin la
-- excepción de la salida después de la firma) y se borra fn_es_salida_tras_firma.
-- Ojo: con esto, una salida marcada después de la firma del cliente se vuelve a rechazar,
-- y la app (orden firmas → salida) deja de poder subirla.

create or replace function public.fn_candado_visita_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existente jsonb;
begin
  if current_user in ('postgres', 'supabase_admin') or not fn_visita_firmada(new.visita_id) then
    return new;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', tg_table_name)
    into v_existente using new.id;

  if v_existente is not null
     and fn_contenido_evidencia(tg_table_name, v_existente) = fn_contenido_evidencia(tg_table_name, to_jsonb(new)) then
    return null;  -- reintento idéntico: sin cambios
  end if;

  if v_existente is not null then
    raise exception 'La visita ya está firmada por el cliente: ese registro no se puede cambiar. Usa una nota posterior.';
  end if;
  raise exception 'La visita ya está firmada por el cliente: no se agrega nada. Usa una nota posterior.';
end;
$$;

-- ============================================================ antes de actualizar / borrar
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
    raise exception 'La visita ya está firmada por el cliente: ese registro no se puede cambiar. Agrega una nota posterior.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_candado_visita() from public, anon, authenticated;
revoke all on function public.fn_candado_visita_insert() from public, anon, authenticated;

drop function if exists public.fn_es_salida_tras_firma(jsonb, jsonb);

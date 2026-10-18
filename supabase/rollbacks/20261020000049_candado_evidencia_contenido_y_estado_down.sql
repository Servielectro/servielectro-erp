-- Deshace 20261020000049: vuelve a las funciones del candado de la migración 45
-- (con sus dos defectos conocidos: reintento idéntico rechazado y estado de una visita
-- firmada modificable). Solo para emergencias.

create or replace function public.fn_candado_visita_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') and fn_visita_firmada(new.visita_id) then
    raise exception 'La visita ya está firmada por el cliente: no se agrega nada. Usa una nota posterior.';
  end if;
  return new;
end;
$$;

create or replace function public.fn_candado_visita()
returns trigger
language plpgsql
set search_path = public
as $$
declare
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
    if (to_jsonb(new) - array['estado', 'firmada_en', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado', 'firmada_en', 'updated_at']) then
      raise exception 'La visita ya está firmada por el cliente: no se edita. Agrega una nota posterior.';
    end if;
  elsif tg_table_name = 'visita_fotos' then
    if (to_jsonb(new) - array['estado_archivo', 'drive_file_id', 'drive_url', 'drive_md5', 'movida_en', 'intentos', 'ultimo_error', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado_archivo', 'drive_file_id', 'drive_url', 'drive_md5', 'movida_en', 'intentos', 'ultimo_error', 'updated_at']) then
      raise exception 'La visita ya está firmada por el cliente: las fotos no se cambian.';
    end if;
  elsif tg_table_name = 'visita_sugerencias' then
    if (to_jsonb(new) - array['estado', 'tomada_por', 'cotizacion_id', 'motivo_descarte', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado', 'tomada_por', 'cotizacion_id', 'motivo_descarte', 'updated_at']) then
      raise exception 'La visita ya está firmada por el cliente: la sugerencia no se edita (su estado sí se puede seguir).';
    end if;
  else
    raise exception 'La visita ya está firmada por el cliente: la jornada no se edita. Agrega una nota posterior.';
  end if;
  return new;
end;
$$;

drop function if exists public.fn_contenido_evidencia(text, jsonb);

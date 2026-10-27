-- Deshace 20261116000088: vuelve las funciones de firma a como las dejaron la 75, la 83 y la 85
-- (con el filtro por permiso dentro del trigger y los mensajes de antes). Los revoke de
-- privilegios NO se deshacen (no hay razón para volver a abrirle funciones a PUBLIC).

create or replace function public.fn_sst_tecnicos_de(p_formato_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select f.tecnicos_en_obra from sst_formatos f where f.id = p_formato_id and fn_plantillas_permiso(f.ambito, 'consultar');
$$;

create or replace function public.fn_sst_hash_formato(p_formato_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to((jsonb_build_object(
    'plantilla', f.plantilla_id, 'proyecto', f.proyecto_id, 'cliente', f.cliente_id, 'lugar', f.lugar, 'fecha', f.fecha,
    'respuestas', f.respuestas,
    'archivos', coalesce((select jsonb_agg(jsonb_build_array(a.campo_id, a.sha256) order by a.path)
                          from sst_formato_archivos a where a.formato_id = f.id), '[]'::jsonb)
  ) || case when f.tecnicos_en_obra is null then '{}'::jsonb
            else jsonb_build_object('tecnicos_en_obra', f.tecnicos_en_obra) end)::text, 'UTF8')), 'hex')
  from sst_formatos f
  where f.id = p_formato_id and fn_plantillas_permiso(f.ambito, 'consultar');
$$;

create or replace function public.fn_sst_firma_reglas()
returns trigger language plpgsql set search_path = public as $$
declare
  v_falta text[];
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Una firma registrada no se cambia ni se borra.';
  end if;
  if not exists (select 1 from sst_formatos f where f.id = new.formato_id and f.estado = 'borrador') then
    raise exception 'El formato ya está cerrado: no recibe más firmas.';
  end if;
  if not fn_sst_formato_tiene_firmas(new.formato_id) then
    v_falta := fn_sst_faltantes(new.formato_id);
    if array_length(v_falta, 1) > 0 then
      raise exception 'Antes de firmar falta llenar: %.', array_to_string(v_falta, ', ');
    end if;
  end if;
  if new.firmada_en_dispositivo > now() + interval '10 minutes' then
    raise exception 'La hora de la firma en el dispositivo está adelantada: revisa el reloj del celular.';
  end if;
  new.registrada_por := auth.uid();
  new.recibida_en := now();
  new.hash_contenido := fn_sst_hash_formato(new.formato_id);
  return new;
end;
$$;

create or replace function public.fn_sst_tecnicos_firma()
returns trigger language plpgsql set search_path = public as $$
declare
  v_lista jsonb;
begin
  if current_user in ('postgres', 'supabase_admin') then
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

drop function if exists public.fn_sst_firma_existe(uuid);
drop function if exists public.fn_sst_formato_estado_ambito(uuid);

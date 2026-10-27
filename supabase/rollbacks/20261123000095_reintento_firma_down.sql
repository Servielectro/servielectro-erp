-- Deshace 20261123000095: vuelve fn_sst_firma_reglas a como la dejó la 88 (con el atajo del
-- reintento que no llenaba la fila: el reintento vuelve a fallar con hash_contenido nulo).
create or replace function public.fn_sst_firma_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_falta text[];
  v_estado text;
  v_ambito text;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Una firma registrada no se cambia ni se borra.';
  end if;
  if fn_sst_firma_existe(new.id) then
    return new;
  end if;
  select e.estado, e.ambito into v_estado, v_ambito from fn_sst_formato_estado_ambito(new.formato_id) e;
  if v_estado is null then
    raise exception 'Ese formato no existe.';
  end if;
  if not fn_plantillas_permiso(v_ambito, 'trabajar') then
    raise exception 'No tienes permiso para firmar formatos de %.', case v_ambito when 'proyectos' then 'Proyectos' else 'SG-SST' end;
  end if;
  if v_estado <> 'borrador' then
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
revoke all on function public.fn_sst_firma_reglas() from public, anon, authenticated;
drop function if exists public.fn_sst_firma_registro(uuid);

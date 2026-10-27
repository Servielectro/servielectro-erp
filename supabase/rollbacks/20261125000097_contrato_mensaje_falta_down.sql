-- Deshace 20261125000097: vuelve la función de la 93 tal cual (con el mensaje que no sale).
create or replace function public.fn_proyecto_contratos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_doc record;
  v_suma numeric;
  v_falta text[] := '{}';
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Un contrato no se borra: si cambió, se registra el otrosí como versión nueva.';
  end if;

  if new.documento_id is not null then
    select * into v_doc from fn_contrato_documento_tipo(new.documento_id);
    if v_doc.tipo is distinct from 'contrato_firmado' or v_doc.proyecto_id is distinct from new.proyecto_id then
      raise exception 'El documento del contrato tiene que ser un contrato firmado del mismo proyecto.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.estado := 'inferido';
    new.confirmado_por := null;
    new.confirmado_en := null;
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      new.creado_por := auth.uid();
    end if;
    new.creado_en := now();
    return new;
  end if;

  -- UPDATE
  if new.proyecto_id is distinct from old.proyecto_id or new.reemplaza_id is distinct from old.reemplaza_id
     or new.creado_por is distinct from old.creado_por or new.creado_en is distinct from old.creado_en then
    raise exception 'El proyecto, el contrato que reemplaza y quién lo creó no se cambian.';
  end if;

  if old.estado = 'confirmado' then
    -- Solo el otrosí, al confirmarse, lo pasa a "reemplazado" (desde su propio trigger).
    if new.estado = 'reemplazado' and pg_trigger_depth() > 1
       and (to_jsonb(new) - array['estado', 'updated_at']) = (to_jsonb(old) - array['estado', 'updated_at']) then
      return new;
    end if;
    raise exception 'El contrato confirmado no se edita: un cambio es un otrosí (versión nueva que lo reemplaza).';
  end if;
  if old.estado = 'reemplazado' then
    raise exception 'Este contrato fue reemplazado por un otrosí: no cambia.';
  end if;

  -- old.estado = 'inferido'
  if new.estado = 'reemplazado' then
    raise exception 'Un contrato sin confirmar no se reemplaza.';
  end if;
  if new.estado = 'inferido' then
    if new.confirmado_por is not null or new.confirmado_en is not null then
      raise exception 'La confirmación la registra la base al confirmar.';
    end if;
    return new;
  end if;

  -- inferido → confirmado
  if not fn_contrato_confirma() then
    raise exception 'Confirmar el contrato lo hace el responsable de Proyectos o de Comercial.';
  end if;
  if new.objeto is null or length(trim(new.objeto)) = 0 then v_falta := v_falta || 'objeto'; end if;
  if new.alcance is null or length(trim(new.alcance)) = 0 then v_falta := v_falta || 'alcance'; end if;
  if new.valor_total is null then v_falta := v_falta || 'valor total'; end if;
  if new.plazo_cantidad is null or new.plazo_unidad is null or new.plazo_inicia is null then v_falta := v_falta || 'plazo (cantidad, unidad y desde cuándo corre)'; end if;
  if new.documento_id is null then v_falta := v_falta || 'el contrato firmado (documento)'; end if;
  if array_length(v_falta, 1) > 0 then
    raise exception 'Para confirmar falta: %.', array_to_string(v_falta, ', ');
  end if;
  if new.plazo_inicia = 'otro' and length(trim(coalesce(new.plazo_inicia_detalle, ''))) = 0 then
    raise exception 'Escribe desde cuándo corre el plazo.';
  end if;
  select sum((x ->> 'porcentaje')::numeric) into v_suma
  from jsonb_array_elements(new.forma_pago) x where x ? 'porcentaje';
  if v_suma is not null and v_suma <> 100 then
    raise exception 'La forma de pago suma % %%: tiene que sumar 100 %%.', v_suma;
  end if;

  -- Un otrosí deja el anterior como reemplazado (antes de que este quede vigente).
  if new.reemplaza_id is not null then
    update proyecto_contratos set estado = 'reemplazado' where id = new.reemplaza_id and estado = 'confirmado';
  end if;
  new.confirmado_por := auth.uid();
  new.confirmado_en := now();
  return new;
end;
$$;

revoke all on function public.fn_proyecto_contratos_reglas() from public, anon, authenticated;

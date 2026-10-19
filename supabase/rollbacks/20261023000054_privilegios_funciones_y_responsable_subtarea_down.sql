-- Deshace la PARTE 2 de 20261023000054 (responsable de subtarea). Se pierden los
-- responsables cargados.
--
-- La PARTE 1 (privilegios de funciones) NO se deshace, a propósito: volver a darle EXECUTE
-- a PUBLIC reabriría la fuga de fn_persona_tiene_permiso que encontró el usuario.

drop trigger if exists trg_subtareas_reglas on public.tarea_subtareas;
drop function if exists public.fn_subtareas_reglas();
drop function if exists public.fn_validar_responsable_subtarea(uuid, uuid);
drop function if exists public.fn_puede_editar_contenido_tarea(uuid);

-- Historial de hijos: como en la 50 (sin el cambio de responsable).
create or replace function public.fn_tarea_hijos_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila jsonb;
  v_antes jsonb;
  v_accion text;
  v_tipo text;
  v_detalle jsonb;
begin
  if tg_op = 'DELETE' then
    v_fila := to_jsonb(old);
    v_accion := 'quitada';
  elsif tg_op = 'INSERT' then
    v_fila := to_jsonb(new);
    v_accion := 'agregada';
  else
    v_fila := to_jsonb(new);
    v_antes := to_jsonb(old);
    v_accion := 'editada';
  end if;

  if tg_table_name = 'tarea_asignados' then
    v_tipo := 'asignacion';
    v_detalle := jsonb_build_object(
      'accion', case when tg_op = 'DELETE' then 'quitado' else 'asignado' end,
      'perfil_id', v_fila ->> 'perfil_id',
      'nombre', (select nombre from perfiles where id = (v_fila ->> 'perfil_id')::uuid));
  elsif tg_table_name = 'tarea_subtareas' then
    if tg_op = 'UPDATE' then
      if (v_fila -> 'hecha') = (v_antes -> 'hecha') and (v_fila -> 'titulo') = (v_antes -> 'titulo') then
        return null;
      end if;
      if (v_fila ->> 'hecha')::boolean and not (v_antes ->> 'hecha')::boolean then
        v_accion := 'hecha';
      elsif not (v_fila ->> 'hecha')::boolean and (v_antes ->> 'hecha')::boolean then
        v_accion := 'reabierta';
      end if;
    end if;
    v_tipo := 'subtarea';
    v_detalle := jsonb_build_object('accion', v_accion, 'titulo', v_fila ->> 'titulo');
  else
    v_tipo := 'dependencia';
    v_detalle := jsonb_build_object('accion', v_accion,
      'bloqueante_id', v_fila ->> 'bloqueante_id', 'tipo', v_fila ->> 'tipo');
  end if;

  insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
  values ((v_fila ->> 'tarea_id')::uuid, v_tipo, v_detalle, auth.uid(), fn_nombre_actor());
  return null;
end;
$$;
revoke all on function public.fn_tarea_hijos_historial() from public, anon, authenticated;

alter table public.tarea_subtareas drop column if exists responsable_id;

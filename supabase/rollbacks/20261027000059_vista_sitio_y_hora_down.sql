-- Rollback de 20261027000059. OJO: borra las columnas nuevas y lo que tengan guardado
-- (cuándo vio cada técnico, ubicación del sitio, hora programada). Exportarlo antes si importa.

drop trigger if exists trg_visita_reasignada on public.visitas;
drop function if exists public.fn_visita_reasignada();
drop function if exists public.fn_marcar_visita_vista(uuid);
drop function if exists public.fn_marcar_tarea_vista(uuid);

-- El historial vuelve a la versión de la migración 54.
create or replace function public.fn_tarea_hijos_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila jsonb;      -- la fila afectada (la nueva, o la borrada)
  v_antes jsonb;     -- la fila anterior en un UPDATE
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
      if (v_fila -> 'hecha') = (v_antes -> 'hecha') and (v_fila -> 'titulo') = (v_antes -> 'titulo')
         and (v_fila -> 'responsable_id') is not distinct from (v_antes -> 'responsable_id') then
        return null;  -- solo cambió el orden
      end if;
      if (v_fila -> 'responsable_id') is distinct from (v_antes -> 'responsable_id') then
        v_accion := 'responsable';
      elsif (v_fila ->> 'hecha')::boolean and not (v_antes ->> 'hecha')::boolean then
        v_accion := 'hecha';
      elsif not (v_fila ->> 'hecha')::boolean and (v_antes ->> 'hecha')::boolean then
        v_accion := 'reabierta';
      end if;
    end if;
    v_tipo := 'subtarea';
    v_detalle := jsonb_build_object('accion', v_accion, 'titulo', v_fila ->> 'titulo',
      'responsable', coalesce((select nombre from perfiles where id = (v_fila ->> 'responsable_id')::uuid), 'Sin asignar'));
  else  -- tarea_dependencias
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

alter table public.visitas drop constraint if exists visitas_hora_requiere_fecha;
alter table public.visitas drop constraint if exists visitas_sitio_coordenadas;
alter table public.visitas drop constraint if exists visitas_sitio_url_maps;
alter table public.tareas drop constraint if exists tareas_sitio_coordenadas;
alter table public.tareas drop constraint if exists tareas_sitio_url_maps;

alter table public.tarea_asignados drop column if exists visto_en;
alter table public.visitas drop column if exists visto_en;
alter table public.visitas drop column if exists hora_programada;
alter table public.visitas drop column if exists sitio_lat;
alter table public.visitas drop column if exists sitio_lng;
alter table public.visitas drop column if exists sitio_url_maps;
alter table public.tareas drop column if exists sitio_direccion;
alter table public.tareas drop column if exists sitio_lat;
alter table public.tareas drop column if exists sitio_lng;
alter table public.tareas drop column if exists sitio_url_maps;

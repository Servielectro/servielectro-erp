-- Deshace 20261022000053 (compartir, grupos y transferir). Solo mientras no haya tareas
-- compartidas reales: las compartidas pasan a internas (siguen siendo de quien las creó),
-- y se borran participantes, grupos y su historial.
--
-- Las reglas de tareas vuelven a las de la 52 (internas con Planificación, equipo con
-- Operativo) y las funciones de acceso a las de la 50.

-- Sin compartidas ni participantes.
alter table public.tareas disable trigger trg_tareas_reglas;
update public.tareas set visibilidad = 'interna' where visibilidad = 'compartida';
alter table public.tareas enable trigger trg_tareas_reglas;

drop table if exists public.tarea_participantes;
drop table if exists public.grupo_eventos;
drop table if exists public.grupo_miembros;
drop table if exists public.grupos;

alter table public.tareas drop constraint if exists tareas_visibilidad_check;
alter table public.tareas add constraint tareas_visibilidad_check check (visibilidad in ('interna', 'equipo'));

-- Acceso: como en la 50.
create or replace function public.fn_puede_ver_tarea(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tareas t
    where t.id = p_tarea_id
      and (t.creada_por = auth.uid()
           or (t.visibilidad = 'equipo'
               and (fn_tiene_permiso('operativo', 'consultar') or fn_es_asignado_tarea(t.id))))
  );
$$;

create or replace function public.fn_puede_editar_tarea(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tareas t
    where t.id = p_tarea_id
      and (t.creada_por = auth.uid()
           or (t.visibilidad = 'equipo'
               and (fn_tiene_permiso('operativo', 'trabajar') or fn_es_asignado_tarea(t.id))))
  );
$$;

-- Reglas de la tarea: como en la 50.
create or replace function public.fn_tareas_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_operativo boolean := fn_tiene_permiso('operativo', 'trabajar');
  v_bloqueo text;
begin
  if new.visibilidad = 'equipo' and new.proyecto_id is null and new.visita_id is null then
    raise exception 'Una tarea de equipo tiene que colgar de un proyecto o de una visita: elige la obra.';
  end if;
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'supabase_admin') then
      new.creada_por := auth.uid();
    end if;
    if new.estado = 'hecho' then
      new.cerrada_en := now();
      new.cerrada_por := auth.uid();
    end if;
    return new;
  end if;
  if new.creada_por is distinct from old.creada_por then
    raise exception 'No se cambia quién creó la tarea.';
  end if;
  if current_user not in ('postgres', 'supabase_admin') then
    if new.visibilidad is distinct from old.visibilidad then
      if not v_operativo then
        raise exception 'Solo Operativo puede pasar una tarea entre "interna" y "equipo".';
      end if;
      if new.visibilidad = 'interna' and fn_tarea_tiene_asignados(new.id) then
        raise exception 'Quita los asignados antes de volverla interna: una tarea interna es solo de quien la creó.';
      end if;
    end if;
    if not v_operativo and old.creada_por is distinct from auth.uid() then
      if (to_jsonb(new) - array['estado', 'orden', 'cerrada_en', 'cerrada_por', 'updated_at'])
         is distinct from (to_jsonb(old) - array['estado', 'orden', 'cerrada_en', 'cerrada_por', 'updated_at']) then
        raise exception 'Como asignado solo puedes mover la tarea de columna; el resto lo cambia Operativo.';
      end if;
    end if;
  end if;
  if new.estado is distinct from old.estado and new.estado in ('en_progreso', 'hecho') then
    v_bloqueo := fn_bloqueo_tarea(new.id, new.estado);
    if v_bloqueo is not null then
      raise exception '%', v_bloqueo;
    end if;
  end if;
  if new.estado = 'hecho' and old.estado <> 'hecho' then
    new.cerrada_en := now();
    new.cerrada_por := auth.uid();
  elsif new.estado <> 'hecho' and old.estado = 'hecho' then
    new.cerrada_en := null;
    new.cerrada_por := null;
  end if;
  if new.archivada and not old.archivada then
    new.archivada_en := now();
  elsif not new.archivada then
    new.archivada_en := null;
  end if;
  return new;
end;
$$;

-- Políticas de tareas: como en la 52.
drop policy if exists tareas_select on public.tareas;
create policy tareas_select on public.tareas for select to authenticated
  using (creada_por = auth.uid()
         or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'consultar') or fn_es_asignado_tarea(id))));
drop policy if exists tareas_insert on public.tareas;
create policy tareas_insert on public.tareas for insert to authenticated
  with check (creada_por = auth.uid()
              and ((visibilidad = 'interna' and fn_tiene_permiso('planificacion', 'trabajar'))
                   or (visibilidad = 'equipo' and fn_tiene_permiso('operativo', 'trabajar'))));
drop policy if exists tareas_update on public.tareas;
create policy tareas_update on public.tareas for update to authenticated
  using (creada_por = auth.uid()
         or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'trabajar') or fn_es_asignado_tarea(id))))
  with check ((visibilidad = 'interna' and creada_por = auth.uid())
              or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'trabajar') or fn_es_asignado_tarea(id))));

drop function if exists public.fn_personas_planificacion();
drop function if exists public.fn_transferir_tareas(uuid, uuid, text);
drop function if exists public.fn_grupos_archivo();
drop function if exists public.fn_grupos_historial();
drop function if exists public.fn_grupo_miembros_reglas();
drop function if exists public.fn_tarea_participantes_historial();
drop function if exists public.fn_tarea_participantes_reglas();
drop function if exists public.fn_tarea_tiene_participantes(uuid);
drop function if exists public.fn_es_participante_tarea(uuid);
drop function if exists public.fn_persona_tiene_permiso(uuid, text, nivel_permiso);
drop function if exists public.fn_es_miembro_grupo(uuid);

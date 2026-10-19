-- Eventos: se quita la visibilidad "equipo". Quedan interna | compartida.
--
-- Decisión del 2026-10-19: la 55 la aceptaba en la base pero la pantalla nunca la ofreció.
-- Un valor que la base acepta y nadie usa es una trampa para quien lea esto después: va a
-- suponer un caso de uso que nadie pensó. Una cita es administrativa; lo de obra ya existe
-- como visita y no se duplica en el calendario. Si algún día hace falta una cita de obra,
-- se vuelve a agregar con su razón escrita.
--
-- Qué cambia:
--   - el check de eventos.visibilidad: interna | compartida.
--   - fn_puede_ver_evento y fn_eventos_reglas: sin la rama de "equipo".
--   - las políticas eventos_select / insert / update: sin la rama de "equipo".
-- Las tareas NO se tocan: ahí "equipo" es la tarea de obra y sigue.
--
-- Si existiera algún evento "equipo" la migración se detiene y no convierte nada (no debería
-- haber: la pantalla nunca lo ofreció).
--
-- Va después de la 55. Idempotente.
-- Verificación: supabase/verificaciones/20261024000056_verificar.sql
-- Rollback:     supabase/rollbacks/20261024000056_eventos_sin_equipo_down.sql

do $$
begin
  if exists (select 1 from public.eventos where visibilidad = 'equipo') then
    raise exception 'Hay eventos con visibilidad "equipo": revisarlos a mano antes de correr esta migración.';
  end if;
end $$;

-- ============================================================ 1) el valor
alter table public.eventos drop constraint if exists eventos_visibilidad_check;
alter table public.eventos add constraint eventos_visibilidad_check
  check (visibilidad in ('interna', 'compartida'));

-- ============================================================ 2) funciones
create or replace function public.fn_puede_ver_evento(p_evento_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from eventos e
    where e.id = p_evento_id
      and (e.creado_por = auth.uid()
           or (e.visibilidad = 'compartida' and fn_es_participante_evento(e.id)))
  );
$$;

-- NO definer (ver la 50): current_user tiene que ser quien llama.
create or replace function public.fn_eventos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Día completo: la hora no se usa. Medianoche de Bogotá del día de inicio y del de fin.
  if new.todo_el_dia then
    new.inicio := ((new.inicio at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota';
    new.fin := ((new.fin at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota';
  end if;

  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'supabase_admin') then
      new.creado_por := auth.uid();
    end if;
    return new;
  end if;

  if current_user not in ('postgres', 'supabase_admin') then
    if new.creado_por is distinct from old.creado_por then
      raise exception 'No se cambia quién creó el evento.';
    end if;
    if new.visibilidad is distinct from old.visibilidad
       and old.visibilidad = 'compartida' and fn_evento_tiene_participantes(new.id) then
      raise exception 'Quita a los participantes antes de cambiar con quién se comparte.';
    end if;
  end if;

  if new.archivado and not old.archivado then
    new.archivado_en := now();
  elsif not new.archivado then
    new.archivado_en := null;
  end if;
  return new;
end;
$$;

-- ============================================================ 3) políticas
drop policy if exists eventos_select on public.eventos;
create policy eventos_select on public.eventos for select to authenticated
  using (creado_por = auth.uid()
         or (visibilidad = 'compartida' and fn_es_participante_evento(id)));

drop policy if exists eventos_insert on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated
  with check (creado_por = auth.uid() and fn_tiene_permiso('planificacion', 'trabajar'));

-- Solo quien lo creó lo edita (los participantes lo ven).
drop policy if exists eventos_update on public.eventos;
create policy eventos_update on public.eventos for update to authenticated
  using (creado_por = auth.uid())
  with check (creado_por = auth.uid());

-- ============================================================ 4) privilegios de las funciones
-- create or replace conserva los permisos, pero se repiten para que el archivo diga lo que
-- queda en la base: revoke de public y anon (revocar solo de anon no alcanza); la de
-- trigger, a nadie (Postgres revisa EXECUTE al crear el trigger, no al dispararse).
revoke all on function public.fn_puede_ver_evento(uuid) from public, anon;
grant execute on function public.fn_puede_ver_evento(uuid) to authenticated, service_role;
revoke all on function public.fn_eventos_reglas() from public, anon, authenticated;

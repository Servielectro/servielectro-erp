-- Eliminar tareas de verdad, además de archivarlas (Jhojan, 2026-10-21): "debemos poder borrar
-- tareas mal asignadas… y otras archivarlas. Dejar las dos opciones."
--
--   ARCHIVAR (ya existe): cualquier tarea, reversible. Es guardar.
--   ELIMINAR (esta migración): borra la tarea y no se recupera. Es borrar. Solo:
--     - con operativo/trabajar, y viendo la tarea;
--     - si NO tiene trabajo hecho: sigue en "Por hacer" y nunca cambió de estado, no tiene
--       subtareas marcadas, no tiene notas de seguimiento, no viene de una sugerencia (que es
--       el enlace con la cotización) y ninguna otra tarea la espera. Una tarea donde alguien ya
--       trabajó se archiva, y el mensaje lo dice;
--     - con un motivo.
--   Queda el rastro de que existió en tareas_eliminadas: título, quién la creó, a quién estaba
--   asignada, quién la borró, cuándo y por qué. No puede ir en tarea_eventos: esa tabla apunta a
--   tareas y se borra con ella. Solo se inserta (desde fn_eliminar_tarea); nadie la edita ni la
--   borra; la lee Operativo.
--
-- Por qué una función y no un "delete" con política: las cinco tablas hijas apuntan a tareas
-- con "on delete restrict", y al borrar asignados, subtareas o participantes el historial anota
-- eventos nuevos de esa tarea. La función borra en orden (hijos → eventos → tarea), todo o nada.
--
-- Idempotente.
-- Verificación: supabase/verificaciones/20261028000061_verificar.sql
-- Rollback:     supabase/rollbacks/20261028000061_eliminar_tareas_down.sql

-- ============================================================ 1) el rastro
create table if not exists public.tareas_eliminadas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null,                     -- sin FK: la tarea ya no existe
  titulo text not null,
  visibilidad text,
  visita_id uuid,
  proyecto_id uuid,
  creada_por uuid,
  creada_por_nombre text,
  creada_en timestamptz,
  asignados jsonb not null default '[]'::jsonb, -- [{perfil_id, nombre}]
  eliminada_por uuid not null,
  eliminada_por_nombre text,
  eliminada_en timestamptz not null default now(),
  motivo text not null check (length(trim(motivo)) > 0)
);
create index if not exists idx_tareas_eliminadas_en on public.tareas_eliminadas (eliminada_en desc);

alter table public.tareas_eliminadas enable row level security;
revoke all on table public.tareas_eliminadas from anon;
revoke insert, update, delete, truncate, trigger, references on table public.tareas_eliminadas from authenticated;
grant select on table public.tareas_eliminadas to authenticated;

drop policy if exists tareas_eliminadas_select on public.tareas_eliminadas;
create policy tareas_eliminadas_select on public.tareas_eliminadas for select to authenticated
  using (fn_tiene_permiso('operativo', 'consultar'));

-- Nadie la edita ni la borra (además de no tener privilegios). Solo el mantenimiento de la base.
create or replace function public.fn_tareas_eliminadas_intocable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'El registro de tareas eliminadas no se edita ni se borra.';
end;
$$;
drop trigger if exists trg_tareas_eliminadas_intocable on public.tareas_eliminadas;
create trigger trg_tareas_eliminadas_intocable before update or delete on public.tareas_eliminadas
  for each row execute function public.fn_tareas_eliminadas_intocable();
revoke all on function public.fn_tareas_eliminadas_intocable() from public, anon, authenticated;

-- ============================================================ 2) eliminar
create or replace function public.fn_eliminar_tarea(p_tarea_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_asignados jsonb;
begin
  if auth.uid() is null or not fn_tiene_permiso('operativo', 'trabajar') then
    raise exception 'Eliminar tareas requiere permiso de Operativo.';
  end if;
  select * into t from tareas where id = p_tarea_id for update;
  if not found or not fn_puede_ver_tarea(p_tarea_id) then
    raise exception 'No se encontró la tarea.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Escribe por qué se elimina.';
  end if;

  -- Sin trabajo hecho. Cada caso dice por qué y ofrece archivar.
  if t.estado <> 'por_hacer' or exists (select 1 from tarea_eventos e where e.tarea_id = p_tarea_id and e.tipo = 'estado') then
    raise exception 'Esta tarea ya se movió de "Por hacer": tiene trabajo y no se elimina. Archívala (se puede recuperar).';
  end if;
  if exists (select 1 from tarea_subtareas s where s.tarea_id = p_tarea_id and s.hecha) then
    raise exception 'Esta tarea tiene subtareas marcadas: tiene trabajo y no se elimina. Archívala (se puede recuperar).';
  end if;
  if exists (select 1 from tarea_eventos e where e.tarea_id = p_tarea_id and e.tipo = 'nota') then
    raise exception 'Esta tarea tiene notas de seguimiento: tiene trabajo y no se elimina. Archívala (se puede recuperar).';
  end if;
  if t.sugerencia_id is not null then
    raise exception 'Esta tarea viene de una sugerencia (enlazada a la cotización): no se elimina. Archívala (se puede recuperar).';
  end if;
  if exists (select 1 from tarea_dependencias d where d.bloqueante_id = p_tarea_id) then
    raise exception 'Otra tarea espera a esta: no se elimina. Quita esa espera primero, o archívala.';
  end if;

  -- El rastro, antes de borrar.
  select coalesce(jsonb_agg(jsonb_build_object('perfil_id', a.perfil_id, 'nombre', p.nombre) order by p.nombre), '[]'::jsonb)
    into v_asignados
  from tarea_asignados a left join perfiles p on p.id = a.perfil_id
  where a.tarea_id = p_tarea_id;

  insert into tareas_eliminadas (tarea_id, titulo, visibilidad, visita_id, proyecto_id, creada_por, creada_por_nombre,
                                 creada_en, asignados, eliminada_por, eliminada_por_nombre, motivo)
  values (t.id, t.titulo, t.visibilidad, t.visita_id, t.proyecto_id, t.creada_por,
          (select nombre from perfiles where id = t.creada_por), t.created_at, v_asignados,
          auth.uid(), fn_nombre_actor(), trim(p_motivo));

  -- Hijos primero (sus triggers de historial anotan eventos de esta tarea), después todo el
  -- historial, y al final la tarea.
  delete from tarea_dependencias where tarea_id = p_tarea_id;
  delete from tarea_subtareas where tarea_id = p_tarea_id;
  delete from tarea_participantes where tarea_id = p_tarea_id;
  delete from tarea_asignados where tarea_id = p_tarea_id;
  delete from tarea_eventos where tarea_id = p_tarea_id;
  delete from tareas where id = p_tarea_id;
end;
$$;
revoke all on function public.fn_eliminar_tarea(uuid, text) from public, anon;
grant execute on function public.fn_eliminar_tarea(uuid, text) to authenticated;

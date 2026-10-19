-- Eventos de la Agenda (citas, reuniones, recordatorios), que conviven en el calendario con
-- las tareas con fecha. Modelo aprobado el 2026-10-23:
--
--   - eventos: título, descripción, lugar, inicio y fin (timestamptz), todo_el_dia, quién lo
--     creó, archivar (no borrar) y las dos columnas nulas de Google Calendar, igual que tareas.
--     fin >= inicio. Con todo_el_dia la hora no se usa: un trigger lleva inicio y fin a la
--     medianoche de Bogotá (sin eso, un "día completo" guardado en UTC se corre de día).
--   - VISIBILIDAD: la MISMA de las tareas (interna | compartida | equipo), no un tercer
--     modelo. La tabla de participantes es GEMELA de tarea_participantes, con las mismas
--     reglas: personas o grupos; solo personas con Planificación; por grupo, los miembros
--     ACTUALES; a un grupo archivado no se le comparte.
--       interna: quien lo creó · compartida: + sus participantes con Planificación ·
--       equipo: + quien tenga operativo/consultar (y crearlo pide operativo/trabajar).
--   - Crear pide planificacion/trabajar. Solo quien lo creó lo edita: los participantes lo
--     ven, como una invitación de calendario.
--   - Historial que solo suma (evento_historial), escrito por triggers; nadie lo toca.
--   - Sin recordatorios ni avisos (no pedidos).
--   - Funciones: revocadas de public y anon desde el primer día (la lección de la 54).
--
-- Suma fn_grupos_para_compartir(): para el formulario de compartir, los grupos activos con
-- cuántos miembros tienen y cuántos NO tienen Planificación (para avisar "esa persona no lo
-- va a ver"). Solo cantidades, no quiénes.
--
-- AGREGADO DESPUÉS de correrla (2026-10-19), sin cambiar nada de lo que hace:
--   - "equipo" se quitó de los eventos en la 56 (la pantalla nunca lo ofreció).
--   - SUPUESTO DE HORA, escrito para que no quede implícito: inicio y fin se guardan como
--     timestamptz (un instante). La pantalla convierte el día y la hora que escribe el
--     usuario con -05:00 FIJO (src/lib/eventos.ts, instanteBogota), y el trigger de día
--     completo usa 'America/Bogota'. Eso es correcto SOLO porque Colombia no tiene horario
--     de verano y todos los usuarios están en Colombia. Si Colombia adopta horario de verano,
--     o hay un usuario fuera del país, hay que pasar a guardar fecha y hora locales con su
--     `zona` (lo que espera Google Calendar) y convertir con la zona, no con un número fijo.
--     Se hará junto con la sincronización con Google Calendar.
--
-- Va después de la 53 (grupos) y la 54. Idempotente.
-- Verificación: supabase/verificaciones/20261023000055_verificar.sql
-- Rollback:     supabase/rollbacks/20261023000055_eventos_agenda_down.sql

-- ============================================================ 1) tablas
create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  descripcion text,
  lugar text,
  inicio timestamptz not null,
  fin timestamptz not null,
  todo_el_dia boolean not null default false,
  visibilidad text not null default 'interna' check (visibilidad in ('interna', 'compartida', 'equipo')),
  creado_por uuid not null default auth.uid() references auth.users (id),
  archivado boolean not null default false,
  archivado_en timestamptz,
  -- Google Calendar (futuro): referencia al evento y última sincronización.
  calendario_evento_id text,
  calendario_sincronizado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eventos_fin_despues_de_inicio check (fin >= inicio)
);
create index if not exists idx_eventos_rango on public.eventos (inicio, fin) where not archivado;
create index if not exists idx_eventos_creador on public.eventos (creado_por, inicio);

create table if not exists public.evento_participantes (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete restrict,
  perfil_id uuid references public.perfiles (id),
  grupo_id uuid references public.grupos (id),
  agregado_por uuid default auth.uid(),
  agregado_en timestamptz not null default now(),
  constraint evento_participantes_persona_o_grupo check ((perfil_id is null) <> (grupo_id is null))
);
create unique index if not exists uq_evento_participantes_persona on public.evento_participantes (evento_id, perfil_id) where perfil_id is not null;
create unique index if not exists uq_evento_participantes_grupo on public.evento_participantes (evento_id, grupo_id) where grupo_id is not null;
create index if not exists idx_evento_participantes_perfil on public.evento_participantes (perfil_id);
create index if not exists idx_evento_participantes_grupo on public.evento_participantes (grupo_id);

create table if not exists public.evento_historial (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete restrict,
  tipo text not null,      -- creado | editado | fechas | visibilidad | archivado | recuperado | participante
  detalle jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  actor_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_evento_historial on public.evento_historial (evento_id, creado_en);

drop trigger if exists trg_eventos_updated_at on public.eventos;
create trigger trg_eventos_updated_at before update on public.eventos
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 2) funciones de acceso
create or replace function public.fn_es_participante_evento(p_evento_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_tiene_permiso('planificacion', 'consultar')
     and exists (
       select 1 from evento_participantes ep
       where ep.evento_id = p_evento_id
         and (ep.perfil_id = auth.uid()
              or (ep.grupo_id is not null and fn_es_miembro_grupo(ep.grupo_id)))
     );
$$;

create or replace function public.fn_puede_ver_evento(p_evento_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from eventos e
    where e.id = p_evento_id
      and (e.creado_por = auth.uid()
           or (e.visibilidad = 'compartida' and fn_es_participante_evento(e.id))
           or (e.visibilidad = 'equipo' and fn_tiene_permiso('operativo', 'consultar')))
  );
$$;

create or replace function public.fn_evento_tiene_participantes(p_evento_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from evento_participantes ep where ep.evento_id = p_evento_id);
$$;

-- Grupos activos para compartir, con cuántos miembros NO tienen Planificación (no lo van
-- a ver). Solo cantidades.
create or replace function public.fn_grupos_para_compartir()
returns table (id uuid, nombre text, miembros integer, sin_planificacion integer)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.nombre,
         (select count(*) from grupo_miembros m where m.grupo_id = g.id)::integer,
         (select count(*) from grupo_miembros m
           where m.grupo_id = g.id and not fn_persona_tiene_permiso(m.perfil_id, 'planificacion', 'consultar'))::integer
  from grupos g
  where not g.archivado and fn_tiene_permiso('planificacion', 'trabajar')
  order by g.nombre;
$$;

-- ============================================================ 3) reglas del evento (NO definer: ver la 50)
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
    if new.visibilidad is distinct from old.visibilidad then
      if (new.visibilidad = 'equipo' or old.visibilidad = 'equipo') and not fn_tiene_permiso('operativo', 'trabajar') then
        raise exception 'Solo Operativo pasa un evento al equipo de obra o lo saca de ahí.';
      end if;
      if old.visibilidad = 'compartida' and fn_evento_tiene_participantes(new.id) then
        raise exception 'Quita a los participantes antes de cambiar con quién se comparte.';
      end if;
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

drop trigger if exists trg_eventos_reglas on public.eventos;
create trigger trg_eventos_reglas before insert or update on public.eventos
  for each row execute function public.fn_eventos_reglas();

-- Participantes: mismas reglas que en las tareas.
create or replace function public.fn_evento_participantes_reglas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select visibilidad from eventos where id = new.evento_id) <> 'compartida' then
    raise exception 'Solo se comparte un evento "compartido". Cámbialo a compartido primero.';
  end if;
  if new.perfil_id is not null and not fn_persona_tiene_permiso(new.perfil_id, 'planificacion', 'consultar') then
    raise exception 'Esa persona no tiene Planificación: no tiene agenda donde verlo.';
  end if;
  if new.grupo_id is not null and (select archivado from grupos where id = new.grupo_id) then
    raise exception 'Ese grupo está archivado: no se le comparten eventos.';
  end if;
  new.agregado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_evento_participantes_reglas on public.evento_participantes;
create trigger trg_evento_participantes_reglas before insert on public.evento_participantes
  for each row execute function public.fn_evento_participantes_reglas();

-- ============================================================ 4) historial (solo triggers)
create or replace function public.fn_eventos_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento uuid;
  v_tipo text;
  v_detalle jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'evento_participantes' then
    if tg_op = 'DELETE' then
      v_evento := old.evento_id;
      v_detalle := jsonb_build_object('accion', 'quitado', 'perfil_id', old.perfil_id, 'grupo_id', old.grupo_id,
        'nombre', coalesce((select nombre from perfiles where id = old.perfil_id), (select 'Grupo ' || nombre from grupos where id = old.grupo_id)));
    else
      v_evento := new.evento_id;
      v_detalle := jsonb_build_object('accion', 'agregado', 'perfil_id', new.perfil_id, 'grupo_id', new.grupo_id,
        'nombre', coalesce((select nombre from perfiles where id = new.perfil_id), (select 'Grupo ' || nombre from grupos where id = new.grupo_id)));
    end if;
    insert into evento_historial (evento_id, tipo, detalle, actor, actor_nombre)
    values (v_evento, 'participante', v_detalle, auth.uid(), fn_nombre_actor());
    return null;
  end if;

  -- eventos
  if tg_op = 'INSERT' then
    insert into evento_historial (evento_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'creado', jsonb_build_object('titulo', new.titulo, 'visibilidad', new.visibilidad), auth.uid(), fn_nombre_actor());
    return null;
  end if;
  if (new.inicio, new.fin, new.todo_el_dia) is distinct from (old.inicio, old.fin, old.todo_el_dia) then
    insert into evento_historial (evento_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'fechas', jsonb_build_object('de', jsonb_build_object('inicio', old.inicio, 'fin', old.fin, 'todo_el_dia', old.todo_el_dia),
                                                  'a', jsonb_build_object('inicio', new.inicio, 'fin', new.fin, 'todo_el_dia', new.todo_el_dia)),
            auth.uid(), fn_nombre_actor());
  end if;
  if (new.titulo, new.descripcion, new.lugar) is distinct from (old.titulo, old.descripcion, old.lugar) then
    insert into evento_historial (evento_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'editado', jsonb_build_object('titulo', new.titulo), auth.uid(), fn_nombre_actor());
  end if;
  if new.visibilidad is distinct from old.visibilidad then
    insert into evento_historial (evento_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'visibilidad', jsonb_build_object('de', old.visibilidad, 'a', new.visibilidad), auth.uid(), fn_nombre_actor());
  end if;
  if new.archivado is distinct from old.archivado then
    insert into evento_historial (evento_id, tipo, detalle, actor, actor_nombre)
    values (new.id, case when new.archivado then 'archivado' else 'recuperado' end, '{}'::jsonb, auth.uid(), fn_nombre_actor());
  end if;
  return null;
end;
$$;

drop trigger if exists trg_eventos_historial on public.eventos;
create trigger trg_eventos_historial after insert or update on public.eventos
  for each row execute function public.fn_eventos_historial();
drop trigger if exists trg_evento_participantes_historial on public.evento_participantes;
create trigger trg_evento_participantes_historial after insert or delete on public.evento_participantes
  for each row execute function public.fn_eventos_historial();

-- ============================================================ 5) privilegios y RLS
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['eventos', 'evento_participantes', 'evento_historial'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references on table public.%I from authenticated', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

revoke insert, update, delete on table public.evento_historial from authenticated;

-- eventos (sin delete: se archivan)
create policy eventos_select on public.eventos for select to authenticated
  using (creado_por = auth.uid()
         or (visibilidad = 'compartida' and fn_es_participante_evento(id))
         or (visibilidad = 'equipo' and fn_tiene_permiso('operativo', 'consultar')));
create policy eventos_insert on public.eventos for insert to authenticated
  with check (creado_por = auth.uid()
              and fn_tiene_permiso('planificacion', 'trabajar')
              and (visibilidad <> 'equipo' or fn_tiene_permiso('operativo', 'trabajar')));
-- Solo quien lo creó lo edita (los participantes lo ven).
create policy eventos_update on public.eventos for update to authenticated
  using (creado_por = auth.uid())
  with check (creado_por = auth.uid() and (visibilidad <> 'equipo' or fn_tiene_permiso('operativo', 'trabajar')));

create policy evento_participantes_select on public.evento_participantes for select to authenticated
  using (fn_puede_ver_evento(evento_id));
create policy evento_participantes_insert on public.evento_participantes for insert to authenticated
  with check (exists (select 1 from eventos e where e.id = evento_id and e.creado_por = auth.uid()));
create policy evento_participantes_delete on public.evento_participantes for delete to authenticated
  using (exists (select 1 from eventos e where e.id = evento_id and e.creado_por = auth.uid()));

create policy evento_historial_select on public.evento_historial for select to authenticated
  using (fn_puede_ver_evento(evento_id));

-- Funciones: revoke de public y anon (revocar solo de anon no alcanza); grant a quien la
-- necesita. Las de trigger, a nadie (Postgres revisa EXECUTE al crear el trigger).
revoke all on function public.fn_es_participante_evento(uuid) from public, anon;
revoke all on function public.fn_puede_ver_evento(uuid) from public, anon;
revoke all on function public.fn_evento_tiene_participantes(uuid) from public, anon;
revoke all on function public.fn_grupos_para_compartir() from public, anon;
grant execute on function public.fn_es_participante_evento(uuid) to authenticated, service_role;
grant execute on function public.fn_puede_ver_evento(uuid) to authenticated, service_role;
grant execute on function public.fn_evento_tiene_participantes(uuid) to authenticated, service_role;
grant execute on function public.fn_grupos_para_compartir() to authenticated;
revoke all on function public.fn_eventos_reglas() from public, anon, authenticated;
revoke all on function public.fn_evento_participantes_reglas() from public, anon, authenticated;
revoke all on function public.fn_eventos_historial() from public, anon, authenticated;

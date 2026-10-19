-- Compartir tareas de agenda con personas y grupos ("como un Google Calendar"), grupos de
-- usuarios y transferencia de tareas.
--
-- Va DESPUÉS de la 52 (necesita el módulo planificacion). Modelo aprobado el 2026-10-22:
--
-- VISIBILIDAD: interna | compartida | equipo.
--   - interna: solo quien la creó (su agenda).
--   - compartida: quien la creó y sus PARTICIPANTES, que pueden ser personas o grupos. Los
--     grupos son el atajo para no listar diez personas. La ven solo los participantes que
--     tienen Planificación (sin agenda no hay dónde verla) y, por grupo, los miembros
--     ACTUALES: quien sale del grupo deja de verla en ese momento, nada se copia a la
--     tarea. Operativo no la ve si no participa.
--   - equipo: la de obra (Operativo), sin cambios.
--
-- EDITAR una compartida: solo quien la creó cambia el contenido. Los participantes la
-- mueven de columna, marcan subtareas y comentan (lo conservador; se abre si estorba).
--
-- GRUPOS: los arma solo configuracion/responsable (un grupo reparte acceso). No se borran:
-- se archivan, y a uno archivado no se le agregan miembros ni se lo comparte. Los
-- miembros ven el grupo y quiénes están. El historial (grupo_eventos) solo suma filas: lo
-- escriben los triggers; nadie lo edita ni lo borra.
--
-- TRANSFERIR (fn_transferir_tareas): para cuando alguien se va y sus pendientes quedan en
-- una cuenta que nadie abre. La ejerce solo configuracion/responsable, exige motivo y deja
-- en el historial de CADA tarea quién la movió, desde qué cuenta y a cuál. No es una
-- puerta para leer agendas: cambia el dueño (no devuelve el contenido), y quien recibe las
-- tareas las ve porque ahora son suyas — y eso queda escrito.
--
-- GRUPO VACÍO / SALE EL ÚLTIMO MIEMBRO: quien creó la tarea la ve siempre; su usuario no
-- se puede borrar mientras tenga tareas (creada_por sin cascada). El único caso de "nadie
-- la ve" es el creador que se va con la cuenta desactivada: para eso está transferir.
--
-- Escrita sobre migraciones de esta semana (50, 51, 52), sin drift: se crearon y
-- verificaron en estos días. Idempotente.
-- Verificación: supabase/verificaciones/20261022000053_verificar.sql
-- Rollback:     supabase/rollbacks/20261022000053_compartir_tareas_y_grupos_down.sql

-- ============================================================ 1) grupos
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  creado_por uuid default auth.uid(),
  archivado boolean not null default false,
  archivado_en timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_grupos_nombre on public.grupos (lower(trim(nombre)));

create table if not exists public.grupo_miembros (
  grupo_id uuid not null references public.grupos (id) on delete restrict,
  perfil_id uuid not null references public.perfiles (id),
  agregado_por uuid default auth.uid(),
  agregado_en timestamptz not null default now(),
  primary key (grupo_id, perfil_id)
);
create index if not exists idx_grupo_miembros_perfil on public.grupo_miembros (perfil_id);

create table if not exists public.grupo_eventos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos (id) on delete restrict,
  tipo text not null,          -- creado | renombrado | archivado | desarchivado | miembro_agregado | miembro_quitado
  perfil_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  actor_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_grupo_eventos on public.grupo_eventos (grupo_id, creado_en);

-- ============================================================ 2) participantes de una tarea
alter table public.tareas drop constraint if exists tareas_visibilidad_check;
alter table public.tareas add constraint tareas_visibilidad_check
  check (visibilidad in ('interna', 'compartida', 'equipo'));

create table if not exists public.tarea_participantes (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas (id) on delete restrict,
  perfil_id uuid references public.perfiles (id),
  grupo_id uuid references public.grupos (id),
  agregado_por uuid default auth.uid(),
  agregado_en timestamptz not null default now(),
  constraint tarea_participantes_persona_o_grupo check ((perfil_id is null) <> (grupo_id is null))
);
create unique index if not exists uq_tarea_participantes_persona on public.tarea_participantes (tarea_id, perfil_id) where perfil_id is not null;
create unique index if not exists uq_tarea_participantes_grupo on public.tarea_participantes (tarea_id, grupo_id) where grupo_id is not null;
create index if not exists idx_tarea_participantes_perfil on public.tarea_participantes (perfil_id);
create index if not exists idx_tarea_participantes_grupo on public.tarea_participantes (grupo_id);

-- ============================================================ 3) funciones de acceso
create or replace function public.fn_es_miembro_grupo(p_grupo_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from grupo_miembros m where m.grupo_id = p_grupo_id and m.perfil_id = auth.uid());
$$;

-- ¿Una persona dada tiene un permiso? (para validar a quién se comparte; fn_tiene_permiso
-- solo mira al usuario actual).
create or replace function public.fn_persona_tiene_permiso(p_perfil uuid, p_modulo text, p_nivel nivel_permiso)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_nivel
      when 'consultar' then true
      when 'trabajar' then pr.nivel in ('trabajar', 'responsable')
      when 'responsable' then pr.nivel = 'responsable'
    end
    from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = p_modulo
    where p.id = p_perfil
  ), false);
$$;

-- Participa de la tarea: como persona o como miembro ACTUAL de un grupo participante, y
-- con Planificación (sin agenda no hay dónde verla).
create or replace function public.fn_es_participante_tarea(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_tiene_permiso('planificacion', 'consultar')
     and exists (
       select 1 from tarea_participantes tp
       where tp.tarea_id = p_tarea_id
         and (tp.perfil_id = auth.uid()
              or (tp.grupo_id is not null and fn_es_miembro_grupo(tp.grupo_id)))
     );
$$;

create or replace function public.fn_puede_ver_tarea(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tareas t
    where t.id = p_tarea_id
      and (t.creada_por = auth.uid()
           or (t.visibilidad = 'compartida' and fn_es_participante_tarea(t.id))
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
           or (t.visibilidad = 'compartida' and fn_es_participante_tarea(t.id))
           or (t.visibilidad = 'equipo'
               and (fn_tiene_permiso('operativo', 'trabajar') or fn_es_asignado_tarea(t.id))))
  );
$$;

create or replace function public.fn_tarea_tiene_participantes(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tarea_participantes tp where tp.tarea_id = p_tarea_id);
$$;

-- ============================================================ 4) reglas de la tarea (reemplaza la de la 50)
-- NO es security definer (ver la 50): current_user distingue al SQL Editor y a las
-- funciones definer (transferir) de un usuario de la app.
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

  -- ---- UPDATE
  if current_user not in ('postgres', 'supabase_admin') then
    -- Cambiar el dueño solo lo hace fn_transferir_tareas (que corre como postgres).
    if new.creada_por is distinct from old.creada_por then
      raise exception 'No se cambia quién creó la tarea (para eso está transferir, en Configuración).';
    end if;

    if new.visibilidad is distinct from old.visibilidad then
      -- Hacia o desde "equipo" (obra): solo Operativo.
      if (new.visibilidad = 'equipo' or old.visibilidad = 'equipo') and not v_operativo then
        raise exception 'Solo Operativo puede pasar una tarea entre su agenda y el equipo de obra.';
      end if;
      -- Entre "interna" y "compartida": solo quien la creó.
      if new.visibilidad <> 'equipo' and old.visibilidad <> 'equipo' and old.creada_por is distinct from auth.uid() then
        raise exception 'Solo quien creó la tarea decide con quién la comparte.';
      end if;
      if old.visibilidad = 'equipo' and fn_tarea_tiene_asignados(new.id) then
        raise exception 'Quita los asignados antes de sacarla del equipo.';
      end if;
      if old.visibilidad = 'compartida' and fn_tarea_tiene_participantes(new.id) then
        raise exception 'Quita a los participantes antes de volverla interna o pasarla al equipo.';
      end if;
    end if;

    -- Quien no la creó: solo la mueve de columna. Operativo además edita las de obra
    -- (equipo); en una compartida, Operativo es un participante más.
    if old.creada_por is distinct from auth.uid() and not (v_operativo and old.visibilidad = 'equipo') then
      if (to_jsonb(new) - array['estado', 'orden', 'cerrada_en', 'cerrada_por', 'updated_at'])
         is distinct from (to_jsonb(old) - array['estado', 'orden', 'cerrada_en', 'cerrada_por', 'updated_at']) then
        raise exception 'Solo puedes mover la tarea de columna; el contenido lo cambia quien la creó.';
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

-- ============================================================ 5) reglas de participantes
create or replace function public.fn_tarea_participantes_reglas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t tareas;
begin
  select * into t from tareas where id = new.tarea_id;
  if t.visibilidad <> 'compartida' then
    raise exception 'Solo se comparte una tarea "compartida". Cámbiala a compartida primero.';
  end if;
  if new.perfil_id is not null and not fn_persona_tiene_permiso(new.perfil_id, 'planificacion', 'consultar') then
    raise exception 'Esa persona no tiene Planificación: no tiene agenda donde verla.';
  end if;
  if new.grupo_id is not null and (select archivado from grupos where id = new.grupo_id) then
    raise exception 'Ese grupo está archivado: no se le comparten tareas.';
  end if;
  new.agregado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_tarea_participantes_reglas on public.tarea_participantes;
create trigger trg_tarea_participantes_reglas before insert on public.tarea_participantes
  for each row execute function public.fn_tarea_participantes_reglas();

-- Compartir y dejar de compartir quedan en el historial de la tarea.
create or replace function public.fn_tarea_participantes_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
  values (
    (v_fila ->> 'tarea_id')::uuid,
    'participante',
    jsonb_build_object(
      'accion', case when tg_op = 'DELETE' then 'quitado' else 'agregado' end,
      'perfil_id', v_fila ->> 'perfil_id',
      'grupo_id', v_fila ->> 'grupo_id',
      'nombre', coalesce(
        (select nombre from perfiles where id = (v_fila ->> 'perfil_id')::uuid),
        (select 'Grupo ' || nombre from grupos where id = (v_fila ->> 'grupo_id')::uuid))),
    auth.uid(), fn_nombre_actor());
  return null;
end;
$$;

drop trigger if exists trg_tarea_participantes_historial on public.tarea_participantes;
create trigger trg_tarea_participantes_historial after insert or delete on public.tarea_participantes
  for each row execute function public.fn_tarea_participantes_historial();

-- ============================================================ 6) reglas e historial de grupos
create or replace function public.fn_grupo_miembros_reglas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select archivado from grupos where id = new.grupo_id) then
    raise exception 'Ese grupo está archivado: no se le agregan miembros.';
  end if;
  new.agregado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_grupo_miembros_reglas on public.grupo_miembros;
create trigger trg_grupo_miembros_reglas before insert on public.grupo_miembros
  for each row execute function public.fn_grupo_miembros_reglas();

create or replace function public.fn_grupos_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_grupo uuid;
  v_perfil uuid;
  v_detalle jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'grupo_miembros' then
    if tg_op = 'DELETE' then
      v_tipo := 'miembro_quitado'; v_grupo := old.grupo_id; v_perfil := old.perfil_id;
    else
      v_tipo := 'miembro_agregado'; v_grupo := new.grupo_id; v_perfil := new.perfil_id;
    end if;
    v_detalle := jsonb_build_object('nombre', (select nombre from perfiles where id = v_perfil));
  else  -- grupos
    v_grupo := new.id;
    if tg_op = 'INSERT' then
      v_tipo := 'creado';
      v_detalle := jsonb_build_object('nombre', new.nombre);
    elsif new.archivado and not old.archivado then
      v_tipo := 'archivado';
    elsif not new.archivado and old.archivado then
      v_tipo := 'desarchivado';
    elsif new.nombre is distinct from old.nombre then
      v_tipo := 'renombrado';
      v_detalle := jsonb_build_object('de', old.nombre, 'a', new.nombre);
    else
      return null;  -- solo cambió la descripción
    end if;
  end if;
  insert into grupo_eventos (grupo_id, tipo, perfil_id, detalle, actor, actor_nombre)
  values (v_grupo, v_tipo, v_perfil, v_detalle, auth.uid(), fn_nombre_actor());
  return null;
end;
$$;

create or replace function public.fn_grupos_archivo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.archivado and not old.archivado then
    new.archivado_en := now();
  elsif not new.archivado then
    new.archivado_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_grupos_archivo on public.grupos;
create trigger trg_grupos_archivo before update on public.grupos
  for each row execute function public.fn_grupos_archivo();
drop trigger if exists trg_grupos_historial on public.grupos;
create trigger trg_grupos_historial after insert or update on public.grupos
  for each row execute function public.fn_grupos_historial();
drop trigger if exists trg_grupo_miembros_historial on public.grupo_miembros;
create trigger trg_grupo_miembros_historial after insert or delete on public.grupo_miembros
  for each row execute function public.fn_grupos_historial();

-- ============================================================ 7) transferir tareas
create or replace function public.fn_transferir_tareas(p_de uuid, p_a uuid, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_de text := (select nombre from perfiles where id = p_de);
  v_a text := (select nombre from perfiles where id = p_a);
begin
  if not fn_tiene_permiso('configuracion', 'responsable') then
    raise exception 'Transferir tareas requiere ser responsable de Configuración.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la transferencia: queda en el historial de cada tarea.';
  end if;
  if p_de is null or p_a is null or p_de = p_a then
    raise exception 'Elige dos personas distintas.';
  end if;
  if v_a is null and not exists (select 1 from perfiles where id = p_a) then
    raise exception 'La persona que recibe las tareas no existe.';
  end if;

  -- Primero el rastro en CADA tarea (quién la movió, desde qué cuenta, a cuál y por qué)…
  insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
  select t.id, 'transferida',
         jsonb_build_object('de', p_de, 'de_nombre', v_de, 'a', p_a, 'a_nombre', v_a, 'motivo', trim(p_motivo)),
         auth.uid(), fn_nombre_actor()
  from tareas t
  where t.creada_por = p_de and not t.archivada and t.estado <> 'hecho';

  -- …y después el cambio de dueño. Solo los pendientes (no las hechas ni las archivadas).
  update tareas set creada_por = p_a
  where creada_por = p_de and not archivada and estado <> 'hecho';
  get diagnostics v_n = row_count;

  -- Solo la cantidad: transferir no devuelve el contenido de las tareas.
  return v_n;
end;
$$;

-- ============================================================ 8) privilegios y RLS
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['grupos', 'grupo_miembros', 'grupo_eventos', 'tarea_participantes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references on table public.%I from authenticated', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- El historial de grupos no se escribe a mano.
revoke insert, update, delete on table public.grupo_eventos from authenticated;

-- grupos: los arma Configuración (responsable); los miembros lo ven. No se borran.
create policy grupos_select on public.grupos for select to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable') or fn_es_miembro_grupo(id));
create policy grupos_insert on public.grupos for insert to authenticated
  with check (fn_tiene_permiso('configuracion', 'responsable'));
create policy grupos_update on public.grupos for update to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable'))
  with check (fn_tiene_permiso('configuracion', 'responsable'));

-- miembros: los miembros ven quiénes están; solo Configuración agrega y quita.
create policy grupo_miembros_select on public.grupo_miembros for select to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable') or fn_es_miembro_grupo(grupo_id));
create policy grupo_miembros_insert on public.grupo_miembros for insert to authenticated
  with check (fn_tiene_permiso('configuracion', 'responsable'));
create policy grupo_miembros_delete on public.grupo_miembros for delete to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable'));

create policy grupo_eventos_select on public.grupo_eventos for select to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable') or fn_es_miembro_grupo(grupo_id));

-- participantes: quien ve la tarea ve con quién está compartida; solo quien la creó
-- comparte y deja de compartir.
create policy tarea_participantes_select on public.tarea_participantes for select to authenticated
  using (fn_puede_ver_tarea(tarea_id));
create policy tarea_participantes_insert on public.tarea_participantes for insert to authenticated
  with check (exists (select 1 from tareas t where t.id = tarea_id and t.creada_por = auth.uid()));
create policy tarea_participantes_delete on public.tarea_participantes for delete to authenticated
  using (exists (select 1 from tareas t where t.id = tarea_id and t.creada_por = auth.uid()));

-- tareas: se suma "compartida" a ver, crear y editar.
drop policy if exists tareas_select on public.tareas;
create policy tareas_select on public.tareas for select to authenticated
  using (creada_por = auth.uid()
         or (visibilidad = 'compartida' and fn_es_participante_tarea(id))
         or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'consultar') or fn_es_asignado_tarea(id))));

drop policy if exists tareas_insert on public.tareas;
create policy tareas_insert on public.tareas for insert to authenticated
  with check (
    creada_por = auth.uid()
    and (
      (visibilidad in ('interna', 'compartida') and fn_tiene_permiso('planificacion', 'trabajar'))
      or (visibilidad = 'equipo' and fn_tiene_permiso('operativo', 'trabajar'))
    )
  );

drop policy if exists tareas_update on public.tareas;
create policy tareas_update on public.tareas for update to authenticated
  using (creada_por = auth.uid()
         or (visibilidad = 'compartida' and fn_es_participante_tarea(id))
         or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'trabajar') or fn_es_asignado_tarea(id))))
  with check ((visibilidad in ('interna', 'compartida') and creada_por = auth.uid())
              or (visibilidad = 'compartida' and fn_es_participante_tarea(id))
              or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'trabajar') or fn_es_asignado_tarea(id))));

-- Funciones que la app llama.
revoke all on function public.fn_transferir_tareas(uuid, uuid, text) from public, anon;
grant execute on function public.fn_transferir_tareas(uuid, uuid, text) to authenticated;

-- Personas con quienes se puede compartir (tienen Planificación). Solo id y nombre.
create or replace function public.fn_personas_planificacion()
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(p.nombre, '(sin nombre)')
  from perfiles p
  where fn_tiene_permiso('planificacion', 'trabajar')
    and fn_persona_tiene_permiso(p.id, 'planificacion', 'consultar')
  order by 2;
$$;
revoke all on function public.fn_personas_planificacion() from public, anon;
grant execute on function public.fn_personas_planificacion() to authenticated;

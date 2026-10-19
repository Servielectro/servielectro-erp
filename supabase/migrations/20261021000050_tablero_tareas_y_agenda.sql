-- Tablero de tareas (estilo NEXGO) y agenda personal.
--
-- Escrita sobre el ESTADO REAL consultado el 2026-10-21 (estado_previo_tablero.sql):
--   - proyectos: 0 filas; se lee con comercial/consultar (trae cliente, cotización,
--     contrato). visitas: 0 filas.
--   - roles: solo Administrador y Técnicos. permisos_rol con clave (rol_id, modulo_id).
--   - no existe nada llamado tarea/agenda/subtarea/dependencia.
--   - las tablas que crea postgres ya nacen sin anon; igual se revoca explícito.
--
-- DECISIONES (aprobadas por el usuario y por Jhojan):
--   - Tres columnas fijas: estado = por_hacer | en_progreso | hecho, como valor
--     controlado (una cuarta columna sería agregar un valor, no rehacer el tablero).
--   - Visibilidad: "interna" = agenda personal de quien la creó (reemplazo de Notion).
--     NADIE más la ve, ni el administrador, ni Operativo. "equipo" = la ven quien la creó,
--     los asignados y quien tenga operativo/consultar.
--   - De qué cuelga: obligatorio proyecto o visita SOLO en las de equipo (con mensaje que
--     dice qué falta); opcional en las internas ("llamar al contador" no es de una obra).
--     No es un not null duro: con 0 proyectos y 0 visitas no se podría crear nada.
--   - Crear: cualquiera con sesión crea internas suyas (su agenda). Las de equipo, y
--     asignar, solo operativo/trabajar (Coordinador, Administrador). El técnico solo
--     crea internas.
--   - Editar una de equipo: Operativo todo; el asignado solo la mueve de columna
--     (estado y orden). Nadie cambia quién la creó.
--   - Dependencias: para_empezar (no pasa a En progreso) y para_cerrar (no pasa a Hecho)
--     hasta que la que bloquea esté Hecha. Las exige la BASE, con el título y el estado de
--     la que bloquea; si quien mueve no la puede ver, dice "1 tarea que no puedes ver" sin
--     el título. Sin ciclos.
--   - No se borran tareas: se archivan.
--   - Historial (tarea_eventos): lo escriben SOLO triggers y fn_nota_tarea. Nadie hace
--     insert, update ni delete directo, ni Operativo.
--   - Rol Coordinador: operativo/trabajar + tecnico/consultar, nada más (ni comercial ni
--     costos). Operador NO se crea todavía; la RLS va por permisos de módulo, no por nombre
--     de rol: agregarlo después es cargar sus filas de permisos.
--   - Obra en la tarjeta para quien no tiene Comercial: fn_proyectos_para_tareas()
--     devuelve SOLO id, código y nombre (como la 46 con los datos del sitio).
--   - Google Calendar: no se construye; quedan dos columnas nulas para no migrar la tabla
--     después. La hora es opcional y nula: sin hora no se inventa 00:00.
--
-- Verificación: supabase/verificaciones/20261021000050_verificar.sql
-- Rollback:     supabase/rollbacks/20261021000050_tablero_tareas_y_agenda_down.sql
-- Idempotente.

-- ============================================================ 1) rol Coordinador
insert into public.roles (nombre)
select 'Coordinador'
where not exists (select 1 from public.roles where nombre = 'Coordinador');

insert into public.permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, p.modulo, p.nivel::nivel_permiso, false
from public.roles r
cross join (values ('operativo', 'trabajar'), ('tecnico', 'consultar')) as p(modulo, nivel)
where r.nombre = 'Coordinador'
on conflict (rol_id, modulo_id) do nothing;

-- ============================================================ 2) tablas
create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  descripcion text,                                   -- "Contexto o criterio de listo"
  estado text not null default 'por_hacer' check (estado in ('por_hacer', 'en_progreso', 'hecho')),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  visibilidad text not null default 'interna' check (visibilidad in ('interna', 'equipo')),
  proyecto_id uuid references public.proyectos (id),
  visita_id uuid references public.visitas (id),
  fecha_programada date,                              -- cuándo se hace (ordena la agenda)
  hora time,                                          -- opcional; null = "en el día"
  fecha_limite date,                                  -- cuándo vence
  orden double precision not null default 0,          -- posición en la columna (fraccionario)
  sugerencia_id uuid references public.visita_sugerencias (id),
  creada_por uuid not null default auth.uid() references auth.users (id),
  cerrada_en timestamptz,
  cerrada_por uuid,
  archivada boolean not null default false,
  archivada_en timestamptz,
  -- Google Calendar (futuro): referencia al evento y última sincronización.
  calendario_evento_id text,
  calendario_sincronizado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tareas_hora_requiere_fecha check (hora is null or fecha_programada is not null)
);
create index if not exists idx_tareas_tablero on public.tareas (estado, orden) where not archivada;
create index if not exists idx_tareas_creador on public.tareas (creada_por, fecha_programada);
create index if not exists idx_tareas_proyecto on public.tareas (proyecto_id);
create index if not exists idx_tareas_visita on public.tareas (visita_id);

create table if not exists public.tarea_asignados (
  tarea_id uuid not null references public.tareas (id) on delete restrict,
  perfil_id uuid not null references public.perfiles (id),
  asignado_por uuid default auth.uid(),
  asignado_en timestamptz not null default now(),
  primary key (tarea_id, perfil_id)
);
create index if not exists idx_tarea_asignados_perfil on public.tarea_asignados (perfil_id);

create table if not exists public.tarea_subtareas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas (id) on delete restrict,
  titulo text not null check (length(trim(titulo)) > 0),
  hecha boolean not null default false,
  orden double precision not null default 0,
  hecha_por uuid,
  hecha_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_tarea_subtareas on public.tarea_subtareas (tarea_id, orden);

create table if not exists public.tarea_dependencias (
  tarea_id uuid not null references public.tareas (id) on delete restrict,       -- la bloqueada
  bloqueante_id uuid not null references public.tareas (id) on delete restrict,  -- la que bloquea
  tipo text not null default 'para_empezar' check (tipo in ('para_empezar', 'para_cerrar')),
  creada_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (tarea_id, bloqueante_id),
  constraint tarea_dependencias_no_misma check (tarea_id <> bloqueante_id)
);
create index if not exists idx_tarea_dependencias_bloqueante on public.tarea_dependencias (bloqueante_id);

create table if not exists public.tarea_eventos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas (id) on delete restrict,
  tipo text not null,      -- creada | estado | edicion | prioridad | fechas | visibilidad | obra | archivada | asignacion | subtarea | dependencia | nota
  detalle jsonb not null default '{}'::jsonb,
  nota text,
  actor uuid default auth.uid(),
  actor_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_tarea_eventos on public.tarea_eventos (tarea_id, creado_en);

drop trigger if exists trg_tareas_updated_at on public.tareas;
create trigger trg_tareas_updated_at before update on public.tareas
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 3) funciones de acceso
-- security definer: leen tareas y asignados sin pasar por su propia RLS (sin recursión).
create or replace function public.fn_es_asignado_tarea(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tarea_asignados a where a.tarea_id = p_tarea_id and a.perfil_id = auth.uid());
$$;

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

create or replace function public.fn_tarea_tiene_asignados(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tarea_asignados a where a.tarea_id = p_tarea_id);
$$;

create or replace function public.fn_nombre_actor()
returns text language sql stable security definer set search_path = public as $$
  select nombre from perfiles where id = auth.uid();
$$;

-- Etiqueta del estado para los mensajes.
create or replace function public.fn_etiqueta_estado_tarea(p_estado text)
returns text language sql immutable as $$
  select case p_estado when 'por_hacer' then 'Por hacer' when 'en_progreso' then 'En progreso'
                       when 'hecho' then 'Hecho' else p_estado end;
$$;

-- ============================================================ 4) reglas de la tarea
-- Mensaje de bloqueo de una tarea que quiere pasar a p_destino ('en_progreso' o
-- 'hecho'), o null si nada la bloquea. security definer: tiene que ver también las que
-- bloquean y el usuario NO puede ver; de esas da solo la cantidad, nunca el título.
create or replace function public.fn_bloqueo_tarea(p_tarea_id uuid, p_destino text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_visibles text[];
  v_ocultas int;
begin
  select
    array_agg(format('"%s" (%s)', b.titulo, fn_etiqueta_estado_tarea(b.estado)) order by b.titulo)
      filter (where fn_puede_ver_tarea(b.id)),
    count(*) filter (where not fn_puede_ver_tarea(b.id))
  into v_visibles, v_ocultas
  from tarea_dependencias d
  join tareas b on b.id = d.bloqueante_id
  where d.tarea_id = p_tarea_id
    and b.estado <> 'hecho'
    and (p_destino = 'hecho' or d.tipo = 'para_empezar');

  if coalesce(array_length(v_visibles, 1), 0) = 0 and coalesce(v_ocultas, 0) = 0 then
    return null;
  end if;
  return format('No puede pasar a %s: la bloquea %s.', fn_etiqueta_estado_tarea(p_destino),
    concat_ws(' y ',
      nullif(array_to_string(v_visibles, ', '), ''),
      case when v_ocultas = 1 then '1 tarea que no puedes ver'
           when v_ocultas > 1 then v_ocultas || ' tareas que no puedes ver' end));
end;
$$;

-- Reglas al crear o cambiar una tarea. NO es security definer, a propósito: corre como
-- quien hace el cambio, así current_user distingue al SQL Editor (postgres) de un usuario
-- de la app. Siendo definer, current_user sería siempre postgres y se saltaría todas las
-- reglas.
create or replace function public.fn_tareas_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_operativo boolean := fn_tiene_permiso('operativo', 'trabajar');
  v_bloqueo text;
begin
  -- De qué cuelga: obligatorio solo en las de equipo.
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
  if new.creada_por is distinct from old.creada_por then
    raise exception 'No se cambia quién creó la tarea.';
  end if;

  if current_user not in ('postgres', 'supabase_admin') then
    -- Interna → equipo (o al revés): solo Operativo. Una interna con asignados no existe.
    if new.visibilidad is distinct from old.visibilidad then
      if not v_operativo then
        raise exception 'Solo Operativo puede pasar una tarea entre "interna" y "equipo".';
      end if;
      if new.visibilidad = 'interna' and fn_tarea_tiene_asignados(new.id) then
        raise exception 'Quita los asignados antes de volverla interna: una tarea interna es solo de quien la creó.';
      end if;
    end if;
    -- El asignado que no es Operativo ni quien la creó: solo la mueve de columna.
    if not v_operativo and old.creada_por is distinct from auth.uid() then
      if (to_jsonb(new) - array['estado', 'orden', 'cerrada_en', 'cerrada_por', 'updated_at'])
         is distinct from (to_jsonb(old) - array['estado', 'orden', 'cerrada_en', 'cerrada_por', 'updated_at']) then
        raise exception 'Como asignado solo puedes mover la tarea de columna; el resto lo cambia Operativo.';
      end if;
    end if;
  end if;

  -- Dependencias: las exige la base, para todos (también el SQL Editor), con el título y
  -- el estado de la que bloquea; si quien mueve no la puede ver, sin el título.
  if new.estado is distinct from old.estado and new.estado in ('en_progreso', 'hecho') then
    v_bloqueo := fn_bloqueo_tarea(new.id, new.estado);
    if v_bloqueo is not null then
      raise exception '%', v_bloqueo;
    end if;
  end if;

  -- Cierre y archivo.
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

drop trigger if exists trg_tareas_reglas on public.tareas;
create trigger trg_tareas_reglas before insert or update on public.tareas
  for each row execute function public.fn_tareas_reglas();

-- ============================================================ 5) historial (solo triggers)
create or replace function public.fn_tareas_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := fn_nombre_actor();
begin
  if tg_op = 'INSERT' then
    insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'creada', jsonb_build_object('estado', new.estado, 'visibilidad', new.visibilidad), auth.uid(), v_nombre);
    return null;
  end if;

  if new.estado is distinct from old.estado then
    insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'estado', jsonb_build_object('de', old.estado, 'a', new.estado), auth.uid(), v_nombre);
  end if;
  if new.prioridad is distinct from old.prioridad then
    insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'prioridad', jsonb_build_object('de', old.prioridad, 'a', new.prioridad), auth.uid(), v_nombre);
  end if;
  if (new.fecha_programada, new.hora, new.fecha_limite) is distinct from (old.fecha_programada, old.hora, old.fecha_limite) then
    insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'fechas', jsonb_build_object(
      'programada', jsonb_build_object('de', old.fecha_programada, 'a', new.fecha_programada),
      'hora', jsonb_build_object('de', old.hora, 'a', new.hora),
      'limite', jsonb_build_object('de', old.fecha_limite, 'a', new.fecha_limite)), auth.uid(), v_nombre);
  end if;
  if new.visibilidad is distinct from old.visibilidad then
    insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'visibilidad', jsonb_build_object('de', old.visibilidad, 'a', new.visibilidad), auth.uid(), v_nombre);
  end if;
  if (new.proyecto_id, new.visita_id) is distinct from (old.proyecto_id, old.visita_id) then
    insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'obra', jsonb_build_object('proyecto_id', new.proyecto_id, 'visita_id', new.visita_id), auth.uid(), v_nombre);
  end if;
  if (new.titulo, new.descripcion) is distinct from (old.titulo, old.descripcion) then
    insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'edicion', jsonb_build_object('titulo', new.titulo), auth.uid(), v_nombre);
  end if;
  if new.archivada is distinct from old.archivada then
    insert into tarea_eventos (tarea_id, tipo, detalle, actor, actor_nombre)
    values (new.id, 'archivada', jsonb_build_object('archivada', new.archivada), auth.uid(), v_nombre);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_tareas_historial on public.tareas;
create trigger trg_tareas_historial after insert or update on public.tareas
  for each row execute function public.fn_tareas_historial();

-- Asignados, subtareas y dependencias también dejan rastro.
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
      if (v_fila -> 'hecha') = (v_antes -> 'hecha') and (v_fila -> 'titulo') = (v_antes -> 'titulo') then
        return null;  -- solo cambió el orden
      end if;
      if (v_fila ->> 'hecha')::boolean and not (v_antes ->> 'hecha')::boolean then
        v_accion := 'hecha';
      elsif not (v_fila ->> 'hecha')::boolean and (v_antes ->> 'hecha')::boolean then
        v_accion := 'reabierta';
      end if;
    end if;
    v_tipo := 'subtarea';
    v_detalle := jsonb_build_object('accion', v_accion, 'titulo', v_fila ->> 'titulo');
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

do $$
declare t text;
begin
  foreach t in array array['tarea_asignados', 'tarea_subtareas', 'tarea_dependencias'] loop
    execute format('drop trigger if exists trg_%s_historial on public.%I', t, t);
    execute format(
      'create trigger trg_%s_historial after insert or update or delete on public.%I for each row execute function public.fn_tarea_hijos_historial()',
      t, t);
  end loop;
end $$;

-- Nota de seguimiento al guardar: la única forma de escribir una nota en el historial.
create or replace function public.fn_nota_tarea(p_tarea_id uuid, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_puede_editar_tarea(p_tarea_id) then
    raise exception 'No puedes dejar notas en esa tarea.';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'La nota está vacía.';
  end if;
  insert into tarea_eventos (tarea_id, tipo, nota, actor, actor_nombre)
  values (p_tarea_id, 'nota', trim(p_nota), auth.uid(), fn_nombre_actor());
end;
$$;

-- ============================================================ 6) asignados: solo en tareas de equipo
create or replace function public.fn_tarea_asignados_reglas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select visibilidad from tareas where id = new.tarea_id) <> 'equipo' then
    raise exception 'Una tarea interna no se asigna: es solo de quien la creó. Pásala a "equipo" primero.';
  end if;
  new.asignado_por := auth.uid();
  return new;
end;
$$;
drop trigger if exists trg_tarea_asignados_reglas on public.tarea_asignados;
create trigger trg_tarea_asignados_reglas before insert on public.tarea_asignados
  for each row execute function public.fn_tarea_asignados_reglas();

-- ============================================================ 7) dependencias: sin ciclos
create or replace function public.fn_tarea_dependencias_sin_ciclos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ¿La bloqueante depende (directa o indirectamente) de la bloqueada?
  if exists (
    with recursive cadena(id) as (
      select d.bloqueante_id from tarea_dependencias d where d.tarea_id = new.bloqueante_id
      union
      select d.bloqueante_id from tarea_dependencias d join cadena c on d.tarea_id = c.id
    )
    select 1 from cadena where id = new.tarea_id
  ) or new.bloqueante_id = new.tarea_id then
    raise exception 'Esa dependencia arma un círculo: una de las dos ya espera a la otra.';
  end if;
  new.creada_por := auth.uid();
  return new;
end;
$$;
drop trigger if exists trg_tarea_dependencias_sin_ciclos on public.tarea_dependencias;
create trigger trg_tarea_dependencias_sin_ciclos before insert or update on public.tarea_dependencias
  for each row execute function public.fn_tarea_dependencias_sin_ciclos();

-- ============================================================ 8) listas para la pantalla
-- Obras para el tablero: SOLO id, código y nombre (nada de cliente, cotización ni
-- contrato). Operativo ve todas; los demás, solo las de tareas que pueden ver.
create or replace function public.fn_proyectos_para_tareas()
returns table (id uuid, codigo text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.codigo, p.nombre
  from proyectos p
  where fn_tiene_permiso('operativo', 'trabajar')
     or exists (select 1 from tareas t where t.proyecto_id = p.id and fn_puede_ver_tarea(t.id))
  order by p.nombre;
$$;

-- Personas a las que se puede asignar (para el formulario). Solo id y nombre.
create or replace function public.fn_personas_asignables()
returns table (id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_tiene_permiso('operativo', 'trabajar') then
    raise exception 'Asignar tareas requiere permiso de Operativo.';
  end if;
  return query
  select p.id, coalesce(p.nombre, '(sin nombre)') from perfiles p where p.rol_id is not null order by 2;
end;
$$;

-- ============================================================ 9) privilegios y RLS
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['tareas', 'tarea_asignados', 'tarea_subtareas', 'tarea_dependencias', 'tarea_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references on table public.%I from authenticated', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- El historial no se escribe a mano: ni siquiera con permiso de tabla.
revoke insert, update, delete on table public.tarea_eventos from authenticated;

-- tareas (no hay política de delete: se archivan)
create policy tareas_select on public.tareas for select to authenticated
  using (creada_por = auth.uid()
         or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'consultar') or fn_es_asignado_tarea(id))));
create policy tareas_insert on public.tareas for insert to authenticated
  with check (creada_por = auth.uid() and (visibilidad = 'interna' or fn_tiene_permiso('operativo', 'trabajar')));
create policy tareas_update on public.tareas for update to authenticated
  using (creada_por = auth.uid()
         or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'trabajar') or fn_es_asignado_tarea(id))))
  with check ((visibilidad = 'interna' and creada_por = auth.uid())
              or (visibilidad = 'equipo' and (fn_tiene_permiso('operativo', 'trabajar') or fn_es_asignado_tarea(id))));

-- asignados
create policy tarea_asignados_select on public.tarea_asignados for select to authenticated
  using (fn_puede_ver_tarea(tarea_id));
create policy tarea_asignados_insert on public.tarea_asignados for insert to authenticated
  with check (fn_tiene_permiso('operativo', 'trabajar') and fn_puede_ver_tarea(tarea_id));
create policy tarea_asignados_delete on public.tarea_asignados for delete to authenticated
  using (fn_tiene_permiso('operativo', 'trabajar') and fn_puede_ver_tarea(tarea_id));

-- subtareas
create policy tarea_subtareas_select on public.tarea_subtareas for select to authenticated
  using (fn_puede_ver_tarea(tarea_id));
create policy tarea_subtareas_insert on public.tarea_subtareas for insert to authenticated
  with check (fn_puede_editar_tarea(tarea_id));
create policy tarea_subtareas_update on public.tarea_subtareas for update to authenticated
  using (fn_puede_editar_tarea(tarea_id)) with check (fn_puede_editar_tarea(tarea_id));
create policy tarea_subtareas_delete on public.tarea_subtareas for delete to authenticated
  using (fn_puede_editar_tarea(tarea_id));

-- dependencias: hay que poder editar la bloqueada y ver la que bloquea
create policy tarea_dependencias_select on public.tarea_dependencias for select to authenticated
  using (fn_puede_ver_tarea(tarea_id));
create policy tarea_dependencias_insert on public.tarea_dependencias for insert to authenticated
  with check (fn_puede_editar_tarea(tarea_id) and fn_puede_ver_tarea(bloqueante_id));
create policy tarea_dependencias_delete on public.tarea_dependencias for delete to authenticated
  using (fn_puede_editar_tarea(tarea_id));

-- historial: solo lectura, para quien ve la tarea
create policy tarea_eventos_select on public.tarea_eventos for select to authenticated
  using (fn_puede_ver_tarea(tarea_id));

-- funciones invocables
revoke all on function public.fn_nota_tarea(uuid, text) from public, anon;
revoke all on function public.fn_proyectos_para_tareas() from public, anon;
revoke all on function public.fn_personas_asignables() from public, anon;
grant execute on function public.fn_nota_tarea(uuid, text) to authenticated;
grant execute on function public.fn_proyectos_para_tareas() to authenticated;
grant execute on function public.fn_personas_asignables() to authenticated;

-- ============================================================ privilegios de las funciones
-- AGREGADO DESPUÉS de correr esta migración, para que el archivo diga lo mismo que la base
-- (ver la 54, que lo aplica a todas): Postgres le da EXECUTE a PUBLIC a toda función nueva,
-- y revocar solo de anon NO alcanza. Se revoca de public y anon y se concede a quien la
-- necesita: authenticated (políticas, triggers que corren como el usuario, la app) y
-- service_role (traslado de fotos). Las de trigger no se conceden a nadie: Postgres revisa
-- EXECUTE al crear el trigger, no cuando se dispara.
revoke all on function public.fn_es_asignado_tarea(uuid) from public, anon;
revoke all on function public.fn_puede_ver_tarea(uuid) from public, anon;
revoke all on function public.fn_puede_editar_tarea(uuid) from public, anon;
revoke all on function public.fn_tarea_tiene_asignados(uuid) from public, anon;
revoke all on function public.fn_nombre_actor() from public, anon;
revoke all on function public.fn_etiqueta_estado_tarea(text) from public, anon;
revoke all on function public.fn_bloqueo_tarea(uuid, text) from public, anon;
grant execute on function public.fn_es_asignado_tarea(uuid) to authenticated, service_role;
grant execute on function public.fn_puede_ver_tarea(uuid) to authenticated, service_role;
grant execute on function public.fn_puede_editar_tarea(uuid) to authenticated, service_role;
grant execute on function public.fn_tarea_tiene_asignados(uuid) to authenticated, service_role;
grant execute on function public.fn_nombre_actor() to authenticated, service_role;
grant execute on function public.fn_etiqueta_estado_tarea(text) to authenticated, service_role;
grant execute on function public.fn_bloqueo_tarea(uuid, text) to authenticated, service_role;
-- de trigger: nadie
revoke all on function public.fn_tareas_reglas() from public, anon, authenticated;
revoke all on function public.fn_tareas_historial() from public, anon, authenticated;
revoke all on function public.fn_tarea_hijos_historial() from public, anon, authenticated;
revoke all on function public.fn_tarea_asignados_reglas() from public, anon, authenticated;
revoke all on function public.fn_tarea_dependencias_sin_ciclos() from public, anon, authenticated;

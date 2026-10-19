-- 1) Privilegios de TODAS las funciones de los módulos Técnico y Planificación (45 a 53).
-- 2) Responsable propio en cada subtarea (pantallazo de NEXGO: "Sin asignar" por defecto).
--
-- 1) LO QUE ENCONTRÓ EL USUARIO (2026-10-22): las funciones nuevas quedaban ejecutables por
--    anon, porque Postgres le da EXECUTE a PUBLIC a toda función nueva. La mayoría depende
--    de auth.uid() (nulo para anon) y no contesta nada; pero fn_persona_tiene_permiso
--    recibe un perfil cualquiera y contestaba sin mirar quién pregunta: un anónimo con un
--    uuid averiguaba los permisos de esa persona. El usuario lo cerró a mano en la base;
--    esta migración lo deja escrito y lo extiende a TODAS (también las de trigger).
--
--    OJO, la lección: revocar de anon NO alcanza si el privilegio viene por PUBLIC. Hay
--    que revocar de public (y de anon) y después conceder a authenticated.
--
--    Tres grupos:
--      - las que usan las políticas, los triggers que corren como el usuario, o la app:
--        revoke de public y anon, grant a authenticated (y a service_role, con la que
--        escribirá el traslado de fotos a Drive);
--      - fn_persona_tiene_permiso: nadie (solo la llaman otras funciones definer, que
--        corren como postgres);
--      - las de trigger: revoke de public y anon, sin grant (Postgres revisa EXECUTE al
--        crear el trigger, no cuando se dispara).
--
-- 2) RESPONSABLE DE LA SUBTAREA:
--    - tarea_subtareas.responsable_id (nulo = "Sin asignar").
--    - Solo quien puede cambiar el CONTENIDO de la tarea (quien la creó; en una de obra,
--      también Operativo) agrega, quita o renombra subtareas y elige su responsable. Los
--      demás (participantes, asignados) solo la marcan hecha. Lo conservador que se aprobó.
--    - El responsable tiene que poder VER la tarea (que se la hayan compartido o asignado):
--      si no, "Esa persona no ve esta tarea". No hay responsables que no se enteran.
--    - El cambio de responsable queda en el historial.
--
-- Escrita sobre las migraciones 45–53 (todas verificadas esta semana). Idempotente.
-- Verificación: supabase/verificaciones/20261023000054_verificar.sql
-- Rollback:     supabase/rollbacks/20261023000054_privilegios_funciones_y_responsable_subtarea_down.sql

-- ============================================================ 2a) columna
alter table public.tarea_subtareas add column if not exists responsable_id uuid references public.perfiles (id);

-- ============================================================ 2b) funciones de la subtarea
-- ¿Puede el usuario actual cambiar el contenido de la tarea?
create or replace function public.fn_puede_editar_contenido_tarea(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tareas t
    where t.id = p_tarea_id
      and (t.creada_por = auth.uid()
           or (t.visibilidad = 'equipo' and fn_tiene_permiso('operativo', 'trabajar')))
  );
$$;

-- Valida que el responsable vea la tarea. Exige primero que quien pregunta pueda cambiar
-- el contenido de esa tarea: no sirve para averiguar qué ve otra persona en tareas ajenas.
create or replace function public.fn_validar_responsable_subtarea(p_tarea_id uuid, p_perfil uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t tareas;
begin
  if not fn_puede_editar_contenido_tarea(p_tarea_id) then
    raise exception 'Solo quien creó la tarea elige los responsables de sus subtareas.';
  end if;
  select * into t from tareas where id = p_tarea_id;
  if not (
    t.creada_por = p_perfil
    or (t.visibilidad = 'compartida'
        and fn_persona_tiene_permiso(p_perfil, 'planificacion', 'consultar')
        and exists (
          select 1 from tarea_participantes tp
          where tp.tarea_id = p_tarea_id
            and (tp.perfil_id = p_perfil
                 or exists (select 1 from grupo_miembros m where m.grupo_id = tp.grupo_id and m.perfil_id = p_perfil))))
    or (t.visibilidad = 'equipo'
        and (fn_persona_tiene_permiso(p_perfil, 'operativo', 'consultar')
             or exists (select 1 from tarea_asignados a where a.tarea_id = p_tarea_id and a.perfil_id = p_perfil)))
  ) then
    raise exception 'Esa persona no ve esta tarea: compártesela o asígnasela primero.';
  end if;
end;
$$;

-- Reglas de las subtareas. NO es security definer (current_user distingue al SQL Editor).
create or replace function public.fn_subtareas_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tarea uuid := case when tg_op = 'DELETE' then old.tarea_id else new.tarea_id end;
  v_contenido boolean;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_contenido := fn_puede_editar_contenido_tarea(v_tarea);

  if tg_op in ('INSERT', 'DELETE') and not v_contenido then
    raise exception 'Solo quien creó la tarea agrega o quita subtareas; tú puedes marcarlas.';
  end if;
  if tg_op = 'UPDATE' and not v_contenido
     and (new.titulo is distinct from old.titulo
          or new.responsable_id is distinct from old.responsable_id
          or new.tarea_id is distinct from old.tarea_id) then
    raise exception 'Solo puedes marcar la subtarea; el resto lo cambia quien creó la tarea.';
  end if;

  if tg_op <> 'DELETE' and new.responsable_id is not null
     and (tg_op = 'INSERT' or new.responsable_id is distinct from old.responsable_id) then
    perform fn_validar_responsable_subtarea(new.tarea_id, new.responsable_id);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_subtareas_reglas on public.tarea_subtareas;
create trigger trg_subtareas_reglas before insert or update or delete on public.tarea_subtareas
  for each row execute function public.fn_subtareas_reglas();

-- Historial: ahora también el cambio de responsable.
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

-- ============================================================ 1) privilegios de las funciones
do $$
declare
  f text;
  -- Las usan políticas, triggers que corren como el usuario, o la app: authenticated sí.
  usuario text[] := array[
    -- Técnico (45, 46, 49)
    'fn_puede_ver_visita(uuid)', 'fn_puede_escribir_visita(uuid)', 'fn_visita_firmada(uuid)',
    'fn_visita_de_ruta(text)', 'fn_contenido_evidencia(text, jsonb)',
    'fn_cambiar_estado_sugerencia(uuid, text, text, uuid)', 'fn_tecnicos_asignables()',
    -- Tablero y agenda (50)
    'fn_es_asignado_tarea(uuid)', 'fn_puede_ver_tarea(uuid)', 'fn_puede_editar_tarea(uuid)',
    'fn_tarea_tiene_asignados(uuid)', 'fn_nombre_actor()', 'fn_etiqueta_estado_tarea(text)',
    'fn_bloqueo_tarea(uuid, text)', 'fn_nota_tarea(uuid, text)', 'fn_proyectos_para_tareas()',
    'fn_personas_asignables()',
    -- Compartir y grupos (53)
    'fn_es_miembro_grupo(uuid)', 'fn_es_participante_tarea(uuid)', 'fn_tarea_tiene_participantes(uuid)',
    'fn_transferir_tareas(uuid, uuid, text)', 'fn_personas_planificacion()',
    -- Subtareas (54)
    'fn_puede_editar_contenido_tarea(uuid)', 'fn_validar_responsable_subtarea(uuid, uuid)'
  ];
  -- Funciones de trigger: nadie las llama directo.
  disparadores text[] := array[
    'fn_candado_visita()', 'fn_candado_visita_insert()', 'fn_firma_antes()', 'fn_firma_despues()',
    'fn_sugerencia_creada()', 'fn_sugerencias_estado_protegido()', 'fn_visitas_solo_estado_tecnico()',
    'fn_tareas_reglas()', 'fn_tareas_historial()', 'fn_tarea_hijos_historial()', 'fn_tarea_asignados_reglas()',
    'fn_tarea_dependencias_sin_ciclos()', 'fn_subtarea_quien_y_cuando()', 'fn_grupo_miembros_reglas()',
    'fn_grupos_archivo()', 'fn_grupos_historial()', 'fn_tarea_participantes_historial()',
    'fn_tarea_participantes_reglas()', 'fn_subtareas_reglas()'
  ];
begin
  foreach f in array usuario loop
    execute format('revoke all on function public.%s from public, anon', f);
    -- service_role también: el traslado de fotos a Drive escribe con la clave de servicio, y
    -- los triggers que corren como quien escribe llaman a estas funciones.
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array disparadores loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- Recibe un perfil cualquiera: solo para otras funciones definer (corren como postgres).
  revoke all on function public.fn_persona_tiene_permiso(uuid, text, nivel_permiso) from public, anon, authenticated;
end $$;

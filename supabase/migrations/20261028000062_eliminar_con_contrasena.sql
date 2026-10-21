-- Eliminar de verdad (tareas y VISITAS) con contraseña, y un solo rastro de lo eliminado.
--
-- Reglas de Jhojan (2026-10-21):
--   - "Todo lo que tenga una visita de prueba o de error que vayamos a borrar, debe ser borrado.
--     El resto, debe archivarse." → eliminar aplica también a visitas, enteras.
--   - "Pongamos seguridad al borrar. Que pida la contraseña para que no sea por error, sino por
--     decisión del usuario." → eliminar exige una confirmación con contraseña reciente.
--
-- Reemplaza a la 61: si la 61 ya se corrió, sus filas pasan a elementos_eliminados y
-- tareas_eliminadas se quita; si no se corrió, esta migración alcanza sola (no hace falta la 61).
--
-- 1) elementos_eliminados: el rastro único (tarea o visita): qué era, quién lo creó, quién lo
--    borró, cuándo y por qué, más un detalle por tipo. Solo inserta (desde las funciones de
--    eliminar), nadie la edita ni la borra, la lee Operativo.
--
-- 2) Confirmación con contraseña (reautenticaciones). La contraseña NUNCA llega a la base: la
--    verifica el servidor contra Supabase Auth, del usuario de la sesión, y solo entonces
--    registra "confirmó a tal hora" con fn_reautenticacion_registrar, que únicamente puede
--    llamar la clave de servicio (el servidor). Las funciones de eliminar exigen esa marca
--    reciente (VENTANA, abajo): sin pasar por el servidor con la contraseña, no se borra nada,
--    aunque alguien llame a la base directo con su sesión.
--    Límite de intentos: 5 fallos seguidos bloquean la confirmación 15 minutos.
--    VENTANA: 5 minutos, pendiente de que Jhojan lo confirme. Mientras tanto el servidor
--    "consume" la marca después de cada borrado (fn_reautenticacion_consumir): en la práctica,
--    contraseña en cada borrado. Pasar a la ventana de 5 minutos es no consumirla; no hace falta
--    otra migración.
--
-- 3) fn_eliminar_tarea: igual que la 61 (solo sin trabajo hecho), más la contraseña y el rastro
--    nuevo.
--
-- 4) fn_eliminar_visita: borra la visita entera (jornadas, fotos, firmas, notas, sugerencias y
--    su historial) y DEVUELVE las rutas de sus archivos en el bucket "visitas", que el servidor
--    borra después por la API de Storage (por SQL no se puede). Primero la base (todo o nada),
--    después los archivos: si el almacenamiento fallara, quedan archivos sueltos —que "Archivos
--    sin visita" encuentra y borra— y no filas apuntando a archivos que ya no están.
--    No se elimina (se archiva) una visita con trabajo real:
--      - con la firma del cliente, o cerrada (es evidencia firmada / una obra terminada);
--      - con tareas (eliminarlas o archivarlas primero: tienen sus propias reglas);
--      - con una sugerencia que ya pasó a cotización;
--      - con fotos ya trasladadas a Drive (de allá no se pueden borrar desde acá).
--
-- Idempotente.
-- Verificación: supabase/verificaciones/20261028000062_verificar.sql
-- Rollback:     supabase/rollbacks/20261028000062_eliminar_con_contrasena_down.sql

-- ============================================================ 1) el rastro único
create table if not exists public.elementos_eliminados (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('tarea', 'visita')),
  elemento_id uuid not null,                 -- sin FK: ya no existe
  titulo text not null,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz,
  detalle jsonb not null default '{}'::jsonb,
  eliminado_por uuid not null,
  eliminado_por_nombre text,
  eliminado_en timestamptz not null default now(),
  motivo text not null check (length(trim(motivo)) > 0)
);
create index if not exists idx_elementos_eliminados_en on public.elementos_eliminados (eliminado_en desc);

alter table public.elementos_eliminados enable row level security;
revoke all on table public.elementos_eliminados from anon;
revoke insert, update, delete, truncate, trigger, references on table public.elementos_eliminados from authenticated;
grant select on table public.elementos_eliminados to authenticated;
drop policy if exists elementos_eliminados_select on public.elementos_eliminados;
create policy elementos_eliminados_select on public.elementos_eliminados for select to authenticated
  using (fn_tiene_permiso('operativo', 'consultar'));

create or replace function public.fn_elementos_eliminados_intocable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'El registro de eliminados no se edita ni se borra.';
end;
$$;
drop trigger if exists trg_elementos_eliminados_intocable on public.elementos_eliminados;
create trigger trg_elementos_eliminados_intocable before update or delete on public.elementos_eliminados
  for each row execute function public.fn_elementos_eliminados_intocable();
revoke all on function public.fn_elementos_eliminados_intocable() from public, anon, authenticated;

-- Si la 61 se corrió: sus filas pasan acá y la tabla vieja se quita (con su función).
do $$
begin
  if to_regclass('public.tareas_eliminadas') is not null then
    insert into public.elementos_eliminados (tipo, elemento_id, titulo, creado_por, creado_por_nombre, creado_en,
                                             detalle, eliminado_por, eliminado_por_nombre, eliminado_en, motivo)
    select 'tarea', te.tarea_id, te.titulo, te.creada_por, te.creada_por_nombre, te.creada_en,
           jsonb_build_object('visibilidad', te.visibilidad, 'visita_id', te.visita_id,
                              'proyecto_id', te.proyecto_id, 'asignados', te.asignados),
           te.eliminada_por, te.eliminada_por_nombre, te.eliminada_en, te.motivo
    from public.tareas_eliminadas te
    where not exists (select 1 from public.elementos_eliminados e where e.tipo = 'tarea' and e.elemento_id = te.tarea_id);
    drop table public.tareas_eliminadas;
  end if;
end $$;
drop function if exists public.fn_tareas_eliminadas_intocable();

-- ============================================================ 2) confirmación con contraseña
create table if not exists public.reautenticaciones (
  perfil_id uuid primary key references auth.users (id) on delete cascade,
  verificada_en timestamptz,
  fallos integer not null default 0,
  bloqueada_hasta timestamptz
);
alter table public.reautenticaciones enable row level security;   -- sin políticas: nadie la lee ni la escribe
revoke all on table public.reautenticaciones from anon, authenticated;

-- Solo el servidor (clave de servicio), DESPUÉS de verificar la contraseña contra Supabase Auth.
create or replace function public.fn_reautenticacion_registrar(p_perfil_id uuid, p_ok boolean)
returns timestamptz   -- bloqueada hasta (null = no bloqueada)
language plpgsql
security definer
set search_path = public
as $$
declare v_bloqueo timestamptz;
begin
  insert into reautenticaciones (perfil_id) values (p_perfil_id) on conflict (perfil_id) do nothing;
  if p_ok then
    update reautenticaciones set verificada_en = now(), fallos = 0, bloqueada_hasta = null where perfil_id = p_perfil_id;
    return null;
  end if;
  update reautenticaciones
     set fallos = fallos + 1,
         verificada_en = null,
         bloqueada_hasta = case when fallos + 1 >= 5 then now() + interval '15 minutes' else bloqueada_hasta end
   where perfil_id = p_perfil_id
  returning bloqueada_hasta into v_bloqueo;
  -- Al bloquear se empieza a contar de nuevo para cuando pase el bloqueo.
  update reautenticaciones set fallos = 0 where perfil_id = p_perfil_id and fallos >= 5;
  return v_bloqueo;
end;
$$;

-- ¿Está bloqueada? (el servidor lo mira ANTES de probar la contraseña)
create or replace function public.fn_reautenticacion_bloqueada_hasta(p_perfil_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select bloqueada_hasta from reautenticaciones where perfil_id = p_perfil_id and bloqueada_hasta > now();
$$;

-- Gastar la confirmación (mientras no se decida la ventana: una contraseña, un borrado).
create or replace function public.fn_reautenticacion_consumir(p_perfil_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update reautenticaciones set verificada_en = null where perfil_id = p_perfil_id;
$$;

revoke all on function public.fn_reautenticacion_registrar(uuid, boolean) from public, anon, authenticated;
revoke all on function public.fn_reautenticacion_bloqueada_hasta(uuid) from public, anon, authenticated;
revoke all on function public.fn_reautenticacion_consumir(uuid) from public, anon, authenticated;
grant execute on function public.fn_reautenticacion_registrar(uuid, boolean) to service_role;
grant execute on function public.fn_reautenticacion_bloqueada_hasta(uuid) to service_role;
grant execute on function public.fn_reautenticacion_consumir(uuid) to service_role;

-- La usan las funciones de eliminar: ¿quien llama confirmó con su contraseña hace poco?
create or replace function public.fn_reautenticado_reciente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from reautenticaciones
                 where perfil_id = auth.uid() and verificada_en > now() - interval '5 minutes');  -- VENTANA
$$;
revoke all on function public.fn_reautenticado_reciente() from public, anon;
grant execute on function public.fn_reautenticado_reciente() to authenticated;

-- ============================================================ 3) eliminar tarea
drop function if exists public.fn_eliminar_tarea(uuid, text);
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
  if not fn_reautenticado_reciente() then
    raise exception 'Para eliminar, confirma con tu contraseña.';
  end if;
  select * into t from tareas where id = p_tarea_id for update;
  if not found or not fn_puede_ver_tarea(p_tarea_id) then
    raise exception 'No se encontró la tarea.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Escribe por qué se elimina.';
  end if;

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

  select coalesce(jsonb_agg(jsonb_build_object('perfil_id', a.perfil_id, 'nombre', p.nombre) order by p.nombre), '[]'::jsonb)
    into v_asignados
  from tarea_asignados a left join perfiles p on p.id = a.perfil_id
  where a.tarea_id = p_tarea_id;

  insert into elementos_eliminados (tipo, elemento_id, titulo, creado_por, creado_por_nombre, creado_en, detalle,
                                    eliminado_por, eliminado_por_nombre, motivo)
  values ('tarea', t.id, t.titulo, t.creada_por, (select nombre from perfiles where id = t.creada_por), t.created_at,
          jsonb_build_object('visibilidad', t.visibilidad, 'visita_id', t.visita_id, 'proyecto_id', t.proyecto_id,
                             'asignados', v_asignados),
          auth.uid(), fn_nombre_actor(), trim(p_motivo));

  -- Hijos (sus triggers anotan historial de esta tarea) → historial → tarea.
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

-- ============================================================ 4) eliminar visita
-- Devuelve las rutas de sus archivos en el bucket "visitas" (fotos y firmas), para que el
-- servidor las borre por la API de Storage.
create or replace function public.fn_eliminar_visita(p_visita_id uuid, p_motivo text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_rutas text[];
  n_tareas integer;
begin
  if auth.uid() is null or not fn_tiene_permiso('operativo', 'trabajar') then
    raise exception 'Eliminar visitas requiere permiso de Operativo.';
  end if;
  if not fn_reautenticado_reciente() then
    raise exception 'Para eliminar, confirma con tu contraseña.';
  end if;
  select * into v from visitas where id = p_visita_id for update;
  if not found then
    raise exception 'No se encontró la visita.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Escribe por qué se elimina.';
  end if;

  -- Trabajo real: se archiva, no se elimina.
  if fn_visita_firmada(p_visita_id) or v.estado in ('firmada', 'cerrada') then
    raise exception 'Esta visita tiene la firma del cliente o ya se cerró: es trabajo real y no se elimina. Archívala.';
  end if;
  select count(*) into n_tareas from tareas where visita_id = p_visita_id;
  if n_tareas > 0 then
    raise exception 'Esta visita tiene % tarea(s): elimínalas o archívalas primero (tienen sus propias reglas).', n_tareas;
  end if;
  if exists (select 1 from visita_sugerencias s where s.visita_id = p_visita_id
             and (s.cotizacion_id is not null or s.estado = 'cotizada')) then
    raise exception 'Una sugerencia de esta visita ya pasó a cotización: no se elimina. Archívala.';
  end if;
  if exists (select 1 from visita_fotos f where f.visita_id = p_visita_id and f.estado_archivo <> 'supabase') then
    raise exception 'Esta visita tiene fotos ya trasladadas a Drive (de allá no se borran desde acá): no se elimina. Archívala.';
  end if;

  select coalesce(array_agg(r), '{}') into v_rutas from (
    select f.storage_path as r from visita_fotos f where f.visita_id = p_visita_id
    union
    select fi.imagen_path from visita_firmas fi where fi.visita_id = p_visita_id
  ) x;

  insert into elementos_eliminados (tipo, elemento_id, titulo, creado_por, creado_por_nombre, creado_en, detalle,
                                    eliminado_por, eliminado_por_nombre, motivo)
  values ('visita', v.id, v.titulo, v.creada_por, (select nombre from perfiles where id = v.creada_por), v.created_at,
          jsonb_build_object(
            'tipo', v.tipo, 'estado', v.estado, 'cliente_nombre', v.cliente_nombre, 'direccion', v.direccion,
            'fecha_programada', v.fecha_programada,
            'tecnico', (select nombre from perfiles where id = v.tecnico_id),
            'jornadas', (select count(*) from visita_jornadas where visita_id = p_visita_id),
            'fotos', (select count(*) from visita_fotos where visita_id = p_visita_id),
            'firmas', (select count(*) from visita_firmas where visita_id = p_visita_id),
            'sugerencias', (select count(*) from visita_sugerencias where visita_id = p_visita_id),
            'archivos', coalesce(array_length(v_rutas, 1), 0)),
          auth.uid(), fn_nombre_actor(), trim(p_motivo));

  -- Hijos de los hijos primero (fotos y sugerencias apuntan a jornadas), la visita al final.
  delete from sugerencia_eventos where sugerencia_id in (select id from visita_sugerencias where visita_id = p_visita_id);
  delete from visita_sugerencias where visita_id = p_visita_id;
  delete from visita_fotos where visita_id = p_visita_id;
  delete from visita_firmas where visita_id = p_visita_id;
  delete from visita_notas_posteriores where visita_id = p_visita_id;
  delete from visita_jornadas where visita_id = p_visita_id;
  delete from visitas where id = p_visita_id;
  return v_rutas;
end;
$$;
revoke all on function public.fn_eliminar_visita(uuid, text) from public, anon;
grant execute on function public.fn_eliminar_visita(uuid, text) to authenticated;

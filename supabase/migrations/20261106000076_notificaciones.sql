-- Notificaciones (2026-10-26). Dictado por Jhojan: "para los técnicos cuando se les asigne una tarea
-- nueva, se les apruebe un abono o un permiso. igual para mí, cuando llegue una solicitud de
-- permiso, abono y otras cosas."
--
-- Reglas:
--   - Las genera la BASE con disparadores sobre los eventos reales, no la pantalla: un cambio hecho
--     desde otro lado (o por SQL) también avisa.
--   - Cada quien ve SOLO las suyas (ni RRHH ni el administrador ven las ajenas) y solo marca como
--     leídas las propias (la única columna que puede cambiar). Nadie las inserta desde la app.
--   - El texto no lleva montos ni datos sensibles: "Te aprobaron un abono"; el valor se ve al entrar.
--     Si mañana salen en la pantalla de bloqueo del celular, no se filtra la plata de nadie.
--   - Nadie se notifica a sí mismo por lo que él mismo hizo.
--   - Preferencias por persona y por tipo. Cada tipo trae su valor por defecto; "gasto registrado"
--     (para RRHH) viene APAGADA: son muchas y volverían ruido.
--   - Push al celular: PREPARADO, NO encendido. notificacion_suscripciones guarda el dispositivo
--     de cada quien y push_enviada_en marca lo enviado; un proceso aparte (después) envía lo que
--     falte. La lista dentro de la app sigue siendo la fuente de verdad.
--
-- Cómo insertan los disparadores sin abrir la tabla: las funciones de disparador NO son security
-- definer (como siempre). Llaman a fn_notificar, que sí lo es, pero que SOLO funciona dentro de un
-- disparador (pg_trigger_depth() > 0): llamada desde la app, se niega. Lo mismo las que leen a
-- quién avisar (aprobadores, RRHH, miembros de un grupo), que el técnico no puede leer.
--
-- Verificación: supabase/verificaciones/20261106000076_verificar.sql
-- Rollback:     supabase/rollbacks/20261106000076_notificaciones_down.sql
-- Idempotente.

-- ============================================================ 1) tipos (catálogo)
create table if not exists public.notificacion_tipos (
  id text primary key,
  nombre text not null,
  descripcion text not null,
  para text not null check (para in ('tecnico', 'aprobador', 'rrhh')),
  por_defecto boolean not null default true,
  orden int not null default 0
);
insert into public.notificacion_tipos (id, nombre, descripcion, para, por_defecto, orden) values
  ('tarea_asignada', 'Tarea asignada', 'Te asignan (o te reasignan) una tarea.', 'tecnico', true, 1),
  ('tarea_compartida', 'Tarea compartida', 'Te comparten una tarea, a ti o a un grupo tuyo.', 'tecnico', true, 2),
  ('abono_decidido', 'Abono aprobado o rechazado', 'Tu abono de nómina fue aprobado o rechazado.', 'tecnico', true, 3),
  ('abono_desembolsado', 'Abono transferido', 'Te transfirieron un abono de nómina.', 'tecnico', true, 4),
  ('permiso_decidido', 'Permiso aprobado o rechazado', 'Tu permiso fue aprobado o rechazado.', 'tecnico', true, 5),
  ('gasto_observado', 'Gasto observado', 'RRHH te devolvió un gasto para corregir.', 'tecnico', true, 6),
  ('documento_nuevo', 'Documento nuevo', 'Te publicaron un documento (desprendible, liquidación, contrato…).', 'tecnico', true, 7),
  ('caja_menor', 'Caja menor', 'Te asignaron o te cerraron una caja menor.', 'tecnico', true, 8),
  ('permiso_solicitado', 'Permiso solicitado', 'Alguien pidió un permiso (para quien aprueba).', 'aprobador', true, 20),
  ('abono_solicitado', 'Abono solicitado', 'Alguien pidió un abono (para quien aprueba). Las calamidades para hoy llegan marcadas urgentes.', 'aprobador', true, 21),
  ('gasto_registrado', 'Gasto o transporte registrado', 'Un técnico registró un gasto o transporte (para RRHH). Viene apagada: son muchas.', 'rrhh', false, 30)
on conflict (id) do update set
  nombre = excluded.nombre, descripcion = excluded.descripcion, para = excluded.para,
  por_defecto = excluded.por_defecto, orden = excluded.orden;

-- ============================================================ 2) notificaciones
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.perfiles (id) on delete cascade,  -- no es evidencia: se va con el usuario
  tipo text not null references public.notificacion_tipos (id),
  titulo text not null check (length(trim(titulo)) > 0),
  cuerpo text,
  ruta text,                               -- a dónde lleva al tocarla
  urgente boolean not null default false,
  origen_tabla text,
  origen_id uuid,
  creada_en timestamptz not null default now(),
  leida_en timestamptz,
  push_enviada_en timestamptz,             -- para el aviso al celular (todavía apagado)
  check (ruta is null or ruta like '/%')
);
create index if not exists idx_notificaciones_destinatario on public.notificaciones (destinatario_id, creada_en desc);
create index if not exists idx_notificaciones_no_leidas on public.notificaciones (destinatario_id) where leida_en is null;
create index if not exists idx_notificaciones_push on public.notificaciones (creada_en) where push_enviada_en is null;

create table if not exists public.notificacion_preferencias (
  perfil_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  tipo text not null references public.notificacion_tipos (id),
  activa boolean not null,
  actualizada_en timestamptz not null default now(),
  primary key (perfil_id, tipo)
);

-- Un dispositivo por fila (Web Push). Todavía no se envía nada.
create table if not exists public.notificacion_suscripciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  creada_en timestamptz not null default now(),
  revocada_en timestamptz
);
create index if not exists idx_notif_suscripciones on public.notificacion_suscripciones (perfil_id) where revocada_en is null;

-- ============================================================ 3) quién recibe, y el envío
create or replace function public.fn_notificar(
  p_destinatario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_ruta text,
  p_origen_tabla text, p_origen_id uuid, p_urgente boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() = 0 then
    raise exception 'Las notificaciones las genera la base; no se crean a mano.';
  end if;
  if p_destinatario is null or p_destinatario = auth.uid() then
    return;  -- nadie se avisa a sí mismo de lo que él hizo
  end if;
  if not exists (select 1 from perfiles where id = p_destinatario) then
    return;
  end if;
  if not coalesce(
       (select activa from notificacion_preferencias where perfil_id = p_destinatario and tipo = p_tipo),
       (select por_defecto from notificacion_tipos where id = p_tipo), true) then
    return;
  end if;
  -- Un aviso que falla nunca tumba lo que sí pasó (aprobar, asignar, observar…): se anota y sigue.
  begin
    insert into notificaciones (destinatario_id, tipo, titulo, cuerpo, ruta, urgente, origen_tabla, origen_id)
    values (p_destinatario, p_tipo, coalesce(nullif(trim(p_titulo), ''), 'Aviso'), p_cuerpo, p_ruta, coalesce(p_urgente, false), p_origen_tabla, p_origen_id);
  exception when others then
    raise warning 'No se pudo crear la notificación % para %: %', p_tipo, p_destinatario, sqlerrm;
  end;
end;
$$;

/** Nombre de una persona, para el texto ("Camilo pidió un permiso"). Solo dentro de un disparador. */
create or replace function public.fn_notif_nombre(p_perfil uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when pg_trigger_depth() > 0 then coalesce(nullif(trim(nombre), ''), 'Alguien') end
  from perfiles where id = p_perfil;
$$;

/** Los aprobadores de permisos o abonos. Solo dentro de un disparador. */
create or replace function public.fn_notif_aprobadores(p_que text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.perfil_id from rrhh_aprobadores a
  where pg_trigger_depth() > 0
    and case p_que when 'permisos' then a.aprueba_permisos when 'abonos' then a.aprueba_abonos else false end;
$$;

/** Quienes tienen un módulo en un nivel (ej. RRHH "trabajar"). Solo dentro de un disparador. */
create or replace function public.fn_notif_con_permiso(p_modulo text, p_nivel nivel_permiso)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = p_modulo
  where pg_trigger_depth() > 0
    and case p_nivel when 'consultar' then true
                     when 'trabajar' then pr.nivel in ('trabajar', 'responsable')
                     else pr.nivel = 'responsable' end;
$$;

/** Miembros de un grupo. Solo dentro de un disparador. */
create or replace function public.fn_notif_miembros_grupo(p_grupo uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.perfil_id from grupo_miembros m where pg_trigger_depth() > 0 and m.grupo_id = p_grupo;
$$;

/** El usuario de una ficha de empleado (caja menor). Solo dentro de un disparador. */
create or replace function public.fn_notif_perfil_de_empleado(p_empleado uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select perfil_id from empleados where pg_trigger_depth() > 0 and id = p_empleado;
$$;

/** Dónde ve la tarea esa persona: Planificación (internas y compartidas), Operativo o la app del técnico. */
create or replace function public.fn_notif_ruta_tarea(p_perfil uuid, p_visibilidad text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when pg_trigger_depth() = 0 then null
    when p_visibilidad in ('interna', 'compartida') and exists (select 1 from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id
                                               where p.id = p_perfil and pr.modulo_id = 'planificacion' and pr.nivel in ('trabajar', 'responsable'))
      then '/planificacion'
    when exists (select 1 from perfiles p join permisos_rol pr on pr.rol_id = p.rol_id
                 where p.id = p_perfil and pr.modulo_id = 'operativo')
      then '/operativo/tareas'
    else '/tecnico'
  end;
$$;

-- ============================================================ 4) los eventos
-- 4a) Tareas: asignada (o reasignada: es un asignado nuevo).
create or replace function public.fn_notif_tarea_asignada()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_titulo text;
  v_visibilidad text;
begin
  select titulo, visibilidad into v_titulo, v_visibilidad from tareas where id = new.tarea_id;
  perform fn_notificar(new.perfil_id, 'tarea_asignada', 'Te asignaron una tarea', v_titulo,
                       fn_notif_ruta_tarea(new.perfil_id, v_visibilidad), 'tareas', new.tarea_id);
  return new;
end;
$$;
drop trigger if exists trg_notif_tarea_asignada on public.tarea_asignados;
create trigger trg_notif_tarea_asignada after insert on public.tarea_asignados
  for each row execute function public.fn_notif_tarea_asignada();

-- 4b) Tareas: compartida con una persona o con un grupo (cada miembro).
create or replace function public.fn_notif_tarea_compartida()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_titulo text;
  v_visibilidad text;
  v_perfil uuid;
begin
  select titulo, visibilidad into v_titulo, v_visibilidad from tareas where id = new.tarea_id;
  if new.perfil_id is not null then
    perform fn_notificar(new.perfil_id, 'tarea_compartida', 'Te compartieron una tarea', v_titulo,
                         fn_notif_ruta_tarea(new.perfil_id, v_visibilidad), 'tareas', new.tarea_id);
  else
    for v_perfil in select * from fn_notif_miembros_grupo(new.grupo_id) loop
      perform fn_notificar(v_perfil, 'tarea_compartida', 'Compartieron una tarea con tu grupo', v_titulo,
                           fn_notif_ruta_tarea(v_perfil, v_visibilidad), 'tareas', new.tarea_id);
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notif_tarea_compartida on public.tarea_participantes;
create trigger trg_notif_tarea_compartida after insert on public.tarea_participantes
  for each row execute function public.fn_notif_tarea_compartida();

-- 4c) Abonos: pedido (al aprobador, urgente si es calamidad para hoy) y decidido/transferido (al dueño).
create or replace function public.fn_notif_abono()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_aprobador uuid;
  v_urgente boolean;
begin
  if tg_op = 'INSERT' then
    v_urgente := new.urgencia_calamidad and new.fecha_requerida <= (now() at time zone 'America/Bogota')::date;
    for v_aprobador in select * from fn_notif_aprobadores('abonos') loop
      perform fn_notificar(v_aprobador, 'abono_solicitado',
        case when v_urgente then 'URGENTE: abono por calamidad doméstica para hoy' else 'Pidieron un abono de nómina' end,
        fn_notif_nombre(new.persona_id) || ' pidió un abono' ||
          case when v_urgente then ' por calamidad doméstica, para hoy.' else '.' end,
        '/rrhh/abonos', 'abonos', new.id, v_urgente);
    end loop;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'aprobado' then
      perform fn_notificar(new.persona_id, 'abono_decidido', 'Te aprobaron un abono', 'Entra para ver cuánto y cuándo se transfiere.', '/tecnico/abonos', 'abonos', new.id);
    elsif new.estado = 'rechazado' then
      perform fn_notificar(new.persona_id, 'abono_decidido', 'Tu abono fue rechazado', 'Entra para ver el motivo.', '/tecnico/abonos', 'abonos', new.id);
    elsif new.estado = 'desembolsado' then
      perform fn_notificar(new.persona_id, 'abono_desembolsado', 'Te transfirieron un abono', 'Entra para ver el comprobante y la quincena del descuento.', '/tecnico/abonos', 'abonos', new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notif_abono on public.abonos;
create trigger trg_notif_abono after insert or update of estado on public.abonos
  for each row execute function public.fn_notif_abono();

-- 4d) Permisos: pedido (al aprobador) y decidido (al dueño).
create or replace function public.fn_notif_permiso()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_aprobador uuid;
  v_urgente boolean;
begin
  if tg_op = 'INSERT' then
    v_urgente := new.tipo = 'calamidad_domestica' and new.desde <= (now() at time zone 'America/Bogota')::date;
    for v_aprobador in select * from fn_notif_aprobadores('permisos') loop
      perform fn_notificar(v_aprobador, 'permiso_solicitado',
        case when v_urgente then 'URGENTE: permiso por calamidad doméstica para hoy' else 'Pidieron un permiso' end,
        fn_notif_nombre(new.persona_id) || ' pidió permiso ' ||
          case when new.desde = new.hasta then 'para el ' || to_char(new.desde, 'DD/MM') else 'del ' || to_char(new.desde, 'DD/MM') || ' al ' || to_char(new.hasta, 'DD/MM') end || '.',
        '/rrhh/permisos', 'permisos_laborales', new.id, v_urgente);
    end loop;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'aprobado' then
      perform fn_notificar(new.persona_id, 'permiso_decidido', 'Te aprobaron un permiso',
        'Para ' || case when new.desde = new.hasta then 'el ' || to_char(new.desde, 'DD/MM') else 'del ' || to_char(new.desde, 'DD/MM') || ' al ' || to_char(new.hasta, 'DD/MM') end || '.',
        '/tecnico/permisos', 'permisos_laborales', new.id);
    elsif new.estado = 'rechazado' then
      perform fn_notificar(new.persona_id, 'permiso_decidido', 'Tu permiso fue rechazado', 'Entra para ver el motivo.', '/tecnico/permisos', 'permisos_laborales', new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notif_permiso on public.permisos_laborales;
create trigger trg_notif_permiso after insert or update of estado on public.permisos_laborales
  for each row execute function public.fn_notif_permiso();

-- 4e) Gastos: observado por RRHH (al técnico) y registrado (a RRHH, apagada por defecto).
create or replace function public.fn_notif_gasto()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rrhh uuid;
begin
  if tg_op = 'INSERT' then
    for v_rrhh in select * from fn_notif_con_permiso('rrhh', 'trabajar') loop
      perform fn_notificar(v_rrhh, 'gasto_registrado',
        case new.tipo when 'transporte' then 'Transporte registrado' else 'Gasto registrado' end,
        fn_notif_nombre(new.persona_id) || ' registró ' || case new.tipo when 'transporte' then 'un transporte.' else 'un gasto.' end,
        '/rrhh/gastos', 'gastos', new.id);
    end loop;
    return new;
  end if;
  if new.estado = 'observado' and old.estado is distinct from 'observado' then
    perform fn_notificar(new.persona_id, 'gasto_observado', 'RRHH te devolvió un gasto para corregir',
      'Entra para ver qué hay que corregir.', '/tecnico/gastos', 'gastos', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notif_gasto on public.gastos;
create trigger trg_notif_gasto after insert or update of estado on public.gastos
  for each row execute function public.fn_notif_gasto();

-- 4f) Documento nuevo para la persona (y si pide firma, lo dice).
create or replace function public.fn_notif_documento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform fn_notificar(new.persona_id, 'documento_nuevo',
    case new.tipo when 'desprendible' then 'Tienes un desprendible nuevo'
                  when 'liquidacion' then 'Tienes una liquidación nueva'
                  when 'contrato' then 'Tienes un contrato nuevo'
                  else 'Tienes un documento nuevo' end
      || case when new.requiere_firma then ' para firmar' else '' end,
    new.titulo || case when new.requiere_firma then ' · pide tu firma.' else '' end,
    '/tecnico/documentos', 'documentos_personal', new.id, new.requiere_firma);
  return new;
end;
$$;
drop trigger if exists trg_notif_documento on public.documentos_personal;
create trigger trg_notif_documento after insert on public.documentos_personal
  for each row execute function public.fn_notif_documento();

-- 4g) Caja menor asignada o cerrada (al técnico de la ficha, si tiene usuario).
create or replace function public.fn_notif_caja_menor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform fn_notificar(fn_notif_perfil_de_empleado(new.empleado_id), 'caja_menor', 'Te asignaron una caja menor',
      new.concepto, '/tecnico/caja-menor', 'caja_menor_recibos', new.id);
  elsif new.estado = 'cerrada' and old.estado is distinct from 'cerrada' then
    perform fn_notificar(fn_notif_perfil_de_empleado(new.empleado_id), 'caja_menor', 'Te cerraron una caja menor',
      new.concepto, '/tecnico/caja-menor', 'caja_menor_recibos', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notif_caja_menor on public.caja_menor_recibos;
create trigger trg_notif_caja_menor after insert or update of estado on public.caja_menor_recibos
  for each row execute function public.fn_notif_caja_menor();

-- ============================================================ 5) RLS
alter table public.notificacion_tipos enable row level security;
alter table public.notificaciones enable row level security;
alter table public.notificacion_preferencias enable row level security;
alter table public.notificacion_suscripciones enable row level security;
revoke all on table public.notificacion_tipos, public.notificaciones, public.notificacion_preferencias,
  public.notificacion_suscripciones from anon;

drop policy if exists notificacion_tipos_select on public.notificacion_tipos;
create policy notificacion_tipos_select on public.notificacion_tipos for select to authenticated using (true);
revoke insert, update, delete on table public.notificacion_tipos from authenticated;

-- Cada quien las suyas, sin excepción. Solo puede cambiar leida_en.
drop policy if exists notificaciones_select on public.notificaciones;
create policy notificaciones_select on public.notificaciones for select to authenticated using (destinatario_id = auth.uid());
drop policy if exists notificaciones_update on public.notificaciones;
create policy notificaciones_update on public.notificaciones for update to authenticated
  using (destinatario_id = auth.uid()) with check (destinatario_id = auth.uid());
revoke insert, update, delete on table public.notificaciones from authenticated;
grant update (leida_en) on table public.notificaciones to authenticated;

drop policy if exists notificacion_preferencias_select on public.notificacion_preferencias;
create policy notificacion_preferencias_select on public.notificacion_preferencias for select to authenticated using (perfil_id = auth.uid());
drop policy if exists notificacion_preferencias_insert on public.notificacion_preferencias;
create policy notificacion_preferencias_insert on public.notificacion_preferencias for insert to authenticated with check (perfil_id = auth.uid());
drop policy if exists notificacion_preferencias_update on public.notificacion_preferencias;
create policy notificacion_preferencias_update on public.notificacion_preferencias for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

drop policy if exists notificacion_suscripciones_select on public.notificacion_suscripciones;
create policy notificacion_suscripciones_select on public.notificacion_suscripciones for select to authenticated using (perfil_id = auth.uid());
drop policy if exists notificacion_suscripciones_insert on public.notificacion_suscripciones;
create policy notificacion_suscripciones_insert on public.notificacion_suscripciones for insert to authenticated with check (perfil_id = auth.uid());
drop policy if exists notificacion_suscripciones_update on public.notificacion_suscripciones;
create policy notificacion_suscripciones_update on public.notificacion_suscripciones for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
revoke delete on table public.notificacion_suscripciones from authenticated;

-- ============================================================ 6) privilegios
revoke all on function public.fn_notif_tarea_asignada() from public, anon, authenticated;
revoke all on function public.fn_notif_tarea_compartida() from public, anon, authenticated;
revoke all on function public.fn_notif_abono() from public, anon, authenticated;
revoke all on function public.fn_notif_permiso() from public, anon, authenticated;
revoke all on function public.fn_notif_gasto() from public, anon, authenticated;
revoke all on function public.fn_notif_documento() from public, anon, authenticated;
revoke all on function public.fn_notif_caja_menor() from public, anon, authenticated;
-- Las auxiliares las ejecuta quien dispara el evento (por eso authenticated), pero fuera de un
-- disparador no hacen nada.
revoke all on function public.fn_notificar(uuid, text, text, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.fn_notificar(uuid, text, text, text, text, text, uuid, boolean) to authenticated, service_role;
revoke all on function public.fn_notif_nombre(uuid) from public, anon;
grant execute on function public.fn_notif_nombre(uuid) to authenticated, service_role;
revoke all on function public.fn_notif_aprobadores(text) from public, anon;
grant execute on function public.fn_notif_aprobadores(text) to authenticated, service_role;
revoke all on function public.fn_notif_con_permiso(text, nivel_permiso) from public, anon;
grant execute on function public.fn_notif_con_permiso(text, nivel_permiso) to authenticated, service_role;
revoke all on function public.fn_notif_miembros_grupo(uuid) from public, anon;
grant execute on function public.fn_notif_miembros_grupo(uuid) to authenticated, service_role;
revoke all on function public.fn_notif_perfil_de_empleado(uuid) from public, anon;
grant execute on function public.fn_notif_perfil_de_empleado(uuid) to authenticated, service_role;
revoke all on function public.fn_notif_ruta_tarea(uuid, text) from public, anon;
grant execute on function public.fn_notif_ruta_tarea(uuid, text) to authenticated, service_role;

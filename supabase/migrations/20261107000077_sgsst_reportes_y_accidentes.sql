-- SG-SST, segunda pieza (2026-10-26): reporte de acto o condición insegura, y registro de accidentes e
-- incidentes con su investigación. No dependen de los formatos de la SST (docs/sgsst-referencias-…).
-- Va DESPUÉS de la 75 (SG-SST) y la 76 (notificaciones): usa sus tablas.
--
-- 1) Reporte de acto o condición insegura: el canal que la norma exige que exista. Lo usa CUALQUIER
--    persona con sesión (el técnico no necesita el módulo SG-SST): foto, ubicación, descripción, en
--    diez segundos. Lo reportado no se edita; la gestión SST lo atiende (en gestión → cerrado, con
--    la acción tomada) y quien reportó ve en qué va. El id lo genera el dispositivo (sin señal).
-- 2) Accidentes e incidentes: el evento, a quién le pasó (de la misma tabla empleados de RRHH, o un
--    tercero por nombre), el reporte a la ARL y a la EPS (fecha y radicado, una sola vez) y la
--    investigación, que es un FORMATO del armador (la plantilla la carga la SST, no se inventa).
--    Datos de salud: NO. Ni diagnóstico ni lesión: solo qué pasó.
-- 3) Plazos (reporte a la ARL, a la EPS, investigación) como PARÁMETRO con vigencia, igual que los
--    valores de ley de RRHH: la migración crea los nombres, ningún número. Los carga la gestión SST.
--
-- Nada se borra: anulación con motivo. Avisos (76): reporte nuevo y accidente nuevo → a SG-SST
-- "trabajar"; reporte atendido o cerrado → a quien lo reportó.
--
-- Verificación: supabase/verificaciones/20261107000077_verificar.sql
-- Rollback:     supabase/rollbacks/20261107000077_sgsst_reportes_y_accidentes_down.sql
-- Idempotente.

-- ============================================================ 1) plazos como parámetro
create table if not exists public.sst_parametros (
  clave text primary key check (clave ~ '^[a-z0-9_]+$'),
  nombre text not null,
  ayuda text,
  orden int not null default 0
);
insert into public.sst_parametros (clave, nombre, ayuda, orden) values
  ('plazo_reporte_arl', 'Plazo para reportar un accidente de trabajo a la ARL', 'Desde que ocurre el accidente. Lo confirma la responsable SST con la norma vigente.', 10),
  ('plazo_reporte_eps', 'Plazo para reportar un accidente de trabajo a la EPS', 'Desde que ocurre el accidente. Lo confirma la responsable SST con la norma vigente.', 20),
  ('plazo_investigacion', 'Plazo para investigar un accidente o incidente', 'Desde que ocurre. Lo confirma la responsable SST con la norma vigente.', 30)
on conflict (clave) do update set nombre = excluded.nombre, ayuda = excluded.ayuda, orden = excluded.orden;

create table if not exists public.sst_parametro_valores (
  id uuid primary key default gen_random_uuid(),
  clave text not null references public.sst_parametros (clave),
  vigente_desde date not null,
  dias int not null check (dias > 0),
  tipo_dias text not null check (tipo_dias in ('habiles', 'calendario')),
  nota text,                         -- fuente: resolución, decreto, ARL…
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  registrado_en timestamptz not null default now()
);
create index if not exists idx_sst_parametro_valores on public.sst_parametro_valores (clave, vigente_desde desc, registrado_en desc);

create or replace function public.fn_sst_parametro_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Un plazo registrado no se cambia ni se borra: registra el correcto con su fecha de vigencia.';
  end if;
  new.registrado_por := auth.uid();
  new.registrado_en := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists trg_sst_parametro_reglas on public.sst_parametro_valores;
create trigger trg_sst_parametro_reglas
  before insert or update or delete on public.sst_parametro_valores
  for each row execute function public.fn_sst_parametro_reglas();

create or replace function public.fn_sst_plazos(p_fecha date default ((now() at time zone 'America/Bogota')::date))
returns table (clave text, nombre text, dias int, tipo_dias text, vigente_desde date)
language sql
stable
security definer
set search_path = public
as $$
  select p.clave, p.nombre, v.dias, v.tipo_dias, v.vigente_desde
  from sst_parametros p
  left join lateral (
    select x.dias, x.tipo_dias, x.vigente_desde from sst_parametro_valores x
    where x.clave = p.clave and x.vigente_desde <= p_fecha
    order by x.vigente_desde desc, x.registrado_en desc limit 1
  ) v on true
  where fn_tiene_permiso('sgsst', 'consultar')
  order by p.orden;
$$;

-- Nombres del personal para SG-SST (la ficha completa sigue siendo de RRHH).
create or replace function public.fn_sst_personal()
returns table (id uuid, perfil_id uuid, nombre text, cargo text, estado_laboral text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.perfil_id, trim(e.primer_nombre || ' ' || e.primer_apellido || coalesce(' ' || e.segundo_apellido, '')), e.cargo, e.estado_laboral
  from empleados e
  where fn_tiene_permiso('sgsst', 'consultar')
  order by 3;
$$;

-- ============================================================ 2) reporte de acto o condición insegura
create table if not exists public.sst_reportes_inseguros (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('acto', 'condicion')),
  descripcion text not null check (length(trim(descripcion)) > 0),
  lugar text,
  proyecto_id uuid references public.proyectos (id),
  visita_id uuid references public.visitas (id),
  gps_estado text check (gps_estado in ('concedido', 'denegado', 'sin_senal', 'no_disponible')),
  lat numeric(9,6),
  lng numeric(9,6),
  observado_en_dispositivo timestamptz,      -- cuándo lo vio (puede subir después, sin señal)
  reportado_por uuid not null default auth.uid() references public.perfiles (id),
  reportado_en timestamptz not null default now(),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'en_gestion', 'cerrado', 'anulado')),
  accion_tomada text,
  atendido_por uuid references public.perfiles (id),
  atendido_en timestamptz,
  motivo_anulacion text,
  constraint sst_reporte_cierre check (estado <> 'cerrado' or length(trim(coalesce(accion_tomada, ''))) > 0),
  constraint sst_reporte_anulado check (estado <> 'anulado' or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
create index if not exists idx_sst_reportes on public.sst_reportes_inseguros (estado, reportado_en desc);
create index if not exists idx_sst_reportes_quien on public.sst_reportes_inseguros (reportado_por, reportado_en desc);

create table if not exists public.sst_reporte_fotos (
  id uuid primary key default gen_random_uuid(),
  reporte_id uuid not null references public.sst_reportes_inseguros (id) on delete restrict,
  path text not null unique check (path like 'reportes/%'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  subida_por uuid not null default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  check (path like 'reportes/' || reporte_id::text || '/%')
);

create or replace function public.fn_sst_reporte_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Un reporte no se borra: se anula con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.reportado_por := auth.uid();
    new.reportado_en := now();
    new.estado := 'nuevo';
    new.accion_tomada := null; new.atendido_por := null; new.atendido_en := null; new.motivo_anulacion := null;
    if new.observado_en_dispositivo > now() + interval '10 minutes' then
      new.observado_en_dispositivo := now();
    end if;
    return new;
  end if;
  if old.estado in ('cerrado', 'anulado') then
    raise exception 'El reporte ya está %: no cambia.', old.estado;
  end if;
  if (to_jsonb(new) - array['estado', 'accion_tomada', 'atendido_por', 'atendido_en', 'motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['estado', 'accion_tomada', 'atendido_por', 'atendido_en', 'motivo_anulacion']) then
    raise exception 'Lo reportado no se edita.';
  end if;
  if not fn_tiene_permiso('sgsst', 'trabajar') then
    raise exception 'El reporte lo atiende la gestión SST.';
  end if;
  if new.estado is distinct from old.estado then
    if not ((old.estado = 'nuevo' and new.estado in ('en_gestion', 'cerrado', 'anulado'))
            or (old.estado = 'en_gestion' and new.estado in ('cerrado', 'anulado'))) then
      raise exception 'Un reporte no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;
  new.atendido_por := auth.uid();
  new.atendido_en := now();
  return new;
end;
$$;
drop trigger if exists trg_sst_reporte_reglas on public.sst_reportes_inseguros;
create trigger trg_sst_reporte_reglas
  before insert or update or delete on public.sst_reportes_inseguros
  for each row execute function public.fn_sst_reporte_reglas();

-- Fotos: solo quien reportó, mientras el reporte siga "nuevo". No se cambian ni se borran.
create or replace function public.fn_sst_reporte_foto_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Las fotos de un reporte no se cambian ni se borran.';
  end if;
  if not exists (select 1 from sst_reportes_inseguros r where r.id = new.reporte_id and r.reportado_por = auth.uid() and r.estado = 'nuevo') then
    raise exception 'Solo quien reportó agrega fotos, y mientras el reporte no se esté atendiendo.';
  end if;
  new.subida_por := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists trg_sst_reporte_foto_reglas on public.sst_reporte_fotos;
create trigger trg_sst_reporte_foto_reglas
  before insert or update or delete on public.sst_reporte_fotos
  for each row execute function public.fn_sst_reporte_foto_reglas();

-- ============================================================ 3) accidentes e incidentes
create table if not exists public.sst_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('accidente', 'incidente')),
  ocurrido_en timestamptz not null,
  lugar text,
  proyecto_id uuid references public.proyectos (id),
  empleado_id uuid references public.empleados (id),        -- la misma persona de RRHH
  afectado_nombre text,                                      -- si no es empleado (contratista, tercero)
  afectado_documento text,
  descripcion text not null check (length(trim(descripcion)) > 0),   -- qué pasó; NUNCA diagnóstico
  acciones_inmediatas text,
  reporte_inseguro_id uuid references public.sst_reportes_inseguros (id),
  reportado_arl_en timestamptz,
  radicado_arl text,
  reportado_eps_en timestamptz,
  radicado_eps text,
  investigacion_formato_id uuid references public.sst_formatos (id),
  estado text not null default 'abierto' check (estado in ('abierto', 'investigado', 'cerrado', 'anulado')),
  nota_cierre text,
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  registrado_en timestamptz not null default now(),
  cerrado_por uuid references public.perfiles (id),
  cerrado_en timestamptz,
  motivo_anulacion text,
  updated_at timestamptz not null default now(),
  constraint sst_evento_afectado check (tipo = 'incidente' or empleado_id is not null or length(trim(coalesce(afectado_nombre, ''))) > 0),
  constraint sst_evento_cierre check (estado <> 'cerrado' or length(trim(coalesce(nota_cierre, ''))) > 0),
  constraint sst_evento_anulado check (estado <> 'anulado' or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
create index if not exists idx_sst_eventos on public.sst_eventos (estado, ocurrido_en desc);

-- Soportes del evento (copia del reporte a la ARL, fotos del lugar…). No se cambian ni se borran.
create table if not exists public.sst_evento_archivos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.sst_eventos (id) on delete restrict,
  descripcion text not null check (length(trim(descripcion)) > 0),
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  subido_por uuid not null default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  check (path like 'eventos/' || evento_id::text || '/%')
);

create or replace function public.fn_sst_evento_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Un accidente o incidente no se borra: se anula con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.ocurrido_en > now() + interval '10 minutes' then
      raise exception 'La fecha del evento no puede ser futura.';
    end if;
    new.estado := 'abierto';
    new.registrado_por := auth.uid();
    new.registrado_en := now();
    new.cerrado_por := null; new.cerrado_en := null; new.motivo_anulacion := null; new.nota_cierre := null;
    return new;
  end if;

  if old.estado in ('cerrado', 'anulado') then
    raise exception 'El evento ya está %: no cambia.', old.estado;
  end if;
  if (new.registrado_por, new.registrado_en, new.tipo) is distinct from (old.registrado_por, old.registrado_en, old.tipo) then
    raise exception 'Quién lo registró, cuándo y si fue accidente o incidente no se cambian.';
  end if;
  -- El reporte a la ARL y a la EPS se registra una sola vez.
  if old.reportado_arl_en is not null and (new.reportado_arl_en, new.radicado_arl) is distinct from (old.reportado_arl_en, old.radicado_arl) then
    raise exception 'El reporte a la ARL ya quedó registrado: no se cambia.';
  end if;
  if old.reportado_eps_en is not null and (new.reportado_eps_en, new.radicado_eps) is distinct from (old.reportado_eps_en, old.radicado_eps) then
    raise exception 'El reporte a la EPS ya quedó registrado: no se cambia.';
  end if;
  if new.reportado_arl_en > now() + interval '10 minutes' or new.reportado_eps_en > now() + interval '10 minutes' then
    raise exception 'La fecha del reporte no puede ser futura.';
  end if;
  if new.reportado_arl_en < old.ocurrido_en or new.reportado_eps_en < old.ocurrido_en then
    raise exception 'El reporte no puede ser anterior al evento.';
  end if;
  -- Investigado: con su formato de investigación ya firmado.
  if old.estado = 'investigado' and new.investigacion_formato_id is distinct from old.investigacion_formato_id then
    raise exception 'La investigación ya quedó registrada: no se cambia.';
  end if;
  -- Lo que se describe se puede completar mientras está abierto; después no.
  if old.estado <> 'abierto'
     and (new.ocurrido_en, new.lugar, new.proyecto_id, new.empleado_id, new.afectado_nombre, new.afectado_documento, new.descripcion, new.acciones_inmediatas)
         is distinct from (old.ocurrido_en, old.lugar, old.proyecto_id, old.empleado_id, old.afectado_nombre, old.afectado_documento, old.descripcion, old.acciones_inmediatas) then
    raise exception 'El evento ya se investigó: su descripción no se edita.';
  end if;
  if new.estado is distinct from old.estado then
    if old.estado = 'abierto' and new.estado = 'investigado' then
      if not exists (select 1 from sst_formatos f where f.id = new.investigacion_formato_id and f.estado in ('firmado', 'aprobado')) then
        raise exception 'Para marcarlo investigado, vincula el formato de investigación ya firmado.';
      end if;
    elsif new.estado = 'cerrado' then
      if old.estado <> 'investigado' then
        raise exception 'Primero la investigación: un evento se cierra investigado.';
      end if;
      new.cerrado_por := auth.uid();
      new.cerrado_en := now();
    elsif new.estado = 'anulado' then
      if not fn_tiene_permiso('sgsst', 'responsable') then
        raise exception 'Solo la gestión SST anula un evento.';
      end if;
      new.cerrado_por := auth.uid();
      new.cerrado_en := now();
    else
      raise exception 'Un evento no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_evento_reglas on public.sst_eventos;
create trigger trg_sst_evento_reglas
  before insert or update or delete on public.sst_eventos
  for each row execute function public.fn_sst_evento_reglas();
drop trigger if exists trg_sst_eventos_updated_at on public.sst_eventos;
create trigger trg_sst_eventos_updated_at
  before update on public.sst_eventos
  for each row execute function extensions.moddatetime(updated_at);

create or replace function public.fn_sst_evento_archivo_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Los soportes de un evento no se cambian ni se borran.';
  end if;
  if exists (select 1 from sst_eventos e where e.id = new.evento_id and e.estado in ('cerrado', 'anulado')) then
    raise exception 'El evento ya está cerrado: no recibe soportes.';
  end if;
  new.subido_por := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists trg_sst_evento_archivo_reglas on public.sst_evento_archivos;
create trigger trg_sst_evento_archivo_reglas
  before insert or update or delete on public.sst_evento_archivos
  for each row execute function public.fn_sst_evento_archivo_reglas();

-- ============================================================ 4) avisos (sobre la 76)
alter table public.notificacion_tipos drop constraint if exists notificacion_tipos_para_check;
alter table public.notificacion_tipos add constraint notificacion_tipos_para_check check (para in ('tecnico', 'aprobador', 'rrhh', 'sst'));
insert into public.notificacion_tipos (id, nombre, descripcion, para, por_defecto, orden) values
  ('reporte_atendido', 'Tu reporte de SST', 'La gestión SST atendió o cerró un acto o condición insegura que reportaste.', 'tecnico', true, 9),
  ('condicion_insegura', 'Acto o condición insegura reportada', 'Alguien reportó un acto o condición insegura (para SG-SST).', 'sst', true, 40),
  ('accidente_registrado', 'Accidente o incidente registrado', 'Se registró un accidente o incidente (para SG-SST).', 'sst', true, 41)
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, para = excluded.para,
  por_defecto = excluded.por_defecto, orden = excluded.orden;

create or replace function public.fn_notif_sst_reporte()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v uuid;
begin
  if tg_op = 'INSERT' then
    for v in select * from fn_notif_con_permiso('sgsst', 'trabajar') loop
      perform fn_notificar(v, 'condicion_insegura',
        case new.tipo when 'acto' then 'Reportaron un acto inseguro' else 'Reportaron una condición insegura' end,
        coalesce(new.lugar, 'Sin lugar') || ' · ' || fn_notif_nombre(new.reportado_por), '/sgsst/reportes', 'sst_reportes_inseguros', new.id);
    end loop;
  elsif new.estado is distinct from old.estado and new.estado in ('en_gestion', 'cerrado') then
    perform fn_notificar(new.reportado_por, 'reporte_atendido',
      case new.estado when 'cerrado' then 'Cerraron tu reporte de SST' else 'Están atendiendo tu reporte de SST' end,
      case new.estado when 'cerrado' then 'Entra para ver qué se hizo.' else 'Gracias por reportarlo.' end,
      '/sgsst/mis-reportes', 'sst_reportes_inseguros', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notif_sst_reporte on public.sst_reportes_inseguros;
create trigger trg_notif_sst_reporte after insert or update of estado on public.sst_reportes_inseguros
  for each row execute function public.fn_notif_sst_reporte();

create or replace function public.fn_notif_sst_evento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v uuid;
begin
  for v in select * from fn_notif_con_permiso('sgsst', 'trabajar') loop
    perform fn_notificar(v, 'accidente_registrado',
      case new.tipo when 'accidente' then 'Se registró un accidente de trabajo' else 'Se registró un incidente' end,
      case new.tipo when 'accidente' then 'Revisa el plazo de reporte a la ARL y la EPS.' else 'Entra para ver qué pasó.' end,
      '/sgsst/eventos', 'sst_eventos', new.id, new.tipo = 'accidente');
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_notif_sst_evento on public.sst_eventos;
create trigger trg_notif_sst_evento after insert on public.sst_eventos
  for each row execute function public.fn_notif_sst_evento();

-- ============================================================ 5) RLS
alter table public.sst_parametros enable row level security;
alter table public.sst_parametro_valores enable row level security;
alter table public.sst_reportes_inseguros enable row level security;
alter table public.sst_reporte_fotos enable row level security;
alter table public.sst_eventos enable row level security;
alter table public.sst_evento_archivos enable row level security;
revoke all on table public.sst_parametros, public.sst_parametro_valores, public.sst_reportes_inseguros,
  public.sst_reporte_fotos, public.sst_eventos, public.sst_evento_archivos from anon;

drop policy if exists sst_parametros_select on public.sst_parametros;
create policy sst_parametros_select on public.sst_parametros for select to authenticated using (fn_tiene_permiso('sgsst', 'consultar'));
drop policy if exists sst_parametro_valores_select on public.sst_parametro_valores;
create policy sst_parametro_valores_select on public.sst_parametro_valores for select to authenticated using (fn_tiene_permiso('sgsst', 'consultar'));
drop policy if exists sst_parametro_valores_insert on public.sst_parametro_valores;
create policy sst_parametro_valores_insert on public.sst_parametro_valores for insert to authenticated with check (fn_tiene_permiso('sgsst', 'responsable'));

-- Reportes: cualquiera reporta y ve los suyos; SG-SST los ve todos y los atiende.
drop policy if exists sst_reportes_select on public.sst_reportes_inseguros;
create policy sst_reportes_select on public.sst_reportes_inseguros for select to authenticated
  using (reportado_por = auth.uid() or fn_tiene_permiso('sgsst', 'consultar'));
drop policy if exists sst_reportes_insert on public.sst_reportes_inseguros;
create policy sst_reportes_insert on public.sst_reportes_inseguros for insert to authenticated with check (reportado_por = auth.uid());
drop policy if exists sst_reportes_update on public.sst_reportes_inseguros;
create policy sst_reportes_update on public.sst_reportes_inseguros for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_reporte_fotos_select on public.sst_reporte_fotos;
create policy sst_reporte_fotos_select on public.sst_reporte_fotos for select to authenticated
  using (subida_por = auth.uid() or fn_tiene_permiso('sgsst', 'consultar'));
drop policy if exists sst_reporte_fotos_insert on public.sst_reporte_fotos;
create policy sst_reporte_fotos_insert on public.sst_reporte_fotos for insert to authenticated with check (subida_por = auth.uid());

-- Eventos: SG-SST.
drop policy if exists sst_eventos_select on public.sst_eventos;
create policy sst_eventos_select on public.sst_eventos for select to authenticated using (fn_tiene_permiso('sgsst', 'consultar'));
drop policy if exists sst_eventos_insert on public.sst_eventos;
create policy sst_eventos_insert on public.sst_eventos for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_eventos_update on public.sst_eventos;
create policy sst_eventos_update on public.sst_eventos for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_evento_archivos_select on public.sst_evento_archivos;
create policy sst_evento_archivos_select on public.sst_evento_archivos for select to authenticated using (fn_tiene_permiso('sgsst', 'consultar'));
drop policy if exists sst_evento_archivos_insert on public.sst_evento_archivos;
create policy sst_evento_archivos_insert on public.sst_evento_archivos for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));

-- ============================================================ 6) archivos: bucket sgsst (de la 75), carpetas nuevas
-- reportes/{reporte_id}/…: quien reportó, mientras siga "nuevo". eventos/{evento_id}/…: SG-SST, abierto o investigado.
create or replace function public.fn_sst_archivo_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (storage.foldername(p_nombre))[1]
    when 'formatos' then fn_tiene_permiso('sgsst', 'trabajar')
      and exists (select 1 from sst_formatos f where f.id::text = (storage.foldername(p_nombre))[2] and f.estado = 'borrador')
    when 'plan' then fn_tiene_permiso('sgsst', 'trabajar')
      and exists (select 1 from sst_plan_items i where i.id::text = (storage.foldername(p_nombre))[2] and i.archivado_en is null)
    when 'reportes' then exists (select 1 from sst_reportes_inseguros r where r.id::text = (storage.foldername(p_nombre))[2]
                                 and r.reportado_por = auth.uid() and r.estado = 'nuevo')
    when 'eventos' then fn_tiene_permiso('sgsst', 'trabajar')
      and exists (select 1 from sst_eventos e where e.id::text = (storage.foldername(p_nombre))[2] and e.estado in ('abierto', 'investigado'))
    else false
  end;
$$;
create or replace function public.fn_sst_archivo_visible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('sgsst', 'consultar')
      or ((storage.foldername(p_nombre))[1] = 'reportes'
          and exists (select 1 from sst_reportes_inseguros r where r.id::text = (storage.foldername(p_nombre))[2] and r.reportado_por = auth.uid()));
$$;
drop policy if exists sgsst_archivos_select on storage.objects;
create policy sgsst_archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'sgsst' and fn_sst_archivo_visible(name));

-- ============================================================ 7) privilegios
revoke all on function public.fn_sst_parametro_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_reporte_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_reporte_foto_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_evento_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_evento_archivo_reglas() from public, anon, authenticated;
revoke all on function public.fn_notif_sst_reporte() from public, anon, authenticated;
revoke all on function public.fn_notif_sst_evento() from public, anon, authenticated;
revoke all on function public.fn_sst_plazos(date) from public, anon;
grant execute on function public.fn_sst_plazos(date) to authenticated, service_role;
revoke all on function public.fn_sst_personal() from public, anon;
grant execute on function public.fn_sst_personal() to authenticated, service_role;
revoke all on function public.fn_sst_archivo_subible(text) from public, anon;
grant execute on function public.fn_sst_archivo_subible(text) to authenticated, service_role;
revoke all on function public.fn_sst_archivo_visible(text) from public, anon;
grant execute on function public.fn_sst_archivo_visible(text) to authenticated, service_role;

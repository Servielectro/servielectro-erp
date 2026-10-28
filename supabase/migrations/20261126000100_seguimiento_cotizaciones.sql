-- Seguimiento de cotizaciones (2026-10-27). Jhojan: "crea esa etapa con las acciones para el
-- seguimiento. seleccionar el próximo paso y la fecha que debe hacerse, correo, llamada, visita u
-- otro que sugieras."
--
--   1. Transiciones del estado: BORRADOR → ENVIADA → EN_EVALUACION → APROBADA | RECHAZADA. Desde
--      ENVIADA también se puede aprobar o rechazar directo, y desde EN_EVALUACION se vuelve a
--      ENVIADA cuando se manda una versión nueva (la validez vuelve a contar). Aprobada o rechazada
--      no se mueve. Hasta hoy la app no cambiaba el estado: lo hace desde el detalle de la cotización.
--   2. Validez: validez_dias (por defecto 10, como dicen las cotizaciones: "validez de 10 días"),
--      contada desde que se ENVIÓ (enviada_en; si no hay, desde la fecha de emisión). Con equipos
--      importados, una cotización vencida tiene precios que ya no son los que se ofrecieron.
--   3. cotizacion_seguimientos: el próximo paso (tipo, fecha, responsable, notas) y su cierre
--      (cuándo se hizo, resultado, quién). UN paso abierto a la vez por cotización; al cerrarlo
--      se escribe el resultado y se abre el siguiente (fn_cerrar_seguimiento, en una sola
--      operación). Historial completo: un paso cerrado no se edita y nada se borra.
--      Un paso puede quedar "por definir" (sin tipo ni fecha): es como queda la CSE-26-157, porque
--      el próximo paso lo decide Jhojan.
--   4. Tipos: llamada, correo, visita_tecnica, reunion, ajustar_propuesta, enviar_documentacion,
--      presentar_a_consejo, espera_consejo_o_asamblea (la clave en propiedad horizontal: la
--      decisión la toma el consejo o la asamblea en fechas fijas; una cotización puede estar
--      semanas quieta sin estar perdida) y otro (con texto obligatorio).
--      Reunión: el paso guarda la reunión (migración 86) cuando existe. OJO: hoy una reunión
--      exige proyecto y un prospecto no lo tiene; ligar reuniones de prospectos es otra decisión.
--   5. Alertas (v_cotizaciones_alertas): próximo paso vencido sin realizar, y validez expirada;
--      además "sin próximo paso" y "paso por definir". Solo para ENVIADA y EN_EVALUACION.
--   6. Permisos: los de la cotización (Comercial: consultar ve, trabajar escribe). Nada de
--      funciones definer con filtro de permiso llamadas desde triggers (regla de la 88).
--   7. Siembra: la CSE-26-157 pasa a EN_EVALUACION (el cliente la está evaluando) con un paso
--      abierto SIN tipo y SIN fecha.
--
-- Requiere la 99 confirmada. Idempotente.
-- Verificación: supabase/verificaciones/20261126000100_verificar.sql
-- Rollback:     supabase/rollbacks/20261126000100_seguimiento_cotizaciones_down.sql

-- ============================================================ 1) validez y fecha de envío
alter table public.cotizaciones add column if not exists validez_dias int not null default 10;
alter table public.cotizaciones drop constraint if exists cotizaciones_validez_dias;
alter table public.cotizaciones add constraint cotizaciones_validez_dias check (validez_dias between 1 and 365);
alter table public.cotizaciones add column if not exists enviada_en timestamptz;

-- ============================================================ 2) transiciones del estado
create or replace function public.fn_cotizacion_estado_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    if new.estado = 'ENVIADA' then new.enviada_en := coalesce(new.enviada_en, now()); end if;
    return new;
  end if;
  if not (
       (old.estado = 'BORRADOR' and new.estado = 'ENVIADA')
    or (old.estado = 'ENVIADA' and new.estado in ('EN_EVALUACION', 'APROBADA', 'RECHAZADA'))
    or (old.estado = 'EN_EVALUACION' and new.estado in ('ENVIADA', 'APROBADA', 'RECHAZADA'))
  ) then
    raise exception 'Una cotización no pasa de % a %.', old.estado, new.estado;
  end if;
  if new.estado = 'ENVIADA' then
    new.enviada_en := now();            -- la validez cuenta desde el (re)envío
  end if;
  if new.estado = 'APROBADA' then
    new.fecha_aprobacion := coalesce(new.fecha_aprobacion, (now() at time zone 'America/Bogota')::date);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cotizacion_estado_reglas on public.cotizaciones;
create trigger trg_cotizacion_estado_reglas before update of estado on public.cotizaciones
  for each row execute function public.fn_cotizacion_estado_reglas();

-- ============================================================ 3) seguimientos
create table if not exists public.cotizacion_seguimientos (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones (id) on delete restrict,
  -- null = por definir
  tipo text check (tipo is null or tipo in (
    'llamada', 'correo', 'visita_tecnica', 'reunion', 'ajustar_propuesta', 'enviar_documentacion',
    'presentar_a_consejo', 'espera_consejo_o_asamblea', 'otro')),
  detalle_otro text,
  fecha_programada date,
  responsable_id uuid references public.perfiles (id),
  notas text,
  reunion_id uuid references public.reuniones (id),
  creado_por uuid default auth.uid() references public.perfiles (id),
  creado_en timestamptz not null default now(),
  -- cierre
  realizado_en timestamptz,
  resultado text,
  cerrado_por uuid references public.perfiles (id),
  constraint cotizacion_seguimientos_otro check (tipo is distinct from 'otro' or length(trim(coalesce(detalle_otro, ''))) > 0),
  constraint cotizacion_seguimientos_cierre check (
    (realizado_en is null and resultado is null and cerrado_por is null)
    or (realizado_en is not null and length(trim(coalesce(resultado, ''))) > 0))
);
create unique index if not exists uq_cotizacion_un_paso_abierto on public.cotizacion_seguimientos (cotizacion_id) where realizado_en is null;
create index if not exists idx_cotizacion_seguimientos on public.cotizacion_seguimientos (cotizacion_id, creado_en desc);
create index if not exists idx_cotizacion_seguimientos_fecha on public.cotizacion_seguimientos (fecha_programada) where realizado_en is null;

create or replace function public.fn_cotizacion_seguimientos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Un paso del seguimiento no se borra: se cierra con su resultado.';
  end if;
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
    if new.realizado_en is not null then
      new.cerrado_por := auth.uid();
    end if;
    return new;
  end if;
  -- UPDATE
  if old.realizado_en is not null then
    raise exception 'Ese paso ya se cerró: queda en el historial tal como fue.';
  end if;
  if new.cotizacion_id is distinct from old.cotizacion_id or new.creado_por is distinct from old.creado_por
     or new.creado_en is distinct from old.creado_en then
    raise exception 'La cotización y quién abrió el paso no se cambian.';
  end if;
  if new.realizado_en is not null then
    new.cerrado_por := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cotizacion_seguimientos_reglas on public.cotizacion_seguimientos;
create trigger trg_cotizacion_seguimientos_reglas before insert or update or delete on public.cotizacion_seguimientos
  for each row execute function public.fn_cotizacion_seguimientos_reglas();

-- Cerrar el paso abierto con su resultado y abrir el siguiente, en una sola operación (corre con
-- los permisos de quien llama: la RLS y las reglas de arriba aplican igual).
create or replace function public.fn_cerrar_seguimiento(
  p_seguimiento_id uuid, p_resultado text,
  p_siguiente_tipo text default null, p_siguiente_fecha date default null,
  p_siguiente_responsable uuid default null, p_siguiente_notas text default null,
  p_siguiente_detalle_otro text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_cotizacion uuid;
  v_nuevo uuid;
begin
  if length(trim(coalesce(p_resultado, ''))) = 0 then
    raise exception 'Escribe el resultado del paso (qué pasó).';
  end if;
  update cotizacion_seguimientos set realizado_en = now(), resultado = trim(p_resultado)
  where id = p_seguimiento_id and realizado_en is null
  returning cotizacion_id into v_cotizacion;
  if v_cotizacion is null then
    raise exception 'Ese paso no existe o ya estaba cerrado.';
  end if;
  insert into cotizacion_seguimientos (cotizacion_id, tipo, detalle_otro, fecha_programada, responsable_id, notas)
  values (v_cotizacion, p_siguiente_tipo, nullif(trim(p_siguiente_detalle_otro), ''), p_siguiente_fecha,
          p_siguiente_responsable, nullif(trim(p_siguiente_notas), ''))
  returning id into v_nuevo;
  return v_nuevo;
end;
$$;

-- ============================================================ 4) alertas
create or replace view public.v_cotizaciones_alertas
with (security_invoker = true) as
select c.id as cotizacion_id, c.codigo, c.estado,
       s.id as paso_id, s.tipo as paso_tipo, s.fecha_programada as paso_fecha, s.responsable_id as paso_responsable_id,
       (coalesce((c.enviada_en at time zone 'America/Bogota')::date, c.fecha_emision) + c.validez_dias) as validez_vence,
       (s.id is null) as sin_paso,
       (s.id is not null and (s.tipo is null or s.fecha_programada is null)) as paso_por_definir,
       (s.fecha_programada is not null and s.fecha_programada < (now() at time zone 'America/Bogota')::date) as paso_vencido,
       ((coalesce((c.enviada_en at time zone 'America/Bogota')::date, c.fecha_emision) + c.validez_dias)
          < (now() at time zone 'America/Bogota')::date) as validez_vencida
from public.cotizaciones c
left join public.cotizacion_seguimientos s on s.cotizacion_id = c.id and s.realizado_en is null
where c.estado in ('ENVIADA', 'EN_EVALUACION');

-- ============================================================ 5) privilegios y RLS
alter table public.cotizacion_seguimientos enable row level security;
revoke all on table public.cotizacion_seguimientos from anon;
revoke delete, truncate, trigger, references on table public.cotizacion_seguimientos from authenticated;
revoke all on table public.v_cotizaciones_alertas from anon;
drop policy if exists cotizacion_seguimientos_select on public.cotizacion_seguimientos;
create policy cotizacion_seguimientos_select on public.cotizacion_seguimientos for select to authenticated
  using (fn_tiene_permiso('comercial', 'consultar'));
drop policy if exists cotizacion_seguimientos_insert on public.cotizacion_seguimientos;
create policy cotizacion_seguimientos_insert on public.cotizacion_seguimientos for insert to authenticated
  with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists cotizacion_seguimientos_update on public.cotizacion_seguimientos;
create policy cotizacion_seguimientos_update on public.cotizacion_seguimientos for update to authenticated
  using (fn_tiene_permiso('comercial', 'trabajar')) with check (fn_tiene_permiso('comercial', 'trabajar'));

revoke all on function public.fn_cerrar_seguimiento(uuid, text, text, date, uuid, text, text) from public, anon;
grant execute on function public.fn_cerrar_seguimiento(uuid, text, text, date, uuid, text, text) to authenticated;
-- de trigger: nadie
revoke all on function public.fn_cotizacion_estado_reglas() from public, anon, authenticated;
revoke all on function public.fn_cotizacion_seguimientos_reglas() from public, anon, authenticated;

-- ============================================================ 6) la CSE-26-157
update public.cotizaciones set estado = 'EN_EVALUACION'
where id = '3e613c30-a47f-4c4d-b177-765226ed1e63' and estado = 'ENVIADA';
insert into public.cotizacion_seguimientos (cotizacion_id, notas)
select '3e613c30-a47f-4c4d-b177-765226ed1e63', 'Por definir: el próximo paso y su fecha los pone Jhojan. El cliente la está evaluando.'
where exists (select 1 from public.cotizaciones where id = '3e613c30-a47f-4c4d-b177-765226ed1e63' and estado = 'EN_EVALUACION')
  and not exists (select 1 from public.cotizacion_seguimientos
                  where cotizacion_id = '3e613c30-a47f-4c4d-b177-765226ed1e63' and realizado_en is null);

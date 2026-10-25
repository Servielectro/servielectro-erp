-- Caja menor del lado del técnico (2026-11-01). Jhojan:
--   "vamos a crear también uno para el módulo de técnicos, en donde ellos podrán registrar cosa
--    por cosa de los gastos que realicen con el saldo asignado de caja menor... junto con la foto
--    de la factura y RRHH pueda verlo en tiempo real... calcular automáticamente el saldo...
--    RRHH asigna un recurso a esa caja menor y le aparece al técnico... Si no se selecciona el
--    técnico al que se le aplicó el recurso, el módulo no le aparece."
--
-- Lo de RRHH de la 66 no cambia de forma; se le agrega:
--   - monto_asignado (el recurso que entrega RRHH) y estado abierta/cerrada (cerrar = legalizar).
--   - Saldo = asignado − líneas no anuladas, en la vista v_caja_menor_recibos. Nunca una columna
--     que se actualice a mano: así no se puede desincronizar.
--   - El técnico ve SU caja y agrega sus líneas y fotos. "Suya" = empleados.perfil_id = auth.uid():
--     si la ficha no está enlazada al usuario del ERP (pestaña Accesos), al técnico no le aparece
--     nada, que es lo que pidió Jhojan.
--   - Las líneas no se editan: se anulan con motivo (dueño o RRHH), y una anulada no suma.
--   - Pasarse del saldo NO se bloquea (decisión del orquestador): si se bloqueara, el gasto no
--     desaparece, solo deja de quedar registrado. Se acepta y el saldo queda negativo.
--   - Fotos: en rrhh-soportes (el bucket con patrón de dueño de la 64), carpeta
--     caja-menor/{recibo_id}/. Una sola ruta para el técnico y para RRHH; rrhh-personal sigue
--     siendo solo de RRHH.
--
-- Las funciones genéricas de la 66 (fn_rrhh_registro_anulable, fn_rrhh_hijo_de_registro) NO se
-- tocan: siguen protegiendo liquidaciones y desprendibles igual. Las tablas de caja menor pasan a
-- reglas propias, con lo justo. Ninguna función de trigger es security definer (adentro,
-- current_user sería el dueño y la exención de postgres se cumpliría siempre).
--
-- 0 filas en caja_menor_recibos y caja_menor_lineas en producción: columnas not null sin backfill.
--
-- Verificación: supabase/verificaciones/20261101000069_verificar.sql
-- Rollback:     supabase/rollbacks/20261101000069_caja_menor_tecnico_down.sql
-- Idempotente. Requiere la 64 (rrhh-soportes) y la 66 (caja menor).

-- ============================================================ 1) columnas
alter table public.caja_menor_recibos add column if not exists monto_asignado numeric(14,2) not null;
alter table public.caja_menor_recibos drop constraint if exists caja_menor_monto_asignado;
alter table public.caja_menor_recibos add constraint caja_menor_monto_asignado check (monto_asignado >= 0);
alter table public.caja_menor_recibos add column if not exists estado text not null default 'abierta';
alter table public.caja_menor_recibos drop constraint if exists caja_menor_estado;
alter table public.caja_menor_recibos add constraint caja_menor_estado check (estado in ('abierta', 'cerrada'));
alter table public.caja_menor_recibos add column if not exists cerrada_en timestamptz;
alter table public.caja_menor_recibos add column if not exists cerrada_por uuid references public.perfiles (id);

alter table public.caja_menor_lineas add column if not exists fecha date not null default ((now() at time zone 'America/Bogota')::date);
alter table public.caja_menor_lineas add column if not exists registrado_por uuid references public.perfiles (id) default auth.uid();
alter table public.caja_menor_lineas add column if not exists registrado_en timestamptz not null default now();
alter table public.caja_menor_lineas add column if not exists anulada_en timestamptz;
alter table public.caja_menor_lineas add column if not exists anulada_por uuid references public.perfiles (id);
alter table public.caja_menor_lineas add column if not exists motivo_anulacion text;

-- La foto de cada línea (factura), además de los soportes generales del recibo.
alter table public.caja_menor_soportes add column if not exists linea_id uuid references public.caja_menor_lineas (id);

-- ============================================================ 2) "suya"
-- La caja es del técnico cuya ficha está enlazada a su usuario del ERP.
create or replace function public.fn_caja_menor_es_mia(p_recibo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from caja_menor_recibos r
    join empleados e on e.id = r.empleado_id
    where r.id = p_recibo and e.perfil_id = auth.uid()
  );
$$;

-- Las cajas de quien abre la app: SOLO las de su ficha enlazada, aunque tenga RRHH (que por la
-- RLS ve todas). Con esto la app del técnico decide si muestra el módulo.
create or replace function public.fn_mis_cajas_menores()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id from caja_menor_recibos r
  join empleados e on e.id = r.empleado_id
  where e.perfil_id = auth.uid();
$$;

-- Abierta y sin anular: lo único en lo que se agregan o anulan líneas y fotos.
create or replace function public.fn_caja_menor_abierta(p_recibo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from caja_menor_recibos r where r.id = p_recibo and r.estado = 'abierta' and r.anulado_en is null);
$$;

-- ============================================================ 3) reglas del recibo (en lugar de fn_rrhh_registro_anulable)
-- Cambia solo: el monto asignado y el cierre (abierta y sin anular), y la anulación (una vez,
-- con motivo). Concepto, empleado, obra y fechas, no. Nada se borra.
create or replace function public.fn_caja_menor_recibo_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Un recibo de caja menor no se borra: se anula con un motivo.';
  end if;
  if tg_op = 'INSERT' then
    new.estado := 'abierta';
    new.cerrada_en := null; new.cerrada_por := null;
    new.anulado_en := null; new.anulado_por := null; new.motivo_anulacion := null;
    return new;
  end if;

  if (to_jsonb(new) - array['monto_asignado', 'estado', 'cerrada_en', 'cerrada_por', 'anulado_en', 'anulado_por', 'motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['monto_asignado', 'estado', 'cerrada_en', 'cerrada_por', 'anulado_en', 'anulado_por', 'motivo_anulacion']) then
    raise exception 'El recibo no se edita: solo cambian el monto asignado, el cierre o la anulación.';
  end if;

  -- Anulación
  if (new.anulado_en, new.anulado_por, new.motivo_anulacion) is distinct from (old.anulado_en, old.anulado_por, old.motivo_anulacion) then
    if old.anulado_en is not null then
      raise exception 'Ya está anulado.';
    end if;
    if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
      raise exception 'Escribe por qué se anula.';
    end if;
    new.anulado_en := now();
    new.anulado_por := auth.uid();
  end if;

  -- Monto asignado y cierre: con la caja abierta y sin anular.
  if new.monto_asignado is distinct from old.monto_asignado or new.estado is distinct from old.estado
     or (new.cerrada_en, new.cerrada_por) is distinct from (old.cerrada_en, old.cerrada_por) then
    if old.estado <> 'abierta' then
      raise exception 'La caja menor ya está cerrada (legalizada): no cambia.';
    end if;
    if old.anulado_en is not null then
      raise exception 'El recibo está anulado.';
    end if;
    if new.estado is distinct from old.estado then
      if new.estado <> 'cerrada' then
        raise exception 'Una caja menor solo pasa de abierta a cerrada.';
      end if;
      new.cerrada_en := now();
      new.cerrada_por := auth.uid();
    elsif (new.cerrada_en, new.cerrada_por) is distinct from (old.cerrada_en, old.cerrada_por) then
      raise exception 'Quién cerró la caja lo registra la base.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_caja_menor_recibos_anulable on public.caja_menor_recibos;
drop trigger if exists trg_caja_menor_recibos_reglas on public.caja_menor_recibos;
create trigger trg_caja_menor_recibos_reglas
  before insert or update or delete on public.caja_menor_recibos
  for each row execute function public.fn_caja_menor_recibo_reglas();

-- ============================================================ 4) reglas de las líneas (en lugar de fn_rrhh_hijo_de_registro)
-- Se agregan en una caja abierta; no se editan; se anulan con motivo (una vez) mientras la caja
-- esté abierta. Quién (dueño o RRHH) lo decide la RLS.
create or replace function public.fn_caja_menor_linea_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Un gasto de caja menor no se borra: se anula con un motivo.';
  end if;
  if not fn_caja_menor_abierta(case when tg_op = 'INSERT' then new.recibo_id else old.recibo_id end) then
    raise exception 'La caja menor está cerrada o anulada: ya no se registran ni se anulan gastos.';
  end if;

  if tg_op = 'INSERT' then
    if new.fecha > (now() at time zone 'America/Bogota')::date then
      raise exception 'La fecha del gasto no puede ser futura.';
    end if;
    new.registrado_por := auth.uid();
    new.registrado_en := now();
    new.anulada_en := null; new.anulada_por := null; new.motivo_anulacion := null;
    return new;
  end if;

  -- UPDATE: solo la anulación.
  if (to_jsonb(new) - array['anulada_en', 'anulada_por', 'motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['anulada_en', 'anulada_por', 'motivo_anulacion']) then
    raise exception 'Un gasto registrado no se edita: anúlalo con un motivo y regístralo de nuevo.';
  end if;
  if old.anulada_en is not null then
    raise exception 'Ese gasto ya está anulado.';
  end if;
  if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
    raise exception 'Escribe por qué se anula.';
  end if;
  new.anulada_en := now();
  new.anulada_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_caja_menor_lineas_hijo on public.caja_menor_lineas;
drop trigger if exists trg_caja_menor_lineas_reglas on public.caja_menor_lineas;
create trigger trg_caja_menor_lineas_reglas
  before insert or update or delete on public.caja_menor_lineas
  for each row execute function public.fn_caja_menor_linea_reglas();

-- Soportes: solo se agregan, en una caja abierta; si van con una línea, de esa misma caja y sin anular.
create or replace function public.fn_caja_menor_soporte_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Un soporte no se cambia ni se borra.';
  end if;
  if not fn_caja_menor_abierta(new.recibo_id) then
    raise exception 'La caja menor está cerrada o anulada: ya no se suben soportes.';
  end if;
  if new.linea_id is not null and not exists (
    select 1 from caja_menor_lineas l where l.id = new.linea_id and l.recibo_id = new.recibo_id and l.anulada_en is null
  ) then
    raise exception 'La foto no corresponde a un gasto vigente de esta caja.';
  end if;
  new.subido_por := auth.uid();
  new.subido_en := now();
  return new;
end;
$$;

drop trigger if exists trg_caja_menor_soportes_hijo on public.caja_menor_soportes;
drop trigger if exists trg_caja_menor_soportes_reglas on public.caja_menor_soportes;
create trigger trg_caja_menor_soportes_reglas
  before insert or update or delete on public.caja_menor_soportes
  for each row execute function public.fn_caja_menor_soporte_reglas();

-- ============================================================ 5) saldo (vista, no columna)
drop view if exists public.v_caja_menor_recibos;
create view public.v_caja_menor_recibos with (security_invoker = true) as
select r.*,
       g.gastado as total,                                   -- nombre de la 66: lo gastado (no anulado)
       g.gastado,
       r.monto_asignado - g.gastado as saldo,
       greatest(g.gastado - r.monto_asignado, 0) as excedente
from caja_menor_recibos r
cross join lateral (
  select coalesce(sum(l.valor) filter (where l.anulada_en is null), 0)::numeric(14,2) as gastado
  from caja_menor_lineas l where l.recibo_id = r.id
) g;
revoke all on public.v_caja_menor_recibos from anon;
grant select on public.v_caja_menor_recibos to authenticated;

-- ============================================================ 6) RLS: RRHH todo; el técnico, lo suyo
drop policy if exists caja_menor_recibos_select on public.caja_menor_recibos;
create policy caja_menor_recibos_select on public.caja_menor_recibos for select to authenticated
  using (fn_rrhh_ve_todo() or fn_caja_menor_es_mia(id));
-- insert y update de recibos: siguen siendo solo RRHH (políticas de la 66).

drop policy if exists caja_menor_lineas_select on public.caja_menor_lineas;
create policy caja_menor_lineas_select on public.caja_menor_lineas for select to authenticated
  using (fn_rrhh_ve_todo() or fn_caja_menor_es_mia(recibo_id));
drop policy if exists caja_menor_lineas_insert on public.caja_menor_lineas;
create policy caja_menor_lineas_insert on public.caja_menor_lineas for insert to authenticated
  with check (fn_rrhh_ve_todo() or fn_caja_menor_es_mia(recibo_id));
drop policy if exists caja_menor_lineas_update on public.caja_menor_lineas;
create policy caja_menor_lineas_update on public.caja_menor_lineas for update to authenticated
  using (fn_rrhh_ve_todo() or fn_caja_menor_es_mia(recibo_id))
  with check (fn_rrhh_ve_todo() or fn_caja_menor_es_mia(recibo_id));

drop policy if exists caja_menor_soportes_select on public.caja_menor_soportes;
create policy caja_menor_soportes_select on public.caja_menor_soportes for select to authenticated
  using (fn_rrhh_ve_todo() or fn_caja_menor_es_mia(recibo_id));
drop policy if exists caja_menor_soportes_insert on public.caja_menor_soportes;
create policy caja_menor_soportes_insert on public.caja_menor_soportes for insert to authenticated
  with check ((fn_rrhh_ve_todo() or fn_caja_menor_es_mia(recibo_id)) and storage_path like 'caja-menor/' || recibo_id || '/%');

-- ============================================================ 7) Storage: rrhh-soportes, carpeta caja-menor/{recibo}/
create or replace function public.fn_rrhh_soporte_visible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case split_part(p_nombre, '/', 1)
    when 'gastos' then exists (select 1 from gastos g where g.id = fn_rrhh_id_de_ruta(p_nombre)
                               and (g.persona_id = auth.uid() or fn_rrhh_ve_todo()))
    when 'abonos' then exists (select 1 from abonos a where a.id = fn_rrhh_id_de_ruta(p_nombre)
                               and (a.persona_id = auth.uid() or fn_rrhh_ve_todo() or fn_es_aprobador_rrhh('abonos')))
    -- El destinatario solo abre archivos que estén registrados como suyos y sin anular.
    when 'documentos' then fn_rrhh_ve_todo()
                           or exists (select 1 from documentos_personal d
                                      where d.persona_id = auth.uid() and d.anulado_en is null
                                        and (d.storage_path = p_nombre or d.firma_path = p_nombre))
    -- Migración 69: las fotos de caja menor, RRHH y el técnico dueño de la caja.
    when 'caja-menor' then fn_rrhh_ve_todo() or fn_caja_menor_es_mia(fn_rrhh_id_de_ruta(p_nombre))
    else false
  end;
$$;

create or replace function public.fn_rrhh_soporte_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case split_part(p_nombre, '/', 1)
    when 'gastos' then exists (select 1 from gastos g where g.id = fn_rrhh_id_de_ruta(p_nombre)
                               and g.persona_id = auth.uid() and g.estado <> 'anulado' and g.reembolsado_en is null)
    when 'abonos' then exists (select 1 from abonos a where a.id = fn_rrhh_id_de_ruta(p_nombre)
                               and a.estado in ('solicitado', 'aprobado') and a.persona_id <> auth.uid()
                               and fn_es_aprobador_rrhh('abonos'))
    -- Documento: RRHH, en la carpeta de una persona que existe. Firma: el destinatario, en
    -- su carpeta, de un documento suyo que la pide y aún no está firmado.
    when 'documentos' then
      case when split_part(p_nombre, '/', 3) = 'firmas' then
             exists (select 1 from documentos_personal d
                     where d.id = fn_rrhh_documento_de_firma(p_nombre)
                       and d.persona_id = auth.uid()
                       and split_part(p_nombre, '/', 2) = auth.uid()::text
                       and d.requiere_firma and d.firma_path is null and d.anulado_en is null)
           else fn_rrhh_ve_todo()
                and exists (select 1 from perfiles pf where pf.id = fn_rrhh_id_de_ruta(p_nombre))
      end
    -- Migración 69: fotos de caja menor, en una caja abierta, por RRHH o por su dueño.
    when 'caja-menor' then (fn_rrhh_ve_todo() or fn_caja_menor_es_mia(fn_rrhh_id_de_ruta(p_nombre)))
                           and fn_caja_menor_abierta(fn_rrhh_id_de_ruta(p_nombre))
    else false
  end;
$$;

-- ============================================================ 8) privilegios
revoke all on function public.fn_caja_menor_es_mia(uuid) from public, anon;
grant execute on function public.fn_caja_menor_es_mia(uuid) to authenticated, service_role;
revoke all on function public.fn_mis_cajas_menores() from public, anon;
grant execute on function public.fn_mis_cajas_menores() to authenticated, service_role;
revoke all on function public.fn_caja_menor_abierta(uuid) from public, anon;
grant execute on function public.fn_caja_menor_abierta(uuid) to authenticated, service_role;
revoke all on function public.fn_caja_menor_recibo_reglas() from public, anon, authenticated;
revoke all on function public.fn_caja_menor_linea_reglas() from public, anon, authenticated;
revoke all on function public.fn_caja_menor_soporte_reglas() from public, anon, authenticated;

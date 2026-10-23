-- Abonos: "para qué fecha lo requiere" en lugar de "para qué" (2026-10-31). Dictado por Jhojan:
--   "No necesitamos explicación de para qué requiere un abono. Ponle para qué fecha lo requiere
--    más bien... No se puede el mismo día, ya que deben ser sujetos a flujo de caja de la
--    compañía. Se podría a partir del siguiente día, a menos que sea para una calamidad
--    doméstica y se requiere de urgencia. Debe quedar aclarado y si lo pone en calamidad, debe
--    justificarlo."
--
-- Cambios sobre la tabla abonos (migración 64; 0 filas en producción al escribir esto, por eso
-- las columnas nuevas entran not null sin backfill):
--   - fecha_requerida (obligatoria): desde mañana. Hoy y antes, no.
--   - urgencia_calamidad: con ella se acepta para HOY, y solo hoy (no retroactivo, igual que en
--     permisos: "se acepta el mismo día en que se solicita, no para días anteriores").
--   - motivo → justificacion, opcional: ya no es el "para qué", es la justificación de la
--     calamidad, obligatoria solo si se marca (check abonos_calamidad_justificada).
--   - La regla de fecha va en el trigger (depende de la fecha de hoy), con el texto en
--     fn_abono_fecha_bloqueada para que la pantalla lo diga antes de enviar.
--
-- Lo que NO cambia de la 64: solo el dueño edita, y solo en "solicitado" (ahora monto,
-- justificación, fecha requerida y urgencia); nadie aprueba lo suyo; desembolsado no cambia
-- nada, para nadie.
--
-- Verificación: supabase/verificaciones/20261031000068_verificar.sql
-- Rollback:     supabase/rollbacks/20261031000068_abonos_fecha_requerida_down.sql
-- Idempotente.

-- ============================================================ 1) columnas
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'abonos' and column_name = 'motivo') then
    alter table public.abonos rename column motivo to justificacion;
  end if;
end $$;
alter table public.abonos drop constraint if exists abonos_motivo_check;
alter table public.abonos alter column justificacion drop not null;

alter table public.abonos add column if not exists fecha_requerida date not null;
alter table public.abonos add column if not exists urgencia_calamidad boolean not null default false;

alter table public.abonos drop constraint if exists abonos_calamidad_justificada;
alter table public.abonos add constraint abonos_calamidad_justificada
  check (not urgencia_calamidad or length(trim(coalesce(justificacion, ''))) > 0);

comment on column public.abonos.justificacion is 'Justificación de la calamidad doméstica (obligatoria solo con urgencia_calamidad). Antes "motivo".';
comment on column public.abonos.fecha_requerida is 'Para qué fecha lo requiere. Desde mañana; hoy solo con calamidad doméstica.';

-- ============================================================ 2) la regla de la fecha, con su porqué
-- Devuelve null si la fecha sirve; si no, la frase que ve el técnico. La usan el trigger y la
-- pantalla (para decirlo antes de enviar).
create or replace function public.fn_abono_fecha_bloqueada(p_urgencia boolean, p_fecha date)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if p_fecha is null then
    return 'Indica para qué fecha necesitas el abono.';
  end if;
  if coalesce(p_urgencia, false) then
    if p_fecha < v_hoy then
      return 'La calamidad doméstica se acepta para el mismo día en que se pide, no para días anteriores.';
    end if;
    return null;
  end if;
  if p_fecha <= v_hoy then
    return 'Los abonos están sujetos al flujo de caja de la compañía: no se pueden pedir para el mismo día. Se piden desde mañana, a menos que sea una calamidad doméstica urgente (con su justificación).';
  end if;
  return null;
end;
$$;

-- ============================================================ 3) el trigger (igual que en la 64, más la fecha)
create or replace function public.fn_abonos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_duenio boolean;
  v_tope numeric;
  v_bloqueo text;
begin
  -- Evidencia: desembolsado, no cambia nada, para nadie (ni el administrador por SQL sin
  -- desactivar el trigger a propósito).
  if tg_op = 'UPDATE' and old.estado = 'desembolsado' then
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'El abono ya se desembolsó: el registro y el pantallazo no se cambian.';
    end if;
    return new;
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.persona_id is distinct from auth.uid() then
      raise exception 'Un abono se solicita a nombre propio.';
    end if;
    new.estado := 'solicitado';
    new.fecha_solicitud := (now() at time zone 'America/Bogota')::date;
    new.solicitado_en := now();
    new.decidido_por := null; new.decidido_en := null; new.motivo_rechazo := null;
    new.fecha_desembolso := null; new.pantallazo_path := null;
    new.desembolso_registrado_por := null; new.desembolso_registrado_en := null;
    -- Migración 68: para qué fecha, y el porqué si no se puede.
    v_bloqueo := fn_abono_fecha_bloqueada(new.urgencia_calamidad, new.fecha_requerida);
    if v_bloqueo is not null then
      raise exception '%', v_bloqueo;
    end if;
    return new;
  end if;

  -- UPDATE
  v_duenio := old.persona_id = auth.uid();
  if (new.persona_id, new.fecha_solicitud, new.solicitado_en)
     is distinct from (old.persona_id, old.fecha_solicitud, old.solicitado_en) then
    raise exception 'El abono no cambia de dueño ni de fecha de solicitud.';
  end if;
  if (new.monto, new.justificacion, new.fecha_requerida, new.urgencia_calamidad)
     is distinct from (old.monto, old.justificacion, old.fecha_requerida, old.urgencia_calamidad) then
    if not v_duenio or old.estado <> 'solicitado' then
      raise exception 'Solo quien lo pidió cambia el abono, y mientras no esté decidido.';
    end if;
    if (new.fecha_requerida, new.urgencia_calamidad) is distinct from (old.fecha_requerida, old.urgencia_calamidad) then
      v_bloqueo := fn_abono_fecha_bloqueada(new.urgencia_calamidad, new.fecha_requerida);
      if v_bloqueo is not null then
        raise exception '%', v_bloqueo;
      end if;
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if old.estado = 'solicitado' and new.estado = 'anulado' then
      if not v_duenio then
        raise exception 'Solo quien lo pidió anula el abono.';
      end if;
    elsif (old.estado = 'solicitado' and new.estado in ('aprobado', 'rechazado', 'desembolsado'))
       or (old.estado = 'aprobado' and new.estado = 'desembolsado') then
      if not fn_es_aprobador_rrhh('abonos') then
        raise exception 'Solo el aprobador decide los abonos.';
      end if;
      if v_duenio then
        raise exception 'Nadie aprueba su propio abono.';
      end if;
      select monto_maximo_abono into v_tope from rrhh_aprobadores where perfil_id = auth.uid();
      if v_tope is not null and new.monto > v_tope and new.estado <> 'rechazado' then
        raise exception 'El abono supera tu tope de aprobación.';
      end if;
      if old.estado = 'solicitado' then
        if new.estado = 'rechazado' and length(trim(coalesce(new.motivo_rechazo, ''))) = 0 then
          raise exception 'Escribe por qué se rechaza.';
        end if;
        if new.estado <> 'rechazado' then
          new.motivo_rechazo := null;
        end if;
        new.decidido_por := auth.uid();
        new.decidido_en := now();
      end if;
      if new.estado = 'desembolsado' then
        if new.fecha_desembolso is null or new.pantallazo_path is null then
          raise exception 'Para registrar el desembolso sube el pantallazo y pon la fecha de la transferencia.';
        end if;
        if new.fecha_desembolso > (now() at time zone 'America/Bogota')::date then
          raise exception 'La fecha del desembolso no puede ser futura.';
        end if;
        if new.fecha_desembolso < old.fecha_solicitud then
          raise exception 'La fecha del desembolso no puede ser anterior a la solicitud.';
        end if;
        if new.pantallazo_path not like 'abonos/' || old.id || '/%' then
          raise exception 'El pantallazo no corresponde a este abono.';
        end if;
        new.desembolso_registrado_por := auth.uid();
        new.desembolso_registrado_en := now();
      end if;
    else
      raise exception 'Un abono no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;

  -- Lo que escribe cada paso solo cambia en ese paso.
  if (new.decidido_por, new.decidido_en, new.motivo_rechazo)
     is distinct from (old.decidido_por, old.decidido_en, old.motivo_rechazo)
     and not (old.estado = 'solicitado' and new.estado in ('aprobado', 'rechazado', 'desembolsado')) then
    raise exception 'La decisión del abono no se edita.';
  end if;
  if (new.fecha_desembolso, new.pantallazo_path, new.desembolso_registrado_por, new.desembolso_registrado_en)
     is distinct from (old.fecha_desembolso, old.pantallazo_path, old.desembolso_registrado_por, old.desembolso_registrado_en)
     and not (old.estado in ('solicitado', 'aprobado') and new.estado = 'desembolsado') then
    raise exception 'El desembolso se registra una sola vez, con el pantallazo.';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_abonos_reglas() from public, anon, authenticated;

revoke all on function public.fn_abono_fecha_bloqueada(boolean, date) from public, anon;
grant execute on function public.fn_abono_fecha_bloqueada(boolean, date) to authenticated, service_role;

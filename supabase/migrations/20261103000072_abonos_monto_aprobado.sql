-- Abonos: lo aprobado al lado de lo solicitado (2026-10-26). Dictado por Jhojan:
--   "Debe haber un campo para cuando se aprueba, en donde se marque lo que se aprobó vs lo
--    solicitado, por ejemplo camilo garcia solicitó 350.000 pero se le pudo aprobar 200.000."
--
-- monto_aprobado:
--   - Lo pone el APROBADOR al aprobar o al desembolsar; nunca el que pide, nunca después de
--     desembolsado (eso ya lo garantizaba la 64: desembolsado no cambia nada, para nadie).
--   - Si no lo escribe, queda igual a lo solicitado (el caso normal).
--   - Mayor que 0 y NO mayor que lo solicitado: aprobar más no es aprobar, es otro abono.
--   - Al rechazar o anular queda vacío.
--   - `monto` (lo solicitado) nunca se reescribe al aprobar: es lo que se ve al lado.
--   - El tope del aprobador (rrhh_aprobadores.monto_maximo_abono) se mide contra lo aprobado,
--     que es lo que se va a desembolsar.
--   - Lo que se descuenta en la quincena es lo APROBADO. En la base nada más lee `monto` como
--     "lo que se le dio" (revisado: solo las pantallas de abonos, que se ajustan con esta).
--
-- Los abonos que ya están aprobados o desembolsados quedan con lo aprobado = lo solicitado (es
-- lo que pasó: hasta hoy no había forma de aprobar menos). Para escribirlo en los desembolsados
-- se apaga el trigger SOLO durante ese update: es el único caso en que un desembolsado cambia, y
-- no cambia nada de lo que ya tenía.
--
-- Verificación: supabase/verificaciones/20261103000072_verificar.sql
-- Rollback:     supabase/rollbacks/20261103000072_abonos_monto_aprobado_down.sql
-- Idempotente.

-- ============================================================ 1) columna
alter table public.abonos add column if not exists monto_aprobado numeric(14,2);
alter table public.abonos drop constraint if exists abonos_monto_aprobado;
alter table public.abonos add constraint abonos_monto_aprobado
  check (monto_aprobado is null or (monto_aprobado > 0 and monto_aprobado <= monto));
comment on column public.abonos.monto_aprobado is 'Lo aprobado y desembolsado (lo que se descuenta). Lo pone el aprobador; no mayor que monto (lo solicitado).';

-- ============================================================ 2) los que ya estaban aprobados
alter table public.abonos disable trigger trg_abonos_reglas;
update public.abonos set monto_aprobado = monto
where estado in ('aprobado', 'desembolsado') and monto_aprobado is null;
alter table public.abonos enable trigger trg_abonos_reglas;

-- Aprobado o desembolsado ⇔ tiene lo aprobado.
alter table public.abonos drop constraint if exists abonos_monto_aprobado_estado;
alter table public.abonos add constraint abonos_monto_aprobado_estado
  check ((estado in ('aprobado', 'desembolsado')) = (monto_aprobado is not null));

-- ============================================================ 3) el trigger (el de la 68, más lo aprobado)
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
    new.monto_aprobado := null;  -- migración 72: lo pone el aprobador, nunca el que pide
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
      new.monto_aprobado := null;
    elsif (old.estado = 'solicitado' and new.estado in ('aprobado', 'rechazado', 'desembolsado'))
       or (old.estado = 'aprobado' and new.estado = 'desembolsado') then
      if not fn_es_aprobador_rrhh('abonos') then
        raise exception 'Solo el aprobador decide los abonos.';
      end if;
      if v_duenio then
        raise exception 'Nadie aprueba su propio abono.';
      end if;
      -- Migración 72: lo aprobado. Si el aprobador no lo escribe, es lo solicitado (o lo que ya
      -- había aprobado, si ahora desembolsa). Al rechazar, nada. El tope se mide contra lo que se
      -- va a desembolsar, no contra lo pedido.
      if new.estado = 'rechazado' then
        new.monto_aprobado := null;
      else
        new.monto_aprobado := coalesce(new.monto_aprobado, old.monto_aprobado, old.monto);
        if new.monto_aprobado > old.monto then
          raise exception 'No se aprueba más de lo solicitado (%). Si hace falta más, que pida otro abono.', old.monto;
        end if;
      end if;
      select monto_maximo_abono into v_tope from rrhh_aprobadores where perfil_id = auth.uid();
      if v_tope is not null and new.monto_aprobado > v_tope and new.estado <> 'rechazado' then
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
  if new.monto_aprobado is distinct from old.monto_aprobado
     and not ((old.estado = 'solicitado' and new.estado in ('aprobado', 'rechazado', 'desembolsado', 'anulado'))
              or (old.estado = 'aprobado' and new.estado = 'desembolsado')) then
    raise exception 'Lo aprobado lo pone el aprobador al aprobar o al desembolsar.';
  end if;
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

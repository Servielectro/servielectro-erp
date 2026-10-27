-- Migración 84: corregir un registro cerrado, con rastro (2026-10-27). Primera vuelta: abonos.
--
-- Origen: el relleno de la migración 72 puso, a los abonos ya desembolsados, lo aprobado igual a
-- lo solicitado (hasta ese día no había forma de aprobar menos). En el abono de Camilo eso era
-- falso: pidió 350.000 y se giraron 200.000; le iban a descontar 150.000 de más. Se corrigió a
-- mano en la base, apagando el disparador, y no quedó rastro. Esto no puede volverse costumbre.
--
-- No es "editar": es CORREGIR. Un registro cerrado sigue sin cambiar por el camino normal; la
-- corrección es otro camino, con motivo, con contraseña, y deja el valor anterior a la vista.
--
-- Diseño (pensado para liquidaciones, desprendibles y caja menor, que tienen el mismo problema;
-- en esta vuelta solo se implementan los abonos):
--   - `correcciones`: una fila por campo corregido (tabla, registro, campo, valor anterior,
--     valor nuevo, motivo, de quién es la plata, quién, cuándo, en qué transacción). Solo se
--     inserta; nadie la edita ni la borra. Nadie inserta directo: solo las funciones de
--     corrección de cada tabla (security definer).
--   - La tabla corregida exige el rastro: su disparador deja cambiar un campo corregible de un
--     registro cerrado SOLO si en la MISMA transacción hay una fila de `correcciones` con ese
--     valor anterior y ese valor nuevo. Así "la corrección sin el rastro" no existe ni por SQL
--     del administrador (salvo apagando el disparador a propósito, como hasta hoy).
--   - Cada tabla tiene su función (`fn_corregir_abono`, después `fn_corregir_liquidacion`…)
--     con sus campos corregibles y sus reglas; la tabla de rastro y la exigencia son comunes.
--   - Quién ve el rastro: quien ve el registro (la política mira la tabla de origen con la RLS
--     de quien consulta). El dueño de la plata recibe un aviso.
--
-- Abonos:
--   - Solo un abono DESEMBOLSADO se corrige (antes de eso se decide en el flujo normal).
--   - Campos corregibles: `monto_aprobado` y `fecha_desembolso`. Nada más: ni lo solicitado,
--     ni quién lo pidió, ni el pantallazo, ni el estado. Un pantallazo equivocado no es una
--     corrección: es un abono mal registrado y se maneja distinto.
--   - Solo el aprobador de abonos, nunca sobre su propio abono, dentro de su tope, y con la
--     contraseña confirmada (el mismo mecanismo de la migración 62: la verifica el servidor y
--     la base exige la marca reciente; se gasta después de cada intento).
--   - Cambiar la fecha del desembolso mueve la quincena del descuento (columna calculada).
--
-- Al final se registra la corrección que se hizo a mano en producción, para que no quede
-- invisible (solo si ese abono existe y ya tiene los 200.000).
--
-- Verificación: supabase/verificaciones/20261112000084_verificar.sql
-- Rollback:     supabase/rollbacks/20261112000084_correcciones_con_rastro_down.sql
-- Idempotente.

-- ============================================================ 1) el rastro
create table if not exists public.correcciones (
  id uuid primary key default gen_random_uuid(),
  tabla text not null check (tabla in ('abonos')),     -- se amplía cuando llegue la siguiente
  registro_id uuid not null,
  campo text not null,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  motivo text not null check (length(trim(motivo)) > 0),
  afectado_id uuid references public.perfiles (id),    -- de quién es la plata: lo ve y le llega el aviso
  corregido_por uuid references public.perfiles (id),  -- vacío solo en la corrección hecha a mano antes de la 84
  corregido_por_nombre text not null,
  corregido_en timestamptz not null default now(),
  transaccion bigint not null default txid_current(),  -- la tabla corregida exige el rastro de ESTA transacción
  constraint correcciones_cambia check (valor_anterior is distinct from valor_nuevo)
);
create index if not exists idx_correcciones_registro on public.correcciones (tabla, registro_id, corregido_en);

alter table public.correcciones enable row level security;
revoke all on table public.correcciones from anon, authenticated;
grant select on table public.correcciones to authenticated;
-- Lo ve quien ve el registro corregido (con su propia RLS sobre la tabla de origen).
drop policy if exists correcciones_select on public.correcciones;
create policy correcciones_select on public.correcciones for select to authenticated
  using (case tabla
           when 'abonos' then exists (select 1 from public.abonos a where a.id = registro_id)
           else false
         end);

create or replace function public.fn_correcciones_intocable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and current_user in ('postgres', 'supabase_admin') then
    return old;  -- solo para limpiar los datos de prueba de una verificación
  end if;
  raise exception 'Una corrección registrada no se edita ni se borra: si quedó mal, se hace otra corrección.';
end;
$$;
drop trigger if exists trg_correcciones_intocable on public.correcciones;
create trigger trg_correcciones_intocable before update or delete on public.correcciones
  for each row execute function public.fn_correcciones_intocable();
revoke all on function public.fn_correcciones_intocable() from public, anon, authenticated;

/** ¿Hay rastro de ESTA transacción para ese cambio? La usan los disparadores de las tablas corregibles. */
create or replace function public.fn_correccion_registrada(p_tabla text, p_registro uuid, p_campo text, p_anterior jsonb, p_nuevo jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from correcciones c
                 where c.tabla = p_tabla and c.registro_id = p_registro and c.campo = p_campo
                   and c.valor_anterior is not distinct from p_anterior and c.valor_nuevo is not distinct from p_nuevo
                   and c.transaccion = txid_current());
$$;
revoke all on function public.fn_correccion_registrada(text, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.fn_correccion_registrada(text, uuid, text, jsonb, jsonb) to authenticated, service_role;

-- ============================================================ 2) aviso al dueño de la plata
insert into public.notificacion_tipos (id, nombre, descripcion, para, por_defecto, orden) values
  ('abono_corregido', 'Abono corregido', 'Corrigieron un abono tuyo ya transferido (lo aprobado o la fecha): ves el antes, el ahora y el motivo.', 'tecnico', true, 4)
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, para = excluded.para;

create or replace function public.fn_notif_correccion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Sin montos en el texto (regla de la 76): el antes y el ahora se ven al entrar.
  if new.tabla = 'abonos' then
    perform fn_notificar(new.afectado_id, 'abono_corregido', 'Corrigieron un abono tuyo',
                         'Entra para ver qué cambió, el valor anterior y el motivo.', '/tecnico/abonos', 'abonos', new.registro_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notif_correccion on public.correcciones;
create trigger trg_notif_correccion after insert on public.correcciones
  for each row execute function public.fn_notif_correccion();
revoke all on function public.fn_notif_correccion() from public, anon, authenticated;

-- ============================================================ 3) abonos: el disparador exige el rastro
-- El de la 72, con un solo cambio: el bloque de "desembolsado". Lo demás, igual.
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
  -- Evidencia: desembolsado no se edita, para nadie. Migración 84: lo aprobado y la fecha del
  -- desembolso se CORRIGEN, y solo si la corrección quedó registrada en esta misma transacción
  -- (fn_corregir_abono). Ni el administrador por SQL lo cambia sin dejar rastro, salvo
  -- desactivando el disparador a propósito.
  if tg_op = 'UPDATE' and old.estado = 'desembolsado' then
    if (to_jsonb(new) - array['updated_at', 'monto_aprobado', 'fecha_desembolso', 'quincena_descuento'])
       is distinct from (to_jsonb(old) - array['updated_at', 'monto_aprobado', 'fecha_desembolso', 'quincena_descuento']) then
      raise exception 'El abono ya se desembolsó: el registro y el pantallazo no se cambian.';
    end if;
    if new.monto_aprobado is distinct from old.monto_aprobado
       and not fn_correccion_registrada('abonos', old.id, 'monto_aprobado', to_jsonb(old.monto_aprobado), to_jsonb(new.monto_aprobado)) then
      raise exception 'El abono ya se desembolsó: no se edita, se corrige (con motivo y contraseña) y queda el rastro.';
    end if;
    if new.fecha_desembolso is distinct from old.fecha_desembolso
       and not fn_correccion_registrada('abonos', old.id, 'fecha_desembolso', to_jsonb(old.fecha_desembolso), to_jsonb(new.fecha_desembolso)) then
      raise exception 'El abono ya se desembolsó: no se edita, se corrige (con motivo y contraseña) y queda el rastro.';
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

-- ============================================================ 4) corregir un abono
-- p_valor_nuevo: pesos ("200000") o fecha ("2026-10-15"). La corrección y el rastro van juntos:
-- primero el rastro, después el cambio; si algo falla, no queda ninguno de los dos.
create or replace function public.fn_corregir_abono(p_abono uuid, p_campo text, p_valor_nuevo text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_monto numeric(14,2);
  v_fecha date;
  v_tope numeric;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if auth.uid() is null or not fn_es_aprobador_rrhh('abonos') then
    raise exception 'Solo el aprobador de abonos corrige un abono.';
  end if;
  if not fn_reautenticado_reciente() then
    raise exception 'Para corregir, confirma con tu contraseña.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Escribe el motivo de la corrección: queda a la vista de RRHH y de la persona.';
  end if;
  if p_campo is null or p_campo not in ('monto_aprobado', 'fecha_desembolso') then
    raise exception 'De un abono solo se corrige lo aprobado o la fecha del desembolso. Si el pantallazo está mal, no es una corrección: es un abono mal registrado.';
  end if;

  select * into a from abonos where id = p_abono for update;
  if not found then
    raise exception 'No se encontró el abono.';
  end if;
  if a.estado <> 'desembolsado' then
    raise exception 'Solo se corrige un abono ya desembolsado; antes de eso se decide en el flujo normal.';
  end if;
  if a.persona_id = auth.uid() then
    raise exception 'Nadie corrige su propio abono.';
  end if;

  if p_campo = 'monto_aprobado' then
    begin
      v_monto := replace(trim(p_valor_nuevo), ' ', '')::numeric;
    exception when others then
      raise exception 'Escribe lo aprobado en pesos, solo con números.';
    end;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Lo aprobado tiene que ser mayor que cero.';
    end if;
    if v_monto > a.monto then
      raise exception 'No se aprueba más de lo solicitado (%). Si hace falta más, que pida otro abono.', a.monto;
    end if;
    if v_monto = a.monto_aprobado then
      raise exception 'Ese ya es el valor aprobado: no hay nada que corregir.';
    end if;
    select monto_maximo_abono into v_tope from rrhh_aprobadores where perfil_id = auth.uid();
    if v_tope is not null and v_monto > v_tope then
      raise exception 'El valor supera tu tope de aprobación.';
    end if;
    insert into correcciones (tabla, registro_id, campo, valor_anterior, valor_nuevo, motivo, afectado_id, corregido_por, corregido_por_nombre)
    values ('abonos', a.id, 'monto_aprobado', to_jsonb(a.monto_aprobado), to_jsonb(v_monto), trim(p_motivo), a.persona_id, auth.uid(), fn_nombre_actor());
    update abonos set monto_aprobado = v_monto where id = a.id;
  else
    begin
      v_fecha := trim(p_valor_nuevo)::date;
    exception when others then
      raise exception 'Escribe la fecha del desembolso (año-mes-día).';
    end;
    if v_fecha is null then
      raise exception 'Escribe la fecha del desembolso.';
    end if;
    if v_fecha > v_hoy then
      raise exception 'La fecha del desembolso no puede ser futura.';
    end if;
    if v_fecha < a.fecha_solicitud then
      raise exception 'La fecha del desembolso no puede ser anterior a la solicitud.';
    end if;
    if v_fecha = a.fecha_desembolso then
      raise exception 'Esa ya es la fecha del desembolso: no hay nada que corregir.';
    end if;
    insert into correcciones (tabla, registro_id, campo, valor_anterior, valor_nuevo, motivo, afectado_id, corregido_por, corregido_por_nombre)
    values ('abonos', a.id, 'fecha_desembolso', to_jsonb(a.fecha_desembolso), to_jsonb(v_fecha), trim(p_motivo), a.persona_id, auth.uid(), fn_nombre_actor());
    update abonos set fecha_desembolso = v_fecha where id = a.id;
  end if;
end;
$$;
revoke all on function public.fn_corregir_abono(uuid, text, text, text) from public, anon;
grant execute on function public.fn_corregir_abono(uuid, text, text, text) to authenticated;

-- ============================================================ 5) la corrección que se hizo a mano
-- Abono de Camilo: pidió 350.000, se giraron 200.000. El 27/10/2026 se corrigió en la base
-- apagando el disparador; aquí queda su rastro (y a él le llega el aviso, como con cualquier
-- corrección). Solo si el abono existe y ya está en 200.000; una sola vez.
insert into public.correcciones (tabla, registro_id, campo, valor_anterior, valor_nuevo, motivo, afectado_id,
                                 corregido_por, corregido_por_nombre)
select 'abonos', a.id, 'monto_aprobado', to_jsonb(350000::numeric(14,2)), to_jsonb(a.monto_aprobado),
       'El relleno de la migración 72 asumió que lo aprobado era igual a lo solicitado; se giraron 200.000. '
       || 'Corregido directamente en la base el 27/10/2026, a pedido de Jhojan, antes de que existiera la corrección con rastro.',
       a.persona_id, null, 'Administrador del sistema (a pedido de Jhojan)'
from public.abonos a
where a.id = 'a9d1b4f9-1636-477b-be9a-90ce5bb88e87'
  and a.monto_aprobado = 200000
  and not exists (select 1 from public.correcciones c
                  where c.tabla = 'abonos' and c.registro_id = a.id and c.campo = 'monto_aprobado');

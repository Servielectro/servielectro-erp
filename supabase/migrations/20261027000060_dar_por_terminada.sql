-- "Dar por terminada": Operativo cierra una OBRA en curso, quedando quién y cuándo.
--
-- Por qué (2026-10-21): la entrega de una obra se hace con una visita aparte, de un día, que
-- es la que firma el cliente (decisión de Jhojan). La obra en sí nunca llega a "firmada", y
-- de "en curso" solo se podía cerrar desde "firmada": quedaba en curso para siempre y
-- ensuciaba la lista de Operativo.
--
-- Reglas (trigger fn_visita_cierre, antes de actualizar visitas):
--   - Pasar a "cerrada" requiere operativo/trabajar.
--   - Se cierra desde "firmada" (como siempre) o, SOLO si es una obra, desde "en curso". Una
--     visita de un día no se da por terminada: se cierra con la firma del cliente.
--   - Al cerrar quedan cerrada_en (ahora) y cerrada_por (quien cierra), puestos por la base; y
--     opcionalmente cierre_nota (ej. "entregada con la visita del 30/10").
--   - "cerrada" es final, y quién/cuándo/nota no se cambian después.
--
-- Dos ajustes que esto obliga:
--   1) Candado (fn_candado_visita, versión de la 58): en una visita firmada solo cambiaba el
--      estado; ahora el paso firmada → cerrada también escribe cerrada_en/cerrada_por/
--      cierre_nota, y el candado lo habría rechazado. Se excluyen esas tres columnas de la
--      comparación (las controla fn_visita_cierre). Nada más del candado cambia.
--   2) fn_puede_escribir_visita: el técnico ya no escribe evidencia (jornadas, fotos,
--      sugerencias, archivos) en una visita "cerrada" o "cancelada". Antes el permiso no
--      miraba el estado: una obra cerrada seguía recibiendo jornadas nuevas. Operativo no
--      cambia. Consecuencia que hay que saber: si al técnico le queda algo sin subir de una
--      obra que Operativo ya cerró, eso ya no sube (la pantalla lo avisa antes de cerrar).
--
-- Sobre funciones de la 45 (fn_puede_escribir_visita) y la 58 (fn_candado_visita), sin drift.
-- Idempotente.
-- Verificación: supabase/verificaciones/20261027000060_verificar.sql
-- Rollback:     supabase/rollbacks/20261027000060_dar_por_terminada_down.sql

-- ============================================================ 1) columnas
alter table public.visitas add column if not exists cerrada_en timestamptz;
alter table public.visitas add column if not exists cerrada_por uuid references auth.users (id);
alter table public.visitas add column if not exists cierre_nota text;

-- ============================================================ 2) reglas del cierre
create or replace function public.fn_visita_cierre()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if new.estado = 'cerrada' and old.estado is distinct from 'cerrada' then
    if not fn_tiene_permiso('operativo', 'trabajar') then
      raise exception 'Cerrar una visita requiere permiso de Operativo.';
    end if;
    if not (old.estado = 'firmada' or (old.tipo = 'obra' and old.estado = 'en_curso')) then
      raise exception 'Solo se da por terminada una obra en curso. Una visita de un día se cierra con la firma del cliente.';
    end if;
    new.cerrada_en := now();
    new.cerrada_por := auth.uid();
    return new;
  end if;

  if old.estado = 'cerrada' and new.estado is distinct from old.estado then
    raise exception 'Una visita cerrada es final: no cambia de estado.';
  end if;
  if (new.cerrada_en, new.cerrada_por, new.cierre_nota) is distinct from (old.cerrada_en, old.cerrada_por, old.cierre_nota) then
    raise exception 'Quién y cuándo cerró la visita lo pone la base al cerrar; no se cambia.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_visita_cierre on public.visitas;
create trigger trg_visita_cierre before update on public.visitas
  for each row execute function public.fn_visita_cierre();
revoke all on function public.fn_visita_cierre() from public, anon, authenticated;

-- ============================================================ 3) candado: el cierre escribe sus tres columnas
create or replace function public.fn_candado_visita()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Por jsonb: visitas no tiene columna visita_id y plpgsql fallaría al resolver old.visita_id.
  v_visita uuid := case when tg_table_name = 'visitas' then old.id
                        else (to_jsonb(old) ->> 'visita_id')::uuid end;
begin
  if current_user in ('postgres', 'supabase_admin') or not fn_visita_firmada(v_visita) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'La visita ya está firmada por el cliente: no se puede borrar. Agrega una nota posterior.';
  end if;

  if tg_table_name = 'visitas' then
    -- Nada fuera del estado cambia, y el estado solo avanza: firmada → cerrada, con
    -- Operativo. Quedarse igual (un update sin cambios) no es error. Migración 60: el cierre
    -- escribe cerrada_en/cerrada_por/cierre_nota, que controla fn_visita_cierre.
    if (to_jsonb(new) - array['estado', 'updated_at', 'cerrada_en', 'cerrada_por', 'cierre_nota'])
       is distinct from (to_jsonb(old) - array['estado', 'updated_at', 'cerrada_en', 'cerrada_por', 'cierre_nota']) then
      raise exception 'La visita ya está firmada por el cliente: no se edita. Agrega una nota posterior.';
    end if;
    if new.estado is distinct from old.estado then
      if not (old.estado = 'firmada' and new.estado = 'cerrada') then
        raise exception 'Una visita firmada no vuelve atrás: de "%" no puede pasar a "%".', old.estado, new.estado;
      end if;
      if not fn_tiene_permiso('operativo', 'trabajar') then
        raise exception 'Cerrar una visita firmada requiere permiso de Operativo.';
      end if;
    end if;
    return new;
  end if;

  -- Jornadas, fotos y sugerencias: el contenido de evidencia no cambia. Un update que deja
  -- el contenido igual (reintento) pasa; lo demás de cada tabla (traslado a Drive de la
  -- foto, recorrido de la sugerencia) sí puede cambiar.
  if fn_contenido_evidencia(tg_table_name, to_jsonb(new)) is distinct from fn_contenido_evidencia(tg_table_name, to_jsonb(old)) then
    -- Migración 58: la única excepción, marcar la salida una vez con la visita "firmada".
    if tg_table_name = 'visita_jornadas'
       and (select estado from visitas where id = v_visita) = 'firmada'
       and fn_es_salida_tras_firma(to_jsonb(old), to_jsonb(new)) then
      return new;
    end if;
    raise exception 'La visita ya está firmada por el cliente: ese registro no se puede cambiar. Agrega una nota posterior.';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_candado_visita() from public, anon, authenticated;

-- ============================================================ 4) el técnico no escribe en una visita cerrada
create or replace function public.fn_puede_escribir_visita(p_visita_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('operativo', 'trabajar')
      or (fn_tiene_permiso('tecnico', 'trabajar')
          and exists (select 1 from visitas v
                      where v.id = p_visita_id and v.tecnico_id = auth.uid()
                        and v.estado not in ('cerrada', 'cancelada')));
$$;
-- Mismos privilegios que en la 54.
revoke all on function public.fn_puede_escribir_visita(uuid) from public, anon;
grant execute on function public.fn_puede_escribir_visita(uuid) to authenticated, service_role;

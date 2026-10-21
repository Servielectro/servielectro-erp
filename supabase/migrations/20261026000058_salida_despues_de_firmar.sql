-- Orden nuevo en la visita: firma del técnico → firma del cliente → marcar salida.
--
-- Decisión de Jhojan (2026-10-21): "la firma vaya antes de darle salida al técnico. Con las
-- firmas sí le puede dar salida; con eso evitamos el que se vaya y no quede firmado. El
-- marcar salida es lo último." Revierte el orden anterior (salida → firma del cliente), que
-- dejaba que el técnico se fuera sin que nadie firmara.
--
-- El problema: la firma del cliente pone la visita en "firmada" y el candado de evidencia
-- (migraciones 45 y 49) rechaza todo cambio de contenido en visita_jornadas. Con el orden
-- nuevo, la salida llega DESPUÉS de la firma y el candado la rechazaba.
--
-- La solución NO abre el candado. Es una excepción estrecha y de una sola vez:
--   - solo en visita_jornadas, solo con la visita en "firmada" (no en "cerrada", que es final);
--   - solo pasan de NULO a VALOR estas columnas: check_out_en, check_out_gps_estado,
--     check_out_lat, check_out_lng, check_out_precision_m, fotos_al_salir y
--     motivo_fotos_incompletas;
--   - la salida se marca una vez: si la jornada ya tenía salida, o alguna de esas columnas ya
--     tenía valor y cambia, se rechaza;
--   - todo lo demás sigue igual de cerrado: labor_ejecutada, no_ejecutado, pendiente,
--     observaciones, la entrada, las fotos y las sugerencias. El cliente firma lo que vio.
--
-- La excepción va en los dos triggers: la app sube la jornada con un upsert, y el trigger
-- "antes de insertar" actúa antes que el de actualizar; si solo se abría el de actualizar, el
-- upsert se seguía rechazando.
--
-- Sobre funciones de la 49 (fn_candado_visita, fn_candado_visita_insert), sin drift.
-- Idempotente.
-- Verificación: supabase/verificaciones/20261026000058_verificar.sql
-- Rollback:     supabase/rollbacks/20261026000058_salida_despues_de_firmar_down.sql

-- ============================================================ la excepción
-- true si de p_old a p_new lo único que cambia es la salida, de nulo a valor, una sola vez.
create or replace function public.fn_es_salida_tras_firma(p_old jsonb, p_new jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_salida constant text[] := array[
    'check_out_en', 'check_out_gps_estado', 'check_out_lat', 'check_out_lng', 'check_out_precision_m',
    'fotos_al_salir', 'motivo_fotos_incompletas'];
  k text;
begin
  -- Lo que no es la salida, idéntico.
  if (fn_contenido_evidencia('visita_jornadas', p_new) - v_salida)
     is distinct from (fn_contenido_evidencia('visita_jornadas', p_old) - v_salida) then
    return false;
  end if;
  -- La salida se marca una vez, y lo que llega es una salida de verdad.
  if coalesce(p_old -> 'check_out_en', 'null'::jsonb) <> 'null'::jsonb then
    return false;
  end if;
  if coalesce(p_new -> 'check_out_en', 'null'::jsonb) = 'null'::jsonb then
    return false;
  end if;
  -- Cada columna de la salida que cambia, cambia desde nulo.
  foreach k in array v_salida loop
    if (p_new -> k) is distinct from (p_old -> k)
       and coalesce(p_old -> k, 'null'::jsonb) <> 'null'::jsonb then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.fn_es_salida_tras_firma(jsonb, jsonb) from public, anon;
-- La llaman los triggers, que corren como quien escribe (el técnico).
grant execute on function public.fn_es_salida_tras_firma(jsonb, jsonb) to authenticated, service_role;

-- ============================================================ antes de insertar (upsert de la app)
create or replace function public.fn_candado_visita_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existente jsonb;
begin
  if current_user in ('postgres', 'supabase_admin') or not fn_visita_firmada(new.visita_id) then
    return new;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', tg_table_name)
    into v_existente using new.id;

  if v_existente is not null
     and fn_contenido_evidencia(tg_table_name, v_existente) = fn_contenido_evidencia(tg_table_name, to_jsonb(new)) then
    return null;  -- reintento idéntico: sin cambios
  end if;

  -- Migración 58: la salida después de la firma. Se deja pasar al "on conflict do update",
  -- donde fn_candado_visita vuelve a revisarla contra la fila real.
  if v_existente is not null
     and tg_table_name = 'visita_jornadas'
     and (select estado from visitas where id = new.visita_id) = 'firmada'
     and fn_es_salida_tras_firma(v_existente, to_jsonb(new)) then
    return new;
  end if;

  if v_existente is not null then
    raise exception 'La visita ya está firmada por el cliente: ese registro no se puede cambiar. Usa una nota posterior.';
  end if;
  raise exception 'La visita ya está firmada por el cliente: no se agrega nada. Usa una nota posterior.';
end;
$$;

-- ============================================================ antes de actualizar / borrar
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
    -- Operativo. Quedarse igual (un update sin cambios) no es error.
    if (to_jsonb(new) - array['estado', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado', 'updated_at']) then
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

-- Los triggers ya existen (45) y apuntan a estas funciones por nombre: no se recrean.
-- Privilegios de las funciones de trigger: igual que en la 54 (nadie las llama directo).
revoke all on function public.fn_candado_visita() from public, anon, authenticated;
revoke all on function public.fn_candado_visita_insert() from public, anon, authenticated;

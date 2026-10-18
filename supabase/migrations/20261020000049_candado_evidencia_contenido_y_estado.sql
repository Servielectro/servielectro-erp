-- Candado de evidencia, corregido con lo que mostró la verificación contra la base real
-- (supabase/verificaciones/20261020000048_verificar_salida_y_candado.sql, 2026-10-20):
--
--   B1/B2: un reintento IDÉNTICO de la cola después de la firma del cliente (la jornada
--          con el mismo contenido, una foto ya subida con "on conflict do nothing") se
--          rechazaba: el trigger "antes de insertar" actúa antes de que la base note que
--          es un duplicado. Era un falso error, y la app lo reintentaba para siempre.
--   B4:    AGUJERO. El candado eximía la columna estado por completo: un técnico con su
--          propia sesión devolvía a "en_curso" una visita que el cliente ya firmó.
--
-- Criterios (aprobados por el usuario):
--   1) Una visita firmada no vuelve atrás nunca. De "firmada" solo pasa a "cerrada", y eso
--      solo con operativo/trabajar. "cerrada" es final. firmada_en no se toca.
--   2) El reintento idéntico se toma como "sin cambios" (no se inserta nada, no hay error).
--      Lo decide el CONTENIDO, no el id: mismo id con contenido distinto es editar
--      evidencia firmada y se sigue rechazando.
--
-- "Contenido" = las columnas que son evidencia, listadas a mano por tabla (fn_contenido_
-- evidencia). Quedan fuera las de control: created_at, updated_at, y en fotos los datos
-- del traslado a Drive; en sugerencias, su recorrido (estado, tomada_por, cotización),
-- que sigue cambiando después de la firma por fn_cambiar_estado_sugerencia.
--
-- Sobre funciones creadas en la migración 45 (del 2026-10-18, sin drift: se crearon y
-- verificaron hace dos días). Idempotente.
-- Verificación: supabase/verificaciones/20261020000048_verificar_salida_y_candado.sql
--               (los casos B con el resultado nuevo esperado)
-- Rollback:     supabase/rollbacks/20261020000049_candado_evidencia_contenido_y_estado_down.sql

-- ============================================================ contenido de evidencia
create or replace function public.fn_contenido_evidencia(p_tabla text, p_fila jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(k, p_fila -> k), '{}'::jsonb)
  from unnest(
    case p_tabla
      when 'visita_jornadas' then array[
        'visita_id', 'tecnico_id', 'fecha',
        'check_in_en', 'check_in_gps_estado', 'check_in_lat', 'check_in_lng', 'check_in_precision_m',
        'check_out_en', 'check_out_gps_estado', 'check_out_lat', 'check_out_lng', 'check_out_precision_m',
        'labor_ejecutada', 'no_ejecutado', 'pendiente', 'observaciones',
        'fotos_al_salir', 'motivo_fotos_incompletas']
      when 'visita_fotos' then array[
        'visita_id', 'jornada_id', 'storage_path', 'momento', 'tomada_en', 'bytes', 'sha256', 'nota']
      when 'visita_sugerencias' then array[
        'visita_id', 'jornada_id', 'item_catalogo_id', 'descripcion', 'cantidad', 'unidad', 'motivo',
        'requerido_para', 'sugerida_por', 'sugerida_en']
      else array[]::text[]
    end
  ) as k;
$$;

-- ============================================================ antes de insertar
-- Visita firmada: si ya existe una fila con ese id y el MISMO contenido, es un reintento:
-- se descarta sin error (return null = no se inserta; en un "on conflict do update"
-- tampoco se actualiza). Si el contenido difiere, o el id es nuevo, se rechaza.
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
    raise exception 'La visita ya está firmada por el cliente: ese registro no se puede cambiar. Agrega una nota posterior.';
  end if;
  return new;
end;
$$;

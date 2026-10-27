-- Triggers que no confunden "no tengo permiso para verlo" con "la condición es falsa" (2026-10-27).
--
-- Hallazgo (revisión de la 83 y de la 85 en producción): funciones security definer que filtran
-- por permiso y que se llaman DESDE triggers. Dentro del trigger, el filtro hace que la función
-- devuelva null o false y la regla se salta (o rechaza con un mensaje falso):
--   - fn_sst_tecnicos_de: lista null → se saltan "la cédula está en la lista" y "nadie firma dos
--     veces" (lado ABIERTO). En la app no llega a guardarse nada (la política de insert exige
--     "trabajar" en el ámbito y se evalúa después del trigger), pero cualquier inserción que no
--     pase por la política (service_role) quedaría sin esas dos reglas.
--   - fn_sst_hash_formato: hash null al firmar o al sellar, por la misma vía.
--   - fn_sst_firma_reglas (invoker): lee sst_formatos bajo la RLS de quien firma; si no lo ve,
--     dice "El formato ya está cerrado" aunque esté en borrador (lado seguro, mensaje falso: es lo
--     que destapó la prueba 3b de la 85).
-- Auditoría completa (todas las migraciones, última versión de cada función): son estas tres.
-- Las demás definer con permiso que se llaman desde triggers (fn_rrhh_ve_todo,
-- fn_puede_editar_contenido_tarea, fn_validar_responsable_subtarea) preguntan a propósito "¿puede
-- este usuario?": esa es su condición, no un filtro de visibilidad.
--
-- Regla desde aquí (como fn_notificar, migración 76): una función de lectura que usa un trigger
-- NO filtra por permiso cuando corre dentro de un trigger (pg_trigger_depth() > 0). Llamada
-- directamente desde la app (profundidad 0) sigue filtrando igual que antes.
--
-- Además:
--   - Mensajes que dicen lo que pasó: "No tienes permiso para firmar formatos de …", "Ese
--     formato no existe", y "ya está cerrado" solo cuando lo está.
--   - Reintento idempotente de una firma: la app la manda con ON CONFLICT (id) DO NOTHING, pero
--     los triggers BEFORE corren antes de detectar el conflicto y la 83 la rechazaba como "Ese
--     técnico ya firmó este formato" (era la misma firma, reintentada tras un corte de señal). Si
--     la firma con ese id ya existe, los triggers la dejan pasar y el ON CONFLICT la descarta; sin
--     ON CONFLICT, la clave primaria la rechaza igual.
--   - fn_sst_personal: la 85 la recreó con drop y quedó ejecutable por PUBLIC. Se cierra.
--   - La 83 se olvidó del revoke de cuatro funciones: fn_sst_doc y fn_sst_tecnicos_problema
--     (ayudantes puros, sin datos) y los triggers fn_sst_tecnicos_formato / fn_sst_tecnicos_firma.
--     Se cierran acá; la verificación las cuenta.
--
-- Va después de la 85. Idempotente.
-- Verificación: supabase/verificaciones/20261116000088_verificar.sql
-- Rollback:     supabase/rollbacks/20261116000088_triggers_sin_filtro_de_permiso_down.sql

-- ============================================================ 1) lecturas para triggers
create or replace function public.fn_sst_tecnicos_de(p_formato_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select f.tecnicos_en_obra from sst_formatos f
  where f.id = p_formato_id
    and (pg_trigger_depth() > 0 or fn_plantillas_permiso(f.ambito, 'consultar'));
$$;

create or replace function public.fn_sst_hash_formato(p_formato_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to((jsonb_build_object(
    'plantilla', f.plantilla_id,
    'proyecto', f.proyecto_id,
    'cliente', f.cliente_id,
    'lugar', f.lugar,
    'fecha', f.fecha,
    'respuestas', f.respuestas,
    'archivos', coalesce((select jsonb_agg(jsonb_build_array(a.campo_id, a.sha256) order by a.path)
                          from sst_formato_archivos a where a.formato_id = f.id), '[]'::jsonb)
  ) || case when f.tecnicos_en_obra is null then '{}'::jsonb
            else jsonb_build_object('tecnicos_en_obra', f.tecnicos_en_obra) end)::text, 'UTF8')), 'hex')
  from sst_formatos f
  where f.id = p_formato_id
    and (pg_trigger_depth() > 0 or fn_plantillas_permiso(f.ambito, 'consultar'));
$$;

-- Estado y ámbito de un formato, para las reglas de firma. Solo dentro de un trigger (desde la
-- app devuelve nada: el formato se lee por la tabla, con su RLS).
create or replace function public.fn_sst_formato_estado_ambito(p_formato_id uuid, out estado text, out ambito text)
language sql
stable
security definer
set search_path = public
as $$
  select f.estado, f.ambito from sst_formatos f where f.id = p_formato_id and pg_trigger_depth() > 0;
$$;

-- ¿Ya existe una firma con este id? (reintento). Solo dentro de un trigger.
create or replace function public.fn_sst_firma_existe(p_firma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select pg_trigger_depth() > 0 and exists (select 1 from sst_formato_firmas where id = p_firma_id);
$$;

-- ============================================================ 2) reglas de la firma (las de la 75, con mensajes ciertos)
create or replace function public.fn_sst_firma_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_falta text[];
  v_estado text;
  v_ambito text;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Una firma registrada no se cambia ni se borra.';
  end if;
  -- Reintento de una firma que ya llegó: que la descarte el ON CONFLICT, no un error.
  if fn_sst_firma_existe(new.id) then
    return new;
  end if;
  select e.estado, e.ambito into v_estado, v_ambito from fn_sst_formato_estado_ambito(new.formato_id) e;
  if v_estado is null then
    raise exception 'Ese formato no existe.';
  end if;
  if not fn_plantillas_permiso(v_ambito, 'trabajar') then
    raise exception 'No tienes permiso para firmar formatos de %.', case v_ambito when 'proyectos' then 'Proyectos' else 'SG-SST' end;
  end if;
  if v_estado <> 'borrador' then
    raise exception 'El formato ya está cerrado: no recibe más firmas.';
  end if;
  -- Antes de la primera firma, todo lo obligatorio respondido: después ya no se puede editar.
  if not fn_sst_formato_tiene_firmas(new.formato_id) then
    v_falta := fn_sst_faltantes(new.formato_id);
    if array_length(v_falta, 1) > 0 then
      raise exception 'Antes de firmar falta llenar: %.', array_to_string(v_falta, ', ');
    end if;
  end if;
  if new.firmada_en_dispositivo > now() + interval '10 minutes' then
    raise exception 'La hora de la firma en el dispositivo está adelantada: revisa el reloj del celular.';
  end if;
  -- El registro lo pone la base, no el dispositivo.
  new.registrada_por := auth.uid();
  new.recibida_en := now();
  new.hash_contenido := fn_sst_hash_formato(new.formato_id);
  return new;
end;
$$;

-- Las de la lista de técnicos (83), con el reintento.
create or replace function public.fn_sst_tecnicos_firma()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lista jsonb;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if fn_sst_firma_existe(new.id) then
    return new;
  end if;
  v_lista := fn_sst_tecnicos_de(new.formato_id);
  -- Formato nuevo (todavía sin firmas): si la plantilla pide técnicos, primero la lista.
  if not fn_sst_formato_tiene_firmas(new.formato_id) and fn_sst_pide_tecnicos(new.formato_id)
     and coalesce(jsonb_array_length(v_lista), 0) = 0 then
    raise exception 'Antes de firmar, anota los técnicos que estuvieron en la obra (nombre y cédula): firman todos.';
  end if;
  if new.rol = 'tecnico' and v_lista is not null then
    if not exists (select 1 from jsonb_array_elements(v_lista) t where fn_sst_doc(t ->> 'documento') = fn_sst_doc(new.documento)) then
      raise exception 'La cédula % no está en la lista de técnicos que estuvieron en la obra.', new.documento;
    end if;
    if exists (select 1 from sst_formato_firmas s where s.formato_id = new.formato_id and s.rol = 'tecnico'
               and fn_sst_doc(s.documento) = fn_sst_doc(new.documento)) then
      raise exception 'Ese técnico ya firmó este formato.';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================ 3) privilegios
revoke all on function public.fn_sst_tecnicos_de(uuid) from public, anon;
revoke all on function public.fn_sst_hash_formato(uuid) from public, anon;
revoke all on function public.fn_sst_formato_estado_ambito(uuid) from public, anon;
revoke all on function public.fn_sst_firma_existe(uuid) from public, anon;
revoke all on function public.fn_sst_personal() from public, anon;
grant execute on function public.fn_sst_tecnicos_de(uuid) to authenticated, service_role;
grant execute on function public.fn_sst_hash_formato(uuid) to authenticated, service_role;
grant execute on function public.fn_sst_formato_estado_ambito(uuid) to authenticated, service_role;
grant execute on function public.fn_sst_firma_existe(uuid) to authenticated, service_role;
grant execute on function public.fn_sst_personal() to authenticated, service_role;
revoke all on function public.fn_sst_doc(text) from public, anon;
revoke all on function public.fn_sst_tecnicos_problema(jsonb) from public, anon;
grant execute on function public.fn_sst_doc(text) to authenticated, service_role;
grant execute on function public.fn_sst_tecnicos_problema(jsonb) to authenticated, service_role;
-- de trigger: nadie (Postgres revisa EXECUTE al crear el trigger, no al dispararse)
revoke all on function public.fn_sst_firma_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_tecnicos_firma() from public, anon, authenticated;
revoke all on function public.fn_sst_tecnicos_formato() from public, anon, authenticated;

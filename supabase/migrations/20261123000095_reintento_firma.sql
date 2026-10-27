-- Reintento de una firma, bien hecho (2026-10-27). Corrige la 88.
--
-- Lo que pasó (verificación 88, casos 2c y 2d): el atajo del reintento en fn_sst_firma_reglas
-- devolvía la fila ANTES de llenar registrada_por, recibida_en y hash_contenido. La fila quedaba
-- con hash_contenido nulo y el NOT NULL de la columna reventaba al armarla, antes de que el índice
-- resolviera el ON CONFLICT. El técnico con mala señal pasaba de ver "Ese técnico ya firmó este
-- formato" a ver un error de base de datos.
--
-- Ahora, en el reintento, la fila se completa COPIANDO esos tres campos de la firma que ya existe
-- (es la misma firma): queda válida y el ON CONFLICT (id) DO NOTHING la descarta. El hash NO se
-- recalcula: el formato puede haberse cerrado entre el primer intento y el reintento, y el hash de
-- ahora no tiene por qué coincidir con el de la firma original. Sin ON CONFLICT, la clave
-- primaria la rechaza ("duplicate key"), como debe.
--
-- fn_sst_tecnicos_firma no cambia: ahí el atajo no deja nada sin llenar (corre después de
-- fn_sst_firma_reglas, que ya completó la fila).
--
-- Va después de la 88. Idempotente.
-- Verificación: supabase/verificaciones/20261123000095_verificar.sql
-- Rollback:     supabase/rollbacks/20261123000095_reintento_firma_down.sql

-- Los datos de registro de una firma que ya existe. Solo dentro de un trigger (regla de la 88).
create or replace function public.fn_sst_firma_registro(p_firma_id uuid,
  out registrada_por uuid, out recibida_en timestamptz, out hash_contenido text)
language sql
stable
security definer
set search_path = public
as $$
  select f.registrada_por, f.recibida_en, f.hash_contenido
  from sst_formato_firmas f
  where f.id = p_firma_id and pg_trigger_depth() > 0;
$$;

create or replace function public.fn_sst_firma_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_falta text[];
  v_estado text;
  v_ambito text;
  v_previa record;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Una firma registrada no se cambia ni se borra.';
  end if;
  -- Reintento de una firma que ya llegó: la fila se completa con lo que ya quedó registrado (es la
  -- misma firma) y el ON CONFLICT la descarta. Sin recalcular el hash: el formato pudo cerrarse
  -- entre tanto.
  if fn_sst_firma_existe(new.id) then
    select * into v_previa from fn_sst_firma_registro(new.id);
    new.registrada_por := v_previa.registrada_por;
    new.recibida_en := v_previa.recibida_en;
    new.hash_contenido := v_previa.hash_contenido;
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

revoke all on function public.fn_sst_firma_registro(uuid) from public, anon;
grant execute on function public.fn_sst_firma_registro(uuid) to authenticated, service_role;
revoke all on function public.fn_sst_firma_reglas() from public, anon, authenticated;

-- El plan de trabajo con los estándares (108): lo que la regla de la 75 no cubre (2026-10-30).
--
-- fn_sst_plan_reglas (75) protege estándar, responsable, fecha y archivo, pero no conoce las
-- columnas que agregó la 108. Hoy cualquiera con SG-SST "trabajar" puede cambiar el PESO de un
-- estándar (valor), su código, su ciclo o marcarlo verificado, y con eso mover el puntaje de la
-- autoevaluación: un documento que se firma. Y calificado_por / calificado_en los pondría la
-- pantalla, no la base.
--
--   1. Lo que define el estándar (año, código, ciclo, grupo, valor, valor_verificado, aplica_7) no
--      lo cambia nadie desde la app. Solo una migración (postgres), como la 113.
--   2. Calificar (cumple / no cumple / no aplica / volver a pendiente) es de la gestión SST
--      ("responsable"): es la autoevaluación del artículo 27 que firma la empresa. Quién y cuándo
--      los pone la base. El motivo de "no aplica" ya lo exige el CHECK de la 108.
--   3. Lo demás de la 75 sigue igual (mismo cuerpo, con las dos reglas nuevas antes del return).
--
-- Idempotente.
-- Verificación: supabase/verificaciones/20261130000115_verificar.sql
-- Rollback:     supabase/rollbacks/20261130000115_plan_calificacion_y_pesos_protegidos_down.sql

create or replace function public.fn_sst_plan_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'El plan de trabajo no se borra: se archiva con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Los estándares de la Resolución los siembra una migración; desde la app solo tareas libres.
    if new.codigo is not null then
      raise exception 'Los estándares de la Resolución 0312 no se agregan desde la app: desde aquí se agregan tareas del plan.';
    end if;
    new.creado_por := auth.uid();
    new.creado_en := now();
    new.archivado_por := null; new.archivado_en := null; new.motivo_archivo := null;
    new.calificacion := 'pendiente'; new.motivo_no_aplica := null; new.calificado_por := null; new.calificado_en := null;
    return new;
  end if;
  if old.archivado_en is not null then
    raise exception 'El ítem está archivado: no cambia.';
  end if;
  if (new.creado_por, new.creado_en) is distinct from (old.creado_por, old.creado_en) then
    raise exception 'Quién y cuándo lo creó no se cambia.';
  end if;
  -- Estándar, responsable y fecha límite los fija la gestión; el avance lo carga también el SST.
  if (new.estandar, new.descripcion, new.responsable_id, new.fecha_limite, new.orden)
     is distinct from (old.estandar, old.descripcion, old.responsable_id, old.fecha_limite, old.orden)
     and not fn_tiene_permiso('sgsst', 'responsable') then
    raise exception 'El estándar, el responsable y la fecha límite los cambia la gestión SST.';
  end if;
  -- (108) Lo que define el estándar y su peso: nadie desde la app.
  if (new.anio, new.codigo, new.ciclo, new.grupo, new.valor, new.valor_verificado, new.aplica_7)
     is distinct from (old.anio, old.codigo, old.ciclo, old.grupo, old.valor, old.valor_verificado, old.aplica_7) then
    raise exception 'El código, el ciclo y el peso de un estándar salen de la Resolución 0312: no se cambian desde la app.';
  end if;
  -- (108) Calificar es de la gestión SST; quién y cuándo los pone la base.
  if (new.calificacion, new.motivo_no_aplica) is distinct from (old.calificacion, old.motivo_no_aplica) then
    if not fn_tiene_permiso('sgsst', 'responsable') then
      raise exception 'Calificar los estándares es de la gestión SST.';
    end if;
    if new.calificacion <> 'no_aplica' then
      new.motivo_no_aplica := null;
    end if;
    new.calificado_por := case when new.calificacion = 'pendiente' then null else auth.uid() end;
    new.calificado_en := case when new.calificacion = 'pendiente' then null else now() end;
  elsif (new.calificado_por, new.calificado_en) is distinct from (old.calificado_por, old.calificado_en) then
    raise exception 'Quién y cuándo calificó lo registra la base.';
  end if;
  if new.archivado_en is not null and old.archivado_en is null then
    if not fn_tiene_permiso('sgsst', 'responsable') then
      raise exception 'Solo la gestión SST archiva ítems del plan.';
    end if;
    if length(trim(coalesce(new.motivo_archivo, ''))) = 0 then
      raise exception 'Escribe por qué se archiva.';
    end if;
    new.archivado_por := auth.uid();
    new.archivado_en := now();
  end if;
  return new;
end;
$$;
revoke all on function public.fn_sst_plan_reglas() from public, anon, authenticated;

-- Fechas de negocio en hora de Bogotá.
--
-- Escrita sobre el ESTADO REAL consultado el 2026-10-15
-- (supabase/verificaciones/estado_fechas_zona_horaria.sql): la base corre en UTC, sin
-- zona configurada. De 7 p. m. a medianoche en Bogotá, current_date ya es "mañana":
--   - items_precios_historico.vigente_desde nacía con fecha futura → el ítem entraba en $0;
--   - cotizaciones.fecha_emision y proyecto_ejecucion_items.fecha, un día corridas;
--   - fn_guardar_cotizacion_completa saca el AÑO del consecutivo con current_date: el
--     31 de diciembre de noche, la cotización tomaría el consecutivo del año siguiente.
--
-- DOS CAPAS, a propósito:
--   1) Zona horaria de la base = America/Bogota. Arregla todo current_date de una vez,
--      incluido lo que se escriba en el futuro. Los timestamptz NO cambian de valor
--      (se guardan igual, en UTC); solo cómo se muestran.
--   2) Bogotá EXPLÍCITO donde la fecha es un documento o un precio (consecutivo, fecha de
--      emisión, vigencia del precio, fecha de ejecución): no depende de la capa 1.
--
-- Las funciones se parchean SOBRE SU DEFINICIÓN REAL (pg_get_functiondef), no sobre los
-- archivos (hay drift): se reemplaza solo la expresión de fecha y se exige que aparezca;
-- si no está, la migración falla sin cambiar nada.
--
-- IMPORTANTE: la capa 1 solo aplica a conexiones NUEVAS. Después de correrla, reiniciar
-- la API (Supabase → Project Settings → General → Restart project, o esperar a que el
-- pool renueve conexiones). La capa 2 aplica de inmediato.
--
-- Verificación: supabase/verificaciones/20261015000043_verificar.sql
-- Rollback:     supabase/rollbacks/20261015000043_fechas_hora_bogota_down.sql

-- ============================================================ 1) zona horaria de la base
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Bogota');
end $$;

-- ============================================================ 2) Bogotá explícito
-- Valores por defecto de las columnas de fecha de negocio.
alter table public.cotizaciones
  alter column fecha_emision set default ((now() at time zone 'America/Bogota')::date);
alter table public.items_precios_historico
  alter column vigente_desde set default ((now() at time zone 'America/Bogota')::date);
alter table public.proyecto_ejecucion_items
  alter column fecha set default ((now() at time zone 'America/Bogota')::date);

-- Funciones: reemplazo dentro de la definición real.
do $$
declare
  f record;
  def text;
  nuevo text;
  cambios int := 0;
begin
  -- Año del consecutivo de la cotización.
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_guardar_cotizacion_completa'
  loop
    def := pg_get_functiondef(f.oid);
    nuevo := regexp_replace(def,
      'extract\s*\(\s*year\s+from\s+current_date\s*\)',
      $r$extract(year from (now() at time zone 'America/Bogota'))$r$, 'gi');
    if nuevo <> def then
      execute nuevo;
      cambios := cambios + 1;
    end if;
  end loop;
  if cambios = 0 then
    raise exception 'fn_guardar_cotizacion_completa: no se encontró "extract(year from current_date)". No se cambió nada; revisar la definición real.';
  end if;

  -- Fecha del precio al crear un ítem de catálogo.
  cambios := 0;
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_crear_item_catalogo'
  loop
    def := pg_get_functiondef(f.oid);
    nuevo := regexp_replace(def,
      'coalesce\s*\(\s*p_fecha\s*,\s*current_date\s*\)',
      $r$coalesce(p_fecha, (now() at time zone 'America/Bogota')::date)$r$, 'gi');
    if nuevo <> def then
      execute nuevo;
      cambios := cambios + 1;
    end if;
  end loop;
  if cambios = 0 then
    raise exception 'fn_crear_item_catalogo: no se encontró "coalesce(p_fecha, current_date)". No se cambió nada; revisar la definición real.';
  end if;
end $$;

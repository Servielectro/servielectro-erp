-- Deshace 20261015000043: la base vuelve a UTC sin zona configurada, los defaults a
-- current_date y las dos funciones a current_date (sobre su definición real).
-- Como la migración, la zona horaria solo aplica a conexiones nuevas: reiniciar la API.

do $$
begin
  execute format('alter database %I reset timezone', current_database());
end $$;

alter table public.cotizaciones alter column fecha_emision set default current_date;
alter table public.items_precios_historico alter column vigente_desde set default current_date;
alter table public.proyecto_ejecucion_items alter column fecha set default current_date;

do $$
declare
  f record;
  def text;
  nuevo text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_guardar_cotizacion_completa'
  loop
    def := pg_get_functiondef(f.oid);
    nuevo := replace(def,
      $r$extract(year from (now() at time zone 'America/Bogota'))$r$,
      'extract(year from current_date)');
    if nuevo <> def then execute nuevo; end if;
  end loop;

  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_crear_item_catalogo'
  loop
    def := pg_get_functiondef(f.oid);
    nuevo := replace(def,
      $r$coalesce(p_fecha, (now() at time zone 'America/Bogota')::date)$r$,
      'coalesce(p_fecha, current_date)');
    if nuevo <> def then execute nuevo; end if;
  end loop;
end $$;

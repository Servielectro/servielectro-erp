-- Deshace 20261012000042: vuelve al estado consultado el 2026-10-12.
--
-- LO QUE NO VUELVE: la tabla vigia_conexion. No está en ningún archivo del repo, no se
-- conoce su definición y nada la usaba; no se recrea.
--
-- anon: antes de la 42 tenía todos los privilegios sobre todas las tablas y vistas de
-- public MENOS las 8 de la tanda 3 (que la 41 ya le había quitado). Esto lo reproduce.

-- ============================================================ 1) proyectos
do $$
declare
  tablas text[] := array['proyectos', 'proyecto_ejecucion_items'];
  r record;
  t text;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename = any (tablas)
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  foreach t in array tablas loop
    execute format('grant truncate, trigger, references on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t);
  end loop;
end $$;

-- ============================================================ 2) bucket respaldos
drop policy if exists respaldos_select on storage.objects;
drop policy if exists respaldos_insert on storage.objects;

create policy respaldos_authenticated_select on storage.objects
  for select to authenticated using (bucket_id = 'respaldos');
create policy respaldos_authenticated_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'respaldos');
create policy respaldos_authenticated_update on storage.objects
  for update to authenticated using (bucket_id = 'respaldos') with check (bucket_id = 'respaldos');
create policy respaldos_authenticated_delete on storage.objects
  for delete to authenticated using (bucket_id = 'respaldos');

-- ============================================================ 3) anon
grant select, insert, update, delete, truncate, references, trigger
  on all tables in schema public to anon;
grant usage, select, update on all sequences in schema public to anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cotizaciones', 'cotizacion_items', 'cotizacion_polizas', 'cotizacion_valores_agregados',
    'cotizacion_consecutivos', 'hitos_cobro', 'items_catalogo', 'items_precios_historico'
  ] loop
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete, truncate, references, trigger on tables to anon;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to anon;

-- Deshace 20261012000041: vuelve EXACTAMENTE al estado consultado el 2026-10-12 —
-- una política {tabla}_authenticated_all (for all, using true) por tabla, y los
-- privilegios de tabla de anon y authenticated como estaban.

do $$
declare
  tablas text[] := array[
    'cotizaciones', 'cotizacion_items', 'cotizacion_polizas', 'cotizacion_valores_agregados',
    'cotizacion_consecutivos', 'hitos_cobro', 'items_catalogo', 'items_precios_historico'
  ];
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
    execute format('grant select, insert, update, delete, truncate, references, trigger on table public.%I to anon', t);
    execute format('grant truncate, trigger, references on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t);
  end loop;
end $$;

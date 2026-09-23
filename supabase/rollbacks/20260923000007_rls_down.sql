-- Rollback de 20260923000007_rls.sql
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'items_catalogo', 'items_precios_historico',
      'clientes',
      'cotizacion_consecutivos', 'cotizaciones', 'cotizacion_items',
      'proyectos', 'proyecto_ejecucion_items', 'hitos_cobro'
    ])
  loop
    execute format('drop policy if exists %I on %I;', t || '_authenticated_all', t);
    execute format('alter table %I disable row level security;', t);
  end loop;
end $$;

-- Módulo 1: Proyectos — RLS
-- Servielectro es de uso interno con pocos usuarios. Por ahora: cualquier usuario autenticado
-- tiene acceso completo (lectura/escritura). Si más adelante hay roles distintos (ej. solo
-- lectura para contador), se refinan estas políticas por tabla (ver Decisión abierta #5).

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
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

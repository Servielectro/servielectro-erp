-- Deshace 20261001000036: vuelve a las políticas abiertas `using (true)` de antes.
do $$
declare
  t text;
begin
  for t in select unnest(array['polizas_catalogo', 'valores_agregados_catalogo', 'configuracion_empresa'])
  loop
    execute format('drop policy if exists %I on %I;', t || '_select', t);
    execute format('drop policy if exists %I on %I;', t || '_insert', t);
    execute format('drop policy if exists %I on %I;', t || '_update', t);
    execute format('drop policy if exists %I on %I;', t || '_delete', t);
    execute format('drop policy if exists %I on %I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

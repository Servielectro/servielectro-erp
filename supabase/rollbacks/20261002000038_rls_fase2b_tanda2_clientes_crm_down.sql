-- Deshace 20261002000038: vuelve al estado anterior a la tanda 2 (el de después de la 37):
-- tablas de clientes/CRM abiertas a cualquier usuario con sesión, historial y etapas con
-- lectura abierta, bucket documentos-clientes abierto y la función de renovaciones sin
-- control de permiso. Borra por pg_policies, igual que la migración.

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename = any (array['clientes', 'documentos', 'oportunidades', 'oportunidad_contactos',
                                 'oportunidad_etapas_historial', 'etapas_config'])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%documentos-clientes%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

do $$
declare
  t text;
begin
  for t in select unnest(array['clientes', 'documentos', 'oportunidades', 'oportunidad_contactos'])
  loop
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t);
  end loop;
end $$;

create policy oportunidad_etapas_historial_select on oportunidad_etapas_historial
  for select to authenticated using (true);
create policy etapas_config_select on etapas_config for select to authenticated using (true);
create policy etapas_config_write on etapas_config for all to authenticated
  using (fn_tiene_permiso('comercial', 'responsable'))
  with check (fn_tiene_permiso('comercial', 'responsable'));

create policy documentos_clientes_authenticated_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes');
create policy documentos_clientes_authenticated_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes');
create policy documentos_clientes_authenticated_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos-clientes') with check (bucket_id = 'documentos-clientes');
create policy documentos_clientes_authenticated_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos-clientes');

create or replace function fn_crear_renovaciones_pendientes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creadas int;
begin
  insert into oportunidades (
    tipo_pipeline, nombre, cliente_id, etapa_id, proyecto_id,
    fecha_estimada_decision, responsable_id, created_by
  )
  select 'renovacion', 'Renovación mantenimiento — ' || p.nombre, p.cliente_id,
         'renovacion_proxima', p.id, p.fecha_vencimiento_contrato, null, null
  from proyectos p
  where p.fecha_vencimiento_contrato is not null
    and p.fecha_vencimiento_contrato <= current_date + 90
    and p.fecha_vencimiento_contrato >= current_date - 30
    and not exists (
      select 1 from oportunidades o
      where o.proyecto_id = p.id and o.tipo_pipeline = 'renovacion'
        and o.created_at >= p.fecha_vencimiento_contrato - 180
    );
  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$$;

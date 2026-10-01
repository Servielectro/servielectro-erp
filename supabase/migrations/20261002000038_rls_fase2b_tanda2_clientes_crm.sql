-- Fase 2B — RLS por rol, TANDA 2 de 4: clientes, documentos (RUT) y CRM.
--
-- BORRADO ROBUSTO (aprobado 2026-10-02): la base tuvo políticas escritas a mano con
-- otros nombres que los de los archivos (ver la 37). Por eso esta migración NO borra
-- por nombre: lee pg_policies y borra TODAS las políticas existentes de sus tablas, y
-- después crea las nuevas. Lo mismo en Storage para el bucket documentos-clientes.
--
--   tabla                           leer                 crear/editar         borrar
--   clientes                        comercial/consultar  comercial/trabajar   comercial/responsable
--   documentos (RUT)                comercial/consultar  comercial/trabajar   comercial/responsable
--   oportunidades                   comercial/consultar  comercial/trabajar   comercial/responsable
--   oportunidad_contactos           comercial/consultar  comercial/trabajar   comercial/responsable
--   oportunidad_etapas_historial    comercial/consultar  — (solo el trigger)  —
--   etapas_config                   comercial/consultar  comercial/responsable
--   Storage documentos-clientes     comercial/consultar  subir: comercial/trabajar (no se reemplaza ni se borra)
--
-- Funciones:
--   - fn_crear_renovaciones_pendientes (security definer, salta la RLS): ahora exige
--     comercial/trabajar; sin ese permiso no hace nada (devuelve 0), así deja de ser
--     ejecutable por cualquier usuario con sesión.
--   - fn_oportunidad_antes_guardar: se asegura security invoker (el archivo 27 ya la
--     crea así; por el drift de la 27 no se da por hecho que la base coincida).
--
-- Jhojan (Administrador, responsable en todo) conserva el acceso completo.
-- Verificación: supabase/verificaciones/20261002000038_verificar.sql
-- Rollback:     supabase/rollbacks/20261002000038_..._down.sql
--
-- Idempotente.

-- ---------------------------------------------------------------- borrado robusto
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'clientes', 'documentos', 'oportunidades', 'oportunidad_contactos',
        'oportunidad_etapas_historial', 'etapas_config'
      ])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  -- Storage: todas las políticas que mencionen el bucket documentos-clientes.
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%documentos-clientes%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

-- ---------------------------------------------------------------- tablas con escritura
do $$
declare
  t text;
begin
  for t in select unnest(array['clientes', 'documentos', 'oportunidades', 'oportunidad_contactos'])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (fn_tiene_permiso(''comercial'', ''consultar''))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (fn_tiene_permiso(''comercial'', ''trabajar''))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (fn_tiene_permiso(''comercial'', ''trabajar'')) with check (fn_tiene_permiso(''comercial'', ''trabajar''))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (fn_tiene_permiso(''comercial'', ''responsable''))',
      t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- historial (solo lectura)
alter table oportunidad_etapas_historial enable row level security;
create policy oportunidad_etapas_historial_select on oportunidad_etapas_historial
  for select to authenticated
  using (fn_tiene_permiso('comercial', 'consultar'));
-- Sin políticas de escritura: lo escribe solo el trigger fn_oportunidad_historial
-- (security definer, dueño de la tabla).

-- ---------------------------------------------------------------- etapas_config
alter table etapas_config enable row level security;
create policy etapas_config_select on etapas_config for select to authenticated
  using (fn_tiene_permiso('comercial', 'consultar'));
create policy etapas_config_write on etapas_config for all to authenticated
  using (fn_tiene_permiso('comercial', 'responsable'))
  with check (fn_tiene_permiso('comercial', 'responsable'));

-- ---------------------------------------------------------------- Storage: RUT de clientes
create policy documentos_clientes_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes' and fn_tiene_permiso('comercial', 'consultar'));
create policy documentos_clientes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes' and fn_tiene_permiso('comercial', 'trabajar'));
-- Sin update ni delete: un RUT subido no se reemplaza ni se borra.

-- ---------------------------------------------------------------- funciones
create or replace function fn_crear_renovaciones_pendientes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creadas int;
begin
  -- Salta la RLS por diseño (crea la renovación aunque quien abre el tablero solo
  -- consulte), pero ya no la puede ejecutar cualquiera: sin comercial/trabajar no hace nada.
  if not fn_tiene_permiso('comercial', 'trabajar') then
    return 0;
  end if;

  insert into oportunidades (
    tipo_pipeline, nombre, cliente_id, etapa_id, proyecto_id,
    fecha_estimada_decision, responsable_id, created_by
  )
  select
    'renovacion',
    'Renovación mantenimiento — ' || p.nombre,
    p.cliente_id,
    'renovacion_proxima',
    p.id,
    p.fecha_vencimiento_contrato,
    null,
    null
  from proyectos p
  where p.fecha_vencimiento_contrato is not null
    and p.fecha_vencimiento_contrato <= current_date + 90
    and p.fecha_vencimiento_contrato >= current_date - 30
    and not exists (
      select 1 from oportunidades o
      where o.proyecto_id = p.id
        and o.tipo_pipeline = 'renovacion'
        and o.created_at >= p.fecha_vencimiento_contrato - 180
    );

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$$;

revoke all on function fn_crear_renovaciones_pendientes() from public, anon;
grant execute on function fn_crear_renovaciones_pendientes() to authenticated;

alter function fn_oportunidad_antes_guardar() security invoker;

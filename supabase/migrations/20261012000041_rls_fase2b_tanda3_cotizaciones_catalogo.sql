-- Fase 2B — RLS por rol, TANDA 3 de 4: cotizaciones y catálogo.
--
-- Escrita sobre el ESTADO REAL de la base consultado el 2026-10-12
-- (supabase/verificaciones/estado_previo_tanda3.sql), no sobre los archivos:
--   - las 8 tablas tienen RLS activo y una sola política {tabla}_authenticated_all
--     (for all, using true, check true);
--   - anon tiene DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE en las 8;
--   - authenticated tiene además TRUNCATE/TRIGGER/REFERENCES (TRUNCATE no pasa por la RLS);
--   - ninguna función que toca estas tablas es security definer: fn_guardar_cotizacion_
--     completa, fn_siguiente_codigo_cotizacion, fn_crear_item_catalogo y los triggers
--     corren con el permiso de quien llama;
--   - las vistas que las leen son todas security_invoker: se cierran solas.
--
-- NIVELES, IGUALES EN LAS 8 TABLAS (a propósito): guardar una cotización
-- (fn_guardar_cotizacion_completa) escribe en cotizaciones, cotizacion_items,
-- hitos_cobro, cotizacion_polizas y cotizacion_consecutivos (el contador del código) en
-- una sola transacción, sin saltar la RLS. Si una tabla exigiera más que las otras,
-- guardar fallaría entero. Por eso todas piden lo mismo:
--   leer          comercial/consultar
--   crear/editar  comercial/trabajar
--   borrar        comercial/responsable
--
-- Costos y márgenes (items_precios_historico, columnas de compra y factor) quedan
-- detrás del permiso de módulo por ahora; ocultarlos por columna según
-- ve_datos_sensibles es la tanda 5, aparte.
--
-- BORRADO ROBUSTO: lee pg_policies y elimina TODAS las políticas de estas tablas antes
-- de crear las nuevas, sin depender de nombres.
--
-- Verificación: supabase/verificaciones/20261012000041_verificar.sql
-- Rollback:     supabase/rollbacks/20261012000041_..._down.sql
-- Idempotente.

do $$
declare
  tablas text[] := array[
    'cotizaciones', 'cotizacion_items', 'cotizacion_polizas', 'cotizacion_valores_agregados',
    'cotizacion_consecutivos', 'hitos_cobro', 'items_catalogo', 'items_precios_historico'
  ];
  r record;
  t text;
begin
  -- 1) Borrar todas las políticas existentes de estas tablas.
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename = any (tablas)
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  foreach t in array tablas loop
    -- 2) Privilegios de tabla: anon no toca nada; authenticated sin TRUNCATE (salta la
    --    RLS), TRIGGER ni REFERENCES, que la app no usa.
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references on table public.%I from authenticated', t);

    -- 3) Políticas por permiso de módulo, iguales en las 8 tablas.
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

-- Fase 2B — RLS por rol, TANDA 4 de 4: proyectos, bucket respaldos, anon y vigia_conexion.
--
-- Escrita sobre el ESTADO REAL de la base consultado el 2026-10-12
-- (supabase/verificaciones/estado_previo_tanda4.sql), no sobre los archivos:
--   - proyectos, proyecto_ejecucion_items y vigia_conexion: RLS activo y una sola
--     política {tabla}_authenticated_all (for all, using true, check true);
--   - anon y authenticated con DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE;
--   - las vistas que leen proyectos son security_invoker: se cierran solas;
--   - trg_proyectos_validar_cotizacion lee cotizaciones (invoker): quien crea un proyecto
--     necesita leer cotizaciones, que desde la tanda 3 es comercial/consultar. Crear
--     proyecto pide comercial/trabajar, que lo incluye: la creación no se rompe;
--   - bucket respaldos: cuatro políticas con SOLO bucket_id = 'respaldos'. Cualquier
--     usuario con sesión podía bajar las copias completas de la base (costos, clientes)
--     y borrarlas;
--   - anon conserva privilegios sobre ~30 tablas y vistas de public;
--   - vigia_conexion: sin llaves foráneas, nada la usa (tarea programada cancelada).
--
-- NIVELES:
--   proyectos y proyecto_ejecucion_items (Proyectos vive dentro de Comercial):
--     leer comercial/consultar · crear/editar comercial/trabajar · borrar comercial/responsable
--   respaldos (Storage): leer y crear solo comercial/responsable CON datos sensibles.
--     SIN política de update ni de delete: la app nunca reemplaza ni borra un respaldo
--     (backup-actions.ts sube con upsert false, lista y descarga). Nadie puede borrarlos
--     desde la app; si hiciera falta, se hace desde el panel de Supabase.
--
-- NO SE TOCA en esta tanda: modulos_select, roles_select, permisos_rol_select siguen
-- con using(true) a propósito (las usan fn_tiene_permiso y la pantalla de Usuarios).
-- Cerrar permisos_rol_select se decide aparte, con el estado real de esas funciones.
--
-- BORRADO ROBUSTO: lee pg_policies y elimina TODAS las políticas de las tablas, y todas
-- las de storage.objects que mencionen 'respaldos', sin depender de nombres.
--
-- Verificación: supabase/verificaciones/20261012000042_verificar.sql
-- Rollback:     supabase/rollbacks/20261012000042_..._down.sql
-- Idempotente.

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
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references on table public.%I from authenticated', t);

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

-- ============================================================ 2) bucket respaldos
do $$
declare
  r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%respaldos%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy respaldos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'respaldos'
    and fn_tiene_permiso('comercial', 'responsable')
    and fn_ve_datos_sensibles('comercial')
  );

create policy respaldos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'respaldos'
    and fn_tiene_permiso('comercial', 'responsable')
    and fn_ve_datos_sensibles('comercial')
  );

-- ============================================================ 3) anon fuera de public
-- Nada de la app lee tablas sin sesión (el login solo usa Supabase Auth). Tablas, vistas
-- y secuencias que existen hoy:
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Y las que se creen después desde el SQL Editor (dueño postgres) ya nacen sin anon.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ============================================================ 4) vigia_conexion
-- Sin cascade a propósito: si algo dependiera de ella, la migración falla en vez de
-- llevárselo puesto.
drop table if exists public.vigia_conexion;

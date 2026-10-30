-- modulo_secciones (122) quedó sin RLS y sin revocar privilegios (2026-10-30). Con los privilegios por
-- defecto de Supabase, cualquier usuario con sesión podía insertar, renombrar o BORRAR secciones, y
-- un borrado arrastra en cascada los recortes de permisos_rol_seccion de todos los roles: alguien
-- podía devolverse una sección que se le quitó borrándola de la lista.
--
-- La lista de secciones es catálogo: la lee todo el que tiene sesión (el menú la necesita) y la
-- escribe solo una migración (postgres), igual que en src/lib/menu.ts. Idempotente.
-- Verificación: supabase/verificaciones/20261130000124_verificar.sql
alter table public.modulo_secciones enable row level security;
revoke all on table public.modulo_secciones from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.modulo_secciones from authenticated;
grant select on table public.modulo_secciones to authenticated;
drop policy if exists modulo_secciones_select on public.modulo_secciones;
create policy modulo_secciones_select on public.modulo_secciones for select to authenticated using (true);

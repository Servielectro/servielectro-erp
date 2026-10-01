-- Fase 2B — RLS por rol, TANDA 1 de 4: catálogos sin costos y configuración de empresa.
--
-- Reemplaza las políticas `using (true)` (cualquier usuario con sesión) por permisos del
-- sistema de módulos (fn_tiene_permiso):
--
--   tabla                        leer                         escribir
--   polizas_catalogo             comercial/consultar          insert/update: comercial/trabajar
--                                                             delete: comercial/responsable
--   valores_agregados_catalogo   comercial/consultar          igual que pólizas
--   configuracion_empresa        comercial/consultar o        configuracion/responsable
--                                rrhh/consultar (los datos
--                                del empleador saldrán de acá
--                                en los contratos)
--
-- Ninguna de estas tablas tiene costos ni márgenes (eso es la tanda 5, aparte).
-- Jhojan (Administrador: responsable en todos los módulos) conserva el acceso completo.
--
-- Verificación: supabase/verificaciones/20261001000036_verificar.sql (simula a Jhojan y
-- a un usuario sin rol). Rollback: supabase/rollbacks/20261001000036_..._down.sql.
--
-- Idempotente.

-- ---------------------------------------------------------------- pólizas
drop policy if exists polizas_catalogo_authenticated_all on polizas_catalogo;

drop policy if exists polizas_catalogo_select on polizas_catalogo;
create policy polizas_catalogo_select on polizas_catalogo for select to authenticated
  using (fn_tiene_permiso('comercial', 'consultar'));
drop policy if exists polizas_catalogo_insert on polizas_catalogo;
create policy polizas_catalogo_insert on polizas_catalogo for insert to authenticated
  with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists polizas_catalogo_update on polizas_catalogo;
create policy polizas_catalogo_update on polizas_catalogo for update to authenticated
  using (fn_tiene_permiso('comercial', 'trabajar'))
  with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists polizas_catalogo_delete on polizas_catalogo;
create policy polizas_catalogo_delete on polizas_catalogo for delete to authenticated
  using (fn_tiene_permiso('comercial', 'responsable'));

-- ---------------------------------------------------------------- bloques del documento
drop policy if exists valores_agregados_catalogo_authenticated_all on valores_agregados_catalogo;

drop policy if exists valores_agregados_catalogo_select on valores_agregados_catalogo;
create policy valores_agregados_catalogo_select on valores_agregados_catalogo for select to authenticated
  using (fn_tiene_permiso('comercial', 'consultar'));
drop policy if exists valores_agregados_catalogo_insert on valores_agregados_catalogo;
create policy valores_agregados_catalogo_insert on valores_agregados_catalogo for insert to authenticated
  with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists valores_agregados_catalogo_update on valores_agregados_catalogo;
create policy valores_agregados_catalogo_update on valores_agregados_catalogo for update to authenticated
  using (fn_tiene_permiso('comercial', 'trabajar'))
  with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists valores_agregados_catalogo_delete on valores_agregados_catalogo;
create policy valores_agregados_catalogo_delete on valores_agregados_catalogo for delete to authenticated
  using (fn_tiene_permiso('comercial', 'responsable'));

-- ---------------------------------------------------------------- configuración de empresa
drop policy if exists configuracion_empresa_authenticated_all on configuracion_empresa;

drop policy if exists configuracion_empresa_select on configuracion_empresa;
create policy configuracion_empresa_select on configuracion_empresa for select to authenticated
  using (fn_tiene_permiso('comercial', 'consultar') or fn_tiene_permiso('rrhh', 'consultar'));
drop policy if exists configuracion_empresa_insert on configuracion_empresa;
create policy configuracion_empresa_insert on configuracion_empresa for insert to authenticated
  with check (fn_tiene_permiso('configuracion', 'responsable'));
drop policy if exists configuracion_empresa_update on configuracion_empresa;
create policy configuracion_empresa_update on configuracion_empresa for update to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable'))
  with check (fn_tiene_permiso('configuracion', 'responsable'));
-- Sin delete: es una tabla de una sola fila (singleton) que no se borra.

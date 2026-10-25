-- Rollback de la migración 70. OJO: borra las sedes registradas y el registro de importaciones, y
-- los datos DIAN de los clientes (tipo de documento, tipo de persona, DV, código DANE, declarante,
-- correo del encargado, notas). Los clientes creados por una importación se quedan. Clientes vuelve
-- a ser solo de Comercial (como en la 38). El permiso Administrativo del rol Administrador se queda.
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated using (fn_tiene_permiso('comercial', 'consultar'));
drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes for update to authenticated
  using (fn_tiene_permiso('comercial', 'trabajar')) with check (fn_tiene_permiso('comercial', 'trabajar'));
drop policy if exists clientes_delete on public.clientes;
create policy clientes_delete on public.clientes for delete to authenticated using (fn_tiene_permiso('comercial', 'responsable'));
drop function if exists public.fn_importar_clientes(jsonb, text, jsonb);
drop table if exists public.importaciones_clientes;
drop table if exists public.cliente_sedes;
drop trigger if exists trg_clientes_nit on public.clientes;
drop function if exists public.fn_clientes_nit();
drop function if exists public.fn_dv_nit(text);
drop function if exists public.fn_clientes_permiso(nivel_permiso);
alter table public.clientes drop constraint if exists clientes_tipo_documento;
alter table public.clientes drop constraint if exists clientes_tipo_persona;
alter table public.clientes drop constraint if exists clientes_dv;
alter table public.clientes drop constraint if exists clientes_municipio_dane;
alter table public.clientes
  drop column if exists tipo_documento,
  drop column if exists tipo_persona,
  drop column if exists dv,
  drop column if exists municipio_dane,
  drop column if exists declarante_renta,
  drop column if exists email_encargado_proyecto,
  drop column if exists notas,
  drop column if exists actualizado_desde_siigo_en;

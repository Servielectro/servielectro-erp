-- Rollback de la migración 70. OJO: borra las sedes registradas y el registro de importaciones, y
-- los datos DIAN de los clientes (tipo de documento, tipo de persona, DV, código DANE, declarante,
-- correo del encargado, notas). Los clientes creados por una importación se quedan.
drop function if exists public.fn_importar_clientes(jsonb, text, jsonb);
drop table if exists public.importaciones_clientes;
drop table if exists public.cliente_sedes;
drop trigger if exists trg_clientes_nit on public.clientes;
drop function if exists public.fn_clientes_nit();
drop function if exists public.fn_dv_nit(text);
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

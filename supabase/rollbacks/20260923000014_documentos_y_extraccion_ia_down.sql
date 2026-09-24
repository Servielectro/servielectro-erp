-- Rollback de 20260923000014_documentos_y_extraccion_ia.sql
drop policy if exists documentos_authenticated_all on documentos;
alter table documentos disable row level security;
drop function if exists fn_buscar_o_crear_cliente(text);
drop view if exists v_rut_vigente_cliente;
drop trigger if exists trg_documentos_updated_at on documentos;
drop table if exists documentos;
alter table clientes drop column if exists departamento;
alter table clientes drop column if exists municipio;
alter table clientes drop column if exists responsable_iva;
alter table clientes drop column if exists tipo_contribuyente;
drop type if exists estado_documento;
drop type if exists tipo_documento;

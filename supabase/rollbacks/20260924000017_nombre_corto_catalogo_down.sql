-- Rollback de 20260924000017_nombre_corto_catalogo.sql
alter table cotizacion_items drop column if exists descripcion_larga;
alter table items_catalogo alter column nombre_corto drop not null;
alter table items_catalogo drop column if exists nombre_corto;

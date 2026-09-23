-- Rollback de 20260923000001_enums_extensions.sql
drop type if exists estado_hito;
drop type if exists estado_proyecto;
drop type if exists estado_cotizacion;
drop type if exists tipo_contrato;
drop type if exists categoria_item;
-- no se elimina la extensión pgcrypto: puede estar en uso por otros objetos del proyecto

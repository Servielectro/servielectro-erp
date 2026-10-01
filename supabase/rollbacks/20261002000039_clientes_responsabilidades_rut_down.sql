-- Deshace 20261002000039 (responsable_iva es de la migración 14 y se conserva).
alter table clientes drop column if exists responsabilidades_rut;

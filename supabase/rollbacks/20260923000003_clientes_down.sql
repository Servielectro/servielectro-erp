-- Rollback de 20260923000003_clientes.sql
drop trigger if exists trg_clientes_updated_at on clientes;
drop table if exists clientes;

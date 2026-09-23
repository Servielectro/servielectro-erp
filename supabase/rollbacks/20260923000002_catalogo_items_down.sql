-- Rollback de 20260923000002_catalogo_items.sql
drop trigger if exists trg_items_catalogo_updated_at on items_catalogo;
drop view if exists v_items_catalogo_con_precio;
drop view if exists v_items_precio_actual;
drop table if exists items_precios_historico;
drop table if exists items_catalogo;

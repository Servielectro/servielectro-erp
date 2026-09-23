-- Rollback de 20260923000009_rpc_crear_item_catalogo.sql
drop function if exists fn_crear_item_catalogo(
  text, text, text, categoria_item, text, text, numeric, numeric, date
);

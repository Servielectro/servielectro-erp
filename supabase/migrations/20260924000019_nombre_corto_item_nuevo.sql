-- Módulo 1: Proyectos — fn_crear_item_catalogo también fija nombre_corto (mismo valor
-- que la descripción tipeada en el popup — los ítems dados de alta a mano ahí no tienen
-- descripción larga separada). Misma firma de parámetros. Idempotente.

create or replace function fn_crear_item_catalogo(
  p_codigo text,
  p_descripcion text,
  p_unidad text,
  p_categoria categoria_item,
  p_proveedor text,
  p_referencia text,
  p_valor_compra_iva numeric,
  p_factor_rentabilidad_linea numeric,
  p_fecha date
)
returns items_catalogo
language plpgsql
as $$
declare
  v_item items_catalogo;
  v_codigo text := nullif(trim(p_codigo), '');
begin
  if v_codigo is null then
    v_codigo := 'AD-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  end if;

  insert into items_catalogo (
    codigo, descripcion, nombre_corto, unidad, categoria, proveedor, referencia, factor_rentabilidad_linea
  ) values (
    v_codigo, p_descripcion, p_descripcion, p_unidad, p_categoria, p_proveedor, p_referencia,
    coalesce(p_factor_rentabilidad_linea, 0.85)
  ) returning * into v_item;

  insert into items_precios_historico (item_id, valor_compra_iva, vigente_desde, fuente)
  values (v_item.id, p_valor_compra_iva, coalesce(p_fecha, current_date), 'MANUAL');

  return v_item;
end;
$$;

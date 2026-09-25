-- Rollback de 20260923000011_comercial_y_datos_impresion.sql
drop view if exists v_cotizaciones_listado;

-- Dropea la versión de 15 parámetros antes de recrear la de 10 — si no, "create or
-- replace" no reemplaza (la lista de tipos cambió) y quedan las dos coexistiendo.
drop function if exists fn_guardar_cotizacion_completa(
  text, uuid, esquema_iva, text, numeric, numeric, numeric, numeric, numeric, jsonb,
  text, text, text, text, text
);

-- Vuelve la función a su firma anterior (sin comercial ni datos de cliente extra)
create or replace function fn_guardar_cotizacion_completa(
  p_cliente_nombre text,
  p_cliente_id uuid,
  p_esquema_iva esquema_iva,
  p_descripcion text,
  p_factor_recargo_proyecto numeric,
  p_pct_admin numeric,
  p_pct_imprevistos numeric,
  p_pct_utilidad_aiu numeric,
  p_iva_pct numeric,
  p_lineas jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_cliente_id uuid;
  v_anio smallint := extract(year from current_date);
  v_codigo text;
  v_cotizacion_id uuid;
  v_linea jsonb;
  v_orden int := 0;
begin
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La cotización necesita al menos una línea';
  end if;

  if p_cliente_id is not null then
    v_cliente_id := p_cliente_id;
  else
    select id into v_cliente_id from clientes where lower(nombre) = lower(trim(p_cliente_nombre)) limit 1;
    if v_cliente_id is null then
      insert into clientes (nombre) values (trim(p_cliente_nombre)) returning id into v_cliente_id;
    end if;
  end if;

  v_codigo := fn_siguiente_codigo_cotizacion(v_anio);

  insert into cotizaciones (
    codigo, anio, cliente_id, descripcion, esquema_iva,
    factor_recargo_proyecto, pct_admin, pct_imprevistos, pct_utilidad_aiu, iva_pct
  ) values (
    v_codigo, v_anio, v_cliente_id, p_descripcion, p_esquema_iva,
    p_factor_recargo_proyecto, p_pct_admin, p_pct_imprevistos, p_pct_utilidad_aiu, p_iva_pct
  ) returning id into v_cotizacion_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_orden := v_orden + 1;
    insert into cotizacion_items (
      cotizacion_id, item_catalogo_id, categoria, descripcion, unidad,
      cantidad, valor_compra_unitario, factor_rentabilidad_linea, orden
    ) values (
      v_cotizacion_id,
      nullif(v_linea->>'item_catalogo_id', '')::uuid,
      (v_linea->>'categoria')::categoria_item,
      v_linea->>'descripcion',
      v_linea->>'unidad',
      (v_linea->>'cantidad')::numeric,
      (v_linea->>'valor_compra_unitario')::numeric,
      (v_linea->>'factor_rentabilidad_linea')::numeric,
      v_orden
    );
  end loop;

  return v_cotizacion_id;
end;
$$;

alter table cotizaciones drop column if exists comercial;

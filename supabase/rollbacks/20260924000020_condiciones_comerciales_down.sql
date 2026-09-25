-- Rollback de 20260924000020_condiciones_comerciales.sql

-- Dropea la versión de 17 parámetros (con p_polizas) antes de recrear la de 16 —
-- si no, "create or replace" no reemplaza (la lista de tipos cambió) y quedan las
-- dos versiones sobrecargadas coexistiendo.
drop function if exists fn_guardar_cotizacion_completa(
  text, uuid, esquema_iva, text, numeric, numeric, numeric, numeric, numeric,
  jsonb, jsonb, text, text, text, text, text, jsonb
);

-- Vuelve fn_guardar_cotizacion_completa a la versión de 20260924000018 (sin p_polizas)
create or replace function fn_guardar_cotizacion_completa(
  p_cliente_nombre text,
  p_cliente_id uuid,
  p_esquema_iva esquema_iva,
  p_descripcion text,
  p_pct_admin numeric,
  p_pct_imprevistos numeric,
  p_pct_utilidad_aiu numeric,
  p_pct_admin_gasto numeric,
  p_pct_comision numeric,
  p_lineas jsonb,
  p_hitos jsonb default null,
  p_comercial text default null,
  p_cliente_nit text default null,
  p_cliente_direccion text default null,
  p_cliente_email text default null,
  p_cliente_contacto text default null
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
  v_hito jsonb;
  v_orden int := 0;
  v_compra_total numeric;
  v_venta_total numeric;
  v_pct_renta numeric;
  v_ica_por_mil numeric;
  v_iva_pct numeric;
  v_factor numeric;
  v_total_cotizacion numeric;
begin
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La cotización necesita al menos una línea';
  end if;

  if p_cliente_id is not null then
    v_cliente_id := p_cliente_id;
  else
    select id into v_cliente_id from clientes where lower(nombre) = lower(trim(p_cliente_nombre)) limit 1;
    if v_cliente_id is null then
      insert into clientes (nombre, nit, direccion, email, contacto)
      values (trim(p_cliente_nombre), p_cliente_nit, p_cliente_direccion, p_cliente_email, p_cliente_contacto)
      returning id into v_cliente_id;
    end if;
  end if;

  update clientes set
    nit = coalesce(p_cliente_nit, nit),
    direccion = coalesce(p_cliente_direccion, direccion),
    email = coalesce(p_cliente_email, email),
    contacto = coalesce(p_cliente_contacto, contacto)
  where id = v_cliente_id
    and (p_cliente_nit is not null or p_cliente_direccion is not null
         or p_cliente_email is not null or p_cliente_contacto is not null);

  v_codigo := fn_siguiente_codigo_cotizacion(v_anio);

  insert into cotizaciones (
    codigo, anio, cliente_id, descripcion, esquema_iva, comercial,
    pct_admin, pct_imprevistos, pct_utilidad_aiu,
    pct_admin_gasto_interno, pct_comision_comercial
  ) values (
    v_codigo, v_anio, v_cliente_id, p_descripcion, p_esquema_iva, p_comercial,
    p_pct_admin, p_pct_imprevistos, p_pct_utilidad_aiu,
    p_pct_admin_gasto, p_pct_comision
  ) returning id into v_cotizacion_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_orden := v_orden + 1;
    insert into cotizacion_items (
      cotizacion_id, item_catalogo_id, categoria, descripcion, descripcion_larga, unidad,
      cantidad, valor_compra_unitario, factor_rentabilidad_linea, orden
    ) values (
      v_cotizacion_id,
      nullif(v_linea->>'item_catalogo_id', '')::uuid,
      (v_linea->>'categoria')::categoria_item,
      v_linea->>'descripcion',
      nullif(v_linea->>'descripcion_larga', ''),
      v_linea->>'unidad',
      (v_linea->>'cantidad')::numeric,
      (v_linea->>'valor_compra_unitario')::numeric,
      (v_linea->>'factor_rentabilidad_linea')::numeric,
      v_orden
    );
  end loop;

  select coalesce(sum(valor_compra_unitario * cantidad), 0),
         coalesce(sum(valor_venta_unitario * cantidad), 0)
    into v_compra_total, v_venta_total
    from cotizacion_items where cotizacion_id = v_cotizacion_id;

  select pct_renta, ica_por_mil, iva_pct into v_pct_renta, v_ica_por_mil, v_iva_pct
    from cotizaciones where id = v_cotizacion_id;

  v_factor := fn_calcular_factor_recargo(
    v_compra_total, v_venta_total,
    p_pct_admin, p_pct_imprevistos, p_pct_utilidad_aiu,
    p_pct_admin_gasto, v_pct_renta, v_ica_por_mil, p_pct_comision, v_iva_pct,
    p_esquema_iva
  );

  update cotizaciones set factor_recargo_proyecto = v_factor where id = v_cotizacion_id;

  if p_hitos is not null and jsonb_array_length(p_hitos) > 0 then
    select total_cotizacion into v_total_cotizacion
      from v_cotizacion_totales_iva where cotizacion_id = v_cotizacion_id;

    v_orden := 0;
    for v_hito in select * from jsonb_array_elements(p_hitos)
    loop
      v_orden := v_orden + 1;
      insert into hitos_cobro (cotizacion_id, orden, nombre, porcentaje, valor_programado)
      values (
        v_cotizacion_id,
        v_orden,
        v_hito->>'nombre',
        (v_hito->>'porcentaje')::numeric,
        round((v_hito->>'porcentaje')::numeric * v_total_cotizacion, 2)
      );
    end loop;
  end if;

  return v_cotizacion_id;
end;
$$;

drop view if exists v_cotizacion_polizas;
drop table if exists cotizacion_polizas;
drop table if exists polizas_catalogo;
drop table if exists configuracion_empresa;

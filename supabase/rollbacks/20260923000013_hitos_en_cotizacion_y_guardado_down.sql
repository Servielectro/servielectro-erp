-- Rollback de 20260923000013_hitos_en_cotizacion_y_guardado.sql
-- Nota: si ya se guardaron hitos usando solo cotizacion_id (sin proyecto_id), restaurar
-- el "not null" de proyecto_id va a fallar — es esperable en un rollback de este cambio.

drop view if exists v_hitos_cotizacion;

drop function if exists fn_guardar_cotizacion_completa(
  text, uuid, esquema_iva, text, numeric, numeric, numeric, numeric, numeric, jsonb, jsonb, text, text, text, text, text
);

-- Vuelve fn_guardar_cotizacion_completa a la firma de 20260923000011
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
  p_lineas jsonb,
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
      insert into clientes (nombre, nit, direccion, email, contacto)
      values (trim(p_cliente_nombre), p_cliente_nit, p_cliente_direccion, p_cliente_email, p_cliente_contacto)
      returning id into v_cliente_id;
    end if;
  end if;

  v_codigo := fn_siguiente_codigo_cotizacion(v_anio);

  insert into cotizaciones (
    codigo, anio, cliente_id, descripcion, esquema_iva, comercial,
    factor_recargo_proyecto, pct_admin, pct_imprevistos, pct_utilidad_aiu, iva_pct
  ) values (
    v_codigo, v_anio, v_cliente_id, p_descripcion, p_esquema_iva, p_comercial,
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

create or replace function fn_validar_suma_hitos()
returns trigger
language plpgsql
as $$
declare
  v_suma numeric(6,4);
  v_proyecto_id uuid := coalesce(new.proyecto_id, old.proyecto_id);
begin
  select coalesce(sum(porcentaje), 0) into v_suma
  from hitos_cobro where proyecto_id = v_proyecto_id;

  if v_suma > 1.0001 then
    raise exception 'La suma de porcentajes de los hitos de cobro del proyecto supera el 100%% (actual: %)', v_suma * 100;
  end if;

  return null;
end;
$$;

drop index if exists idx_hitos_cotizacion;
alter table hitos_cobro drop constraint if exists hitos_cobro_cotizacion_id_orden_key;
alter table hitos_cobro add constraint hitos_cobro_proyecto_id_orden_key unique (proyecto_id, orden);
alter table hitos_cobro alter column proyecto_id set not null;
alter table hitos_cobro drop column if exists cotizacion_id;

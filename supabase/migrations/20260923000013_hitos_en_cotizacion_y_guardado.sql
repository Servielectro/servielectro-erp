-- Módulo 1: Proyectos — el esquema de pagos (hitos de cobro) se arma en la cotización,
-- no después: Jhojan necesita verlo y editarlo en la misma visita. Se repuntan los hitos
-- de proyecto_id a cotizacion_id (todavía no hay UI de proyectos, y un proyecto es 1:1
-- con su cotización aprobada, así que no se pierde nada).
-- Idempotente: se puede correr más de una vez sin romper.

alter table hitos_cobro add column if not exists cotizacion_id uuid references cotizaciones (id) on delete cascade;
alter table hitos_cobro alter column proyecto_id drop not null;

alter table hitos_cobro drop constraint if exists hitos_cobro_proyecto_id_orden_key;
alter table hitos_cobro drop constraint if exists hitos_cobro_cotizacion_id_orden_key;
alter table hitos_cobro add constraint hitos_cobro_cotizacion_id_orden_key unique (cotizacion_id, orden);

create index if not exists idx_hitos_cotizacion on hitos_cobro (cotizacion_id, orden);

-- La suma de porcentajes ahora se valida por cotización, no por proyecto
create or replace function fn_validar_suma_hitos()
returns trigger
language plpgsql
as $$
declare
  v_suma numeric(6,4);
  v_cotizacion_id uuid := coalesce(new.cotizacion_id, old.cotizacion_id);
begin
  if v_cotizacion_id is null then
    return null;
  end if;

  select coalesce(sum(porcentaje), 0) into v_suma
  from hitos_cobro where cotizacion_id = v_cotizacion_id;

  if v_suma > 1.0001 then
    raise exception 'La suma de porcentajes del esquema de pagos supera el 100%% (actual: %)', v_suma * 100;
  end if;

  return null;
end;
$$;

-- fn_guardar_cotizacion_completa: ya no recibe el factor de recargo (se calcula solo por
-- iteración, ver fn_calcular_factor_recargo en 20260923000012) ni el % de IVA (fijo, no se
-- modifica). Sí recibe ahora el % de administración de gastos y la comisión comercial
-- (configurables por cotización), y el esquema de pagos (hitos).
drop function if exists fn_guardar_cotizacion_completa(
  text, uuid, esquema_iva, text, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, text, text
);

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

  -- Calcular el factor de recargo por iteración (ver fn_calcular_factor_recargo) y
  -- aplicarlo: el UPDATE dispara trg_cotizaciones_recalcular_items, que recalcula el
  -- valor_calculo_unitario de todas las líneas ya insertadas.
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

  -- Esquema de pagos (opcional): [{ "nombre": "...", "porcentaje": 0.5 }, ...]
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

-- Vista del esquema de pagos de una cotización, para mostrarlo en pantalla.
-- drop primero: create or replace view falla (42P16) si una versión previa de la vista
-- ya existe con columnas distintas — más seguro dropear siempre que crear/reemplazar,
-- en vez de asumir que el repo es la única fuente de verdad de lo que ya hay en la base.
drop view if exists v_hitos_cotizacion;
create view v_hitos_cotizacion as
select
  h.id,
  h.cotizacion_id,
  h.orden,
  h.nombre,
  h.porcentaje,
  h.valor_programado,
  h.estado,
  h.fecha_programada,
  h.fecha_cobrado,
  h.valor_cobrado
from hitos_cobro h
where h.cotizacion_id is not null
order by h.cotizacion_id, h.orden;

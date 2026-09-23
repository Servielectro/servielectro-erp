-- Módulo 1: Proyectos — datos que hacen falta para imprimir la cotización
-- (encabezado: proyecto, cliente, NIT, dirección, correo, comercial).
-- Idempotente: se puede correr más de una vez sin romper.

alter table cotizaciones add column if not exists comercial text;

-- Extiende el guardado atómico para aceptar comercial y datos de cliente opcionales,
-- sin romper a quien ya llama la función con la firma anterior (parámetros nuevos al
-- final, todos con default). Si el cliente ya existe y se pasa un dato nuevo (ej. NIT),
-- se actualiza solo el campo que llega no nulo — nunca se borra un dato existente.
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

-- Listado de cotizaciones con cliente y total, para la pantalla de listado
create or replace view v_cotizaciones_listado as
select
  c.id,
  c.codigo,
  c.descripcion,
  c.estado,
  c.esquema_iva,
  c.comercial,
  cl.nombre as cliente_nombre,
  c.fecha_emision,
  c.created_at,
  t.total_cotizacion
from cotizaciones c
join clientes cl on cl.id = c.cliente_id
left join v_cotizacion_totales_iva t on t.cotizacion_id = c.id
order by c.created_at desc;

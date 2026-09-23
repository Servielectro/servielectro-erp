-- Módulo 1: Proyectos — cotizaciones y líneas de cotización
--
-- IMPORTANTE (ver Decisión abierta #1 en la conversación con Jhojan):
-- factor_recargo_proyecto se calcula a partir de administración, renta e ICA del
-- proyecto, pero la fórmula exacta usada en el Excel (CSE-026-151) todavía no está
-- confirmada. Mientras se valida con un ejemplo real, el campo queda como numérico
-- editable (no autogenerado) y se registra en formula_recargo_nota cómo se obtuvo.
-- Cuando se confirme la fórmula, esta migración se reemplaza por una función
-- fn_calcular_factor_recargo_proyecto(...) + trigger, sin cambiar la forma de la tabla.

create table cotizacion_consecutivos (
  anio smallint primary key,
  ultimo_numero int not null default 0
);

create function fn_siguiente_codigo_cotizacion(p_anio smallint)
returns text
language plpgsql
as $$
declare
  v_numero int;
  v_aa text;
begin
  insert into cotizacion_consecutivos (anio, ultimo_numero)
  values (p_anio, 1)
  on conflict (anio) do update set ultimo_numero = cotizacion_consecutivos.ultimo_numero + 1
  returning ultimo_numero into v_numero;

  v_aa := lpad((p_anio % 100)::text, 2, '0');
  return 'CSE-' || v_aa || '-' || lpad(v_numero::text, 3, '0');
end;
$$;

create table cotizaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  anio smallint not null,
  version int not null default 1,
  cliente_id uuid not null references clientes (id),
  descripcion text not null,
  tipo_contrato tipo_contrato not null,
  contrato_firmado boolean not null default false,
  estado estado_cotizacion not null default 'BORRADOR',

  -- Porcentajes de armado de precio (AIU + recargo de proyecto)
  pct_admin numeric(6,4) not null default 0.05,
  pct_imprevistos numeric(6,4) not null default 0.06,
  pct_utilidad_aiu numeric(6,4) not null default 0.05,

  -- Porcentajes de gastos internos (se descuentan de la utilidad, no afectan el precio al cliente)
  pct_admin_gasto_interno numeric(6,4) not null default 0.14,
  pct_renta numeric(6,4) not null default 0.36,
  ica_por_mil numeric(8,4) not null default 12.05,
  pct_comision_comercial numeric(6,4) not null default 0,

  -- Recargo de proyecto: ver nota arriba
  factor_recargo_proyecto numeric(12,10) not null default 1.0
    check (factor_recargo_proyecto > 0 and factor_recargo_proyecto <= 1),
  formula_recargo_nota text,

  iva_pct numeric(5,4) not null default 0.19,

  fecha_emision date not null default current_date,
  fecha_aprobacion date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (anio, version, cliente_id, descripcion)
);

create index idx_cotizaciones_cliente on cotizaciones (cliente_id);
create index idx_cotizaciones_estado on cotizaciones (estado);

create trigger trg_cotizaciones_updated_at
  before update on cotizaciones
  for each row execute function extensions.moddatetime(updated_at);

create table cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones (id) on delete cascade,
  item_catalogo_id uuid references items_catalogo (id),
  categoria categoria_item not null,
  descripcion text not null,
  unidad text not null,
  cantidad numeric(14,4) not null check (cantidad > 0),

  -- Snapshot de precios al momento de cotizar (no cambian si el catálogo cambia después)
  valor_compra_unitario numeric(14,2) not null check (valor_compra_unitario >= 0),
  factor_rentabilidad_linea numeric(6,4) not null
    check (factor_rentabilidad_linea > 0 and factor_rentabilidad_linea <= 1),
  valor_venta_unitario numeric(14,2) generated always as
    (round(valor_compra_unitario / factor_rentabilidad_linea, 2)) stored,

  -- Depende de cotizaciones.factor_recargo_proyecto -> se calcula por trigger, no es columna generada
  valor_calculo_unitario numeric(14,2) not null default 0,

  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cotizacion_items_cotizacion on cotizacion_items (cotizacion_id, orden);

create trigger trg_cotizacion_items_updated_at
  before update on cotizacion_items
  for each row execute function extensions.moddatetime(updated_at);

-- Calcula valor_calculo_unitario = valor_venta_unitario / factor_recargo_proyecto de la cotización.
-- Se recalcula: al insertar/actualizar una línea, y al cambiar el factor de la cotización (ver trigger abajo).
create function fn_calcular_valor_calculo_item()
returns trigger
language plpgsql
as $$
declare
  v_factor numeric(12,10);
  v_venta numeric(14,2);
begin
  select factor_recargo_proyecto into v_factor
  from cotizaciones where id = new.cotizacion_id;

  v_venta := round(new.valor_compra_unitario / new.factor_rentabilidad_linea, 2);
  new.valor_calculo_unitario := round(v_venta / v_factor, 2);
  return new;
end;
$$;

create trigger trg_cotizacion_items_calculo
  before insert or update of valor_compra_unitario, factor_rentabilidad_linea, cotizacion_id
  on cotizacion_items
  for each row execute function fn_calcular_valor_calculo_item();

-- Si cambia el factor de recargo de la cotización (mientras está en BORRADOR), recalcular sus líneas
create function fn_recalcular_items_por_cambio_factor()
returns trigger
language plpgsql
as $$
begin
  if new.factor_recargo_proyecto is distinct from old.factor_recargo_proyecto then
    update cotizacion_items
    set valor_calculo_unitario = round(valor_venta_unitario / new.factor_recargo_proyecto, 2)
    where cotizacion_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_cotizaciones_recalcular_items
  after update of factor_recargo_proyecto on cotizaciones
  for each row execute function fn_recalcular_items_por_cambio_factor();

-- No permitir editar líneas de una cotización ya aprobada (el presupuesto queda congelado)
create function fn_bloquear_edicion_cotizacion_aprobada()
returns trigger
language plpgsql
as $$
declare
  v_estado estado_cotizacion;
begin
  select estado into v_estado from cotizaciones
  where id = coalesce(new.cotizacion_id, old.cotizacion_id);

  if v_estado = 'APROBADA' then
    raise exception 'No se puede modificar una línea de una cotización APROBADA (presupuesto congelado). Use una nueva versión.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_cotizacion_items_bloqueo
  before insert or update or delete on cotizacion_items
  for each row execute function fn_bloquear_edicion_cotizacion_aprobada();

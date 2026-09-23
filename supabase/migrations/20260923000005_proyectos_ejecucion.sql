-- Módulo 1: Proyectos — proyectos, ejecución real e hitos de cobro

create table proyectos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, -- por defecto el mismo código de la cotización aprobada
  nombre text not null,
  cliente_id uuid not null references clientes (id),
  cotizacion_aprobada_id uuid not null references cotizaciones (id),
  tipo_contrato tipo_contrato not null, -- copia inmutable de la cotización al momento de crear el proyecto
  contrato_firmado boolean not null default false,
  estado estado_proyecto not null default 'EN_EJECUCION',
  fecha_inicio date,
  fecha_fin_estimada date,
  fecha_cierre date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_proyectos_cliente on proyectos (cliente_id);
create index idx_proyectos_estado on proyectos (estado);

create trigger trg_proyectos_updated_at
  before update on proyectos
  for each row execute function extensions.moddatetime(updated_at);

-- Solo se puede crear un proyecto a partir de una cotización APROBADA
create function fn_validar_proyecto_desde_cotizacion_aprobada()
returns trigger
language plpgsql
as $$
declare
  v_estado estado_cotizacion;
begin
  select estado into v_estado from cotizaciones where id = new.cotizacion_aprobada_id;
  if v_estado is distinct from 'APROBADA' then
    raise exception 'Solo se puede crear un proyecto desde una cotización en estado APROBADA';
  end if;
  return new;
end;
$$;

create trigger trg_proyectos_validar_cotizacion
  before insert on proyectos
  for each row execute function fn_validar_proyecto_desde_cotizacion_aprobada();

-- Ejecución real: lo efectivamente comprado/gastado. Independiente del presupuesto congelado.
create table proyecto_ejecucion_items (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos (id) on delete cascade,
  presupuesto_item_id uuid references cotizacion_items (id), -- vínculo opcional para comparar desviación
  item_catalogo_id uuid references items_catalogo (id),
  categoria categoria_item not null,
  descripcion text not null,
  unidad text not null,
  cantidad numeric(14,4) not null check (cantidad > 0),
  valor_compra_real_unitario numeric(14,2) not null check (valor_compra_real_unitario >= 0),
  proveedor_real text,
  numero_factura text,
  fecha date not null default current_date,
  soporte_url text, -- referencia a Supabase Storage (foto/pdf de la factura)
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ejecucion_proyecto on proyecto_ejecucion_items (proyecto_id, fecha);
create index idx_ejecucion_presupuesto_item on proyecto_ejecucion_items (presupuesto_item_id);

create trigger trg_ejecucion_updated_at
  before update on proyecto_ejecucion_items
  for each row execute function extensions.moddatetime(updated_at);

-- Hitos de cobro (esquema configurable, N hitos que suman 100%)
create table hitos_cobro (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos (id) on delete cascade,
  orden int not null,
  nombre text not null,
  porcentaje numeric(6,4) not null check (porcentaje > 0 and porcentaje <= 1),
  valor_programado numeric(14,2) not null check (valor_programado >= 0),
  estado estado_hito not null default 'PENDIENTE',
  fecha_programada date,
  fecha_facturado date,
  fecha_cobrado date,
  valor_cobrado numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proyecto_id, orden)
);

create index idx_hitos_proyecto on hitos_cobro (proyecto_id, orden);

create trigger trg_hitos_updated_at
  before update on hitos_cobro
  for each row execute function extensions.moddatetime(updated_at);

-- Los porcentajes de los hitos de un proyecto deben sumar 100% (validación diferida al final de la transacción)
create function fn_validar_suma_hitos()
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

create constraint trigger trg_hitos_validar_suma
  after insert or update or delete on hitos_cobro
  deferrable initially deferred
  for each row execute function fn_validar_suma_hitos();

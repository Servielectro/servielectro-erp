-- Módulo 1: Proyectos — catálogo de ítems (EQUIPOS / MATERIALES / MANO DE OBRA)
-- Origen: hoja "CuadroItems" del Excel (860 ítems). Precios versionados en el tiempo:
-- nunca se sobrescribe un valor, se inserta un nuevo registro con vigente_desde.
-- Idempotente: se puede correr más de una vez sin romper.

create table if not exists items_catalogo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text not null,
  unidad text not null,
  categoria categoria_item not null,
  proveedor text,
  referencia text,
  factor_rentabilidad_linea numeric(6,4) not null default 0.85
    check (factor_rentabilidad_linea > 0 and factor_rentabilidad_linea <= 1),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_catalogo_categoria on items_catalogo (categoria);
create index if not exists idx_items_catalogo_activo on items_catalogo (activo);

create table if not exists items_precios_historico (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items_catalogo (id) on delete cascade,
  valor_compra_iva numeric(14,2) not null check (valor_compra_iva >= 0),
  vigente_desde date not null default current_date,
  fuente text not null default 'MANUAL', -- 'IMPORTACION_EXCEL' | 'MANUAL'
  observaciones text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index if not exists idx_items_precios_item_fecha
  on items_precios_historico (item_id, vigente_desde desc, created_at desc);

-- Precio vigente por ítem: el más reciente por vigente_desde (desempate por created_at)
create or replace view v_items_precio_actual as
select distinct on (h.item_id)
  h.item_id,
  h.valor_compra_iva,
  h.vigente_desde,
  h.fuente,
  h.created_at as actualizado_en
from items_precios_historico h
order by h.item_id, h.vigente_desde desc, h.created_at desc;

create or replace view v_items_catalogo_con_precio as
select
  c.*,
  p.valor_compra_iva,
  p.vigente_desde as precio_vigente_desde,
  p.actualizado_en as precio_actualizado_en,
  round(p.valor_compra_iva / c.factor_rentabilidad_linea, 2) as valor_venta_unitario
from items_catalogo c
left join v_items_precio_actual p on p.item_id = c.id;

drop trigger if exists trg_items_catalogo_updated_at on items_catalogo;
create trigger trg_items_catalogo_updated_at
  before update on items_catalogo
  for each row execute function extensions.moddatetime(updated_at);

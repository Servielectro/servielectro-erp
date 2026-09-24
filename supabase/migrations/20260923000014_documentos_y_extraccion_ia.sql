-- Módulo 1: Proyectos — documentos con extracción por IA (RUT ahora, facturas de
-- proveedor después en el módulo de ejecución). Idempotente: se puede correr más de
-- una vez sin romper.
--
-- Diseño genérico a propósito (ver docs/ERP-Servielectro-Modulo1-Proyectos.md §14):
-- la misma tabla, el mismo flujo de "extraer -> confirmar -> guardar" y el mismo
-- patrón de confianza por campo sirven para el RUT del cliente y, más adelante,
-- para las facturas de proveedor de proyecto_ejecucion_items.

do $$ begin
  create type tipo_documento as enum ('RUT', 'FACTURA_PROVEEDOR');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type estado_documento as enum ('PENDIENTE_CONFIRMACION', 'CONFIRMADO', 'DESCARTADO');
exception when duplicate_object then null;
end $$;

-- Datos que el RUT confirmado aporta al cliente (además de nit/direccion/email/contacto,
-- que ya existían desde la migración 20260923000011).
alter table clientes add column if not exists tipo_contribuyente text;
alter table clientes add column if not exists responsable_iva boolean;
alter table clientes add column if not exists municipio text;
alter table clientes add column if not exists departamento text;

create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  tipo_documento tipo_documento not null,
  cliente_id uuid references clientes (id) on delete cascade,
  proyecto_id uuid references proyectos (id) on delete cascade,
  storage_path text not null,
  nombre_archivo text not null,
  estado estado_documento not null default 'PENDIENTE_CONFIRMACION',
  extraccion_json jsonb,
  valores_confirmados_json jsonb,
  costo_estimado_usd numeric(10,6),
  subido_por uuid references auth.users (id),
  subido_en timestamptz not null default now(),
  confirmado_por uuid references auth.users (id),
  confirmado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un documento de cliente (RUT) cuelga de un cliente; uno de proyecto (factura) de un proyecto.
  check (
    (tipo_documento = 'RUT' and cliente_id is not null)
    or (tipo_documento = 'FACTURA_PROVEEDOR' and proyecto_id is not null)
  )
);

create index if not exists idx_documentos_cliente on documentos (cliente_id, tipo_documento, subido_en desc);
create index if not exists idx_documentos_proyecto on documentos (proyecto_id, tipo_documento, subido_en desc);

drop trigger if exists trg_documentos_updated_at on documentos;
create trigger trg_documentos_updated_at
  before update on documentos
  for each row execute function extensions.moddatetime(updated_at);

-- El RUT más reciente CONFIRMADO de cada cliente (para mostrarlo/reusarlo sin tener
-- que buscar entre el histórico).
create or replace view v_rut_vigente_cliente as
select distinct on (cliente_id)
  id as documento_id,
  cliente_id,
  storage_path,
  nombre_archivo,
  valores_confirmados_json,
  confirmado_en
from documentos
where tipo_documento = 'RUT' and estado = 'CONFIRMADO'
order by cliente_id, confirmado_en desc;

-- Alta rápida de cliente por nombre (o reutilización si ya existe), pensada para
-- resolver un cliente_id ANTES de que la cotización se guarde — hace falta un
-- cliente_id real para poder subir su RUT a Storage mientras se cotiza.
create or replace function fn_buscar_o_crear_cliente(p_nombre text)
returns uuid
language plpgsql
as $$
declare
  v_cliente_id uuid;
begin
  select id into v_cliente_id from clientes where lower(nombre) = lower(trim(p_nombre)) limit 1;
  if v_cliente_id is null then
    insert into clientes (nombre) values (trim(p_nombre)) returning id into v_cliente_id;
  end if;
  return v_cliente_id;
end;
$$;

-- RLS: mismo criterio permisivo que el resto del sistema (ver Decisión "RLS
-- demasiado permisiva" en docs §13 — revisar antes de un segundo usuario).
alter table documentos enable row level security;
drop policy if exists documentos_authenticated_all on documentos;
create policy documentos_authenticated_all on documentos
  for all to authenticated using (true) with check (true);

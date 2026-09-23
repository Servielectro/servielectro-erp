-- Módulo 1: Proyectos — clientes
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  contacto text,
  telefono text,
  email text,
  direccion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clientes_nombre on clientes (nombre);

create trigger trg_clientes_updated_at
  before update on clientes
  for each row execute function extensions.moddatetime(updated_at);

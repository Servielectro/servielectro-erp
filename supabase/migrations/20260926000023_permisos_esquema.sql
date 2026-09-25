-- Módulo de usuarios y permisos — Fase 2a: esquema base (roles, módulos, matriz de
-- permisos, perfil de usuario) + las funciones de resolución. Idempotente: se puede
-- correr más de una vez sin romper.
--
-- Modelo confirmado con Jhojan (2026-09-26): roles dinámicos (los crea él, no son fijos
-- en el código), con una matriz rol × módulo × nivel. Los niveles son de negocio, nunca
-- de sistema — "nadie aparte de Jhojan y el desarrollador va a poder manipular código o
-- bases de datos". Nombres definidos por él:
--   consultar    = solo lectura
--   trabajar     = crear y editar registros
--   responsable  = además aprobar, eliminar y (si el módulo lo permite) ver datos
--                  sensibles del módulo
-- Acumulativos: responsable implica trabajar implica consultar.
--
-- "Ver datos sensibles" es un permiso APARTE (`ve_datos_sensibles`), no derivado del
-- nivel — en Comercial hoy está activado para los tres niveles (el comercial de acá es
-- un ingeniero preventa que cotiza a medida y cobra comisión sobre margen, necesita ver
-- costos), pero el mecanismo tiene que existir para módulos futuros donde sí aplique
-- ocultar (ej. RRHH y nómina).
--
-- Sin fila en permisos_rol para un módulo = sin acceso — el módulo no aparece ni en la
-- home ni en el menú (eso es interfaz, comodidad). Lo que de verdad protege son las
-- políticas RLS de cada tabla de negocio, que se agregan en la Fase 2b usando
-- fn_tiene_permiso — esta migración todavía no toca las tablas de Comercial.

do $$ begin
  create type nivel_permiso as enum ('consultar', 'trabajar', 'responsable');
exception when duplicate_object then null;
end $$;

create table if not exists modulos (
  id text primary key,
  nombre text not null,
  orden int not null default 0
);

insert into modulos (id, nombre, orden) values
  ('comercial', 'Comercial', 1),
  ('financiero', 'Financiero', 2),
  ('contable', 'Contable', 3),
  ('marketing', 'Marketing', 4),
  ('administrativo', 'Administrativo', 5),
  ('rrhh', 'RRHH', 6),
  ('tecnico', 'Técnico', 7),
  ('operativo', 'Operativo', 8),
  ('usuarios', 'Usuarios y permisos', 0)
on conflict (id) do nothing;

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_roles_updated_at on roles;
create trigger trg_roles_updated_at
  before update on roles
  for each row execute function extensions.moddatetime(updated_at);

create table if not exists permisos_rol (
  rol_id uuid not null references roles (id) on delete cascade,
  modulo_id text not null references modulos (id) on delete cascade,
  nivel nivel_permiso not null,
  ve_datos_sensibles boolean not null default false,
  primary key (rol_id, modulo_id)
);

create table if not exists perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  rol_id uuid references roles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_perfiles_updated_at on perfiles;
create trigger trg_perfiles_updated_at
  before update on perfiles
  for each row execute function extensions.moddatetime(updated_at);

-- security definer a propósito: tiene que poder leer perfiles/permisos_rol aunque el
-- usuario que llama no tenga permiso de lectura directo sobre esas tablas todavía (si no,
-- nadie podría resolver ni siquiera "no tengo acceso a nada").
create or replace function fn_tiene_permiso(p_modulo text, p_nivel_minimo nivel_permiso)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select case p_nivel_minimo
        when 'consultar' then true
        when 'trabajar' then pr.nivel in ('trabajar', 'responsable')
        when 'responsable' then pr.nivel = 'responsable'
      end
      from perfiles p
      join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = p_modulo
      where p.id = auth.uid()
    ),
    false
  );
$$;

create or replace function fn_ve_datos_sensibles(p_modulo text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select pr.ve_datos_sensibles
      from perfiles p
      join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = p_modulo
      where p.id = auth.uid()
    ),
    false
  );
$$;

-- Todo el mapa de permisos del usuario actual en un solo viaje — para que la home y el
-- menú decidan qué mostrar sin una consulta por módulo.
create or replace function fn_mis_permisos()
returns table (modulo_id text, nivel nivel_permiso, ve_datos_sensibles boolean)
language sql
security definer
set search_path = public
stable
as $$
  select pr.modulo_id, pr.nivel, pr.ve_datos_sensibles
  from perfiles p
  join permisos_rol pr on pr.rol_id = p.rol_id
  where p.id = auth.uid();
$$;

-- RLS de las tablas nuevas. modulos/roles/permisos_rol son la forma del sistema de
-- permisos, no datos de negocio — cualquier autenticado las puede leer (las necesita
-- para saber qué ve). Escribir (crear rol, cambiar la matriz) requiere ser responsable
-- del módulo 'usuarios'. perfiles se lee a uno mismo o con ese mismo permiso.
alter table modulos enable row level security;
drop policy if exists modulos_select on modulos;
create policy modulos_select on modulos for select to authenticated using (true);

alter table roles enable row level security;
drop policy if exists roles_select on roles;
create policy roles_select on roles for select to authenticated using (true);
drop policy if exists roles_write on roles;
create policy roles_write on roles for all to authenticated
  using (fn_tiene_permiso('usuarios', 'responsable'))
  with check (fn_tiene_permiso('usuarios', 'responsable'));

alter table permisos_rol enable row level security;
drop policy if exists permisos_rol_select on permisos_rol;
create policy permisos_rol_select on permisos_rol for select to authenticated using (true);
drop policy if exists permisos_rol_write on permisos_rol;
create policy permisos_rol_write on permisos_rol for all to authenticated
  using (fn_tiene_permiso('usuarios', 'responsable'))
  with check (fn_tiene_permiso('usuarios', 'responsable'));

alter table perfiles enable row level security;
drop policy if exists perfiles_select on perfiles;
create policy perfiles_select on perfiles for select to authenticated
  using (id = auth.uid() or fn_tiene_permiso('usuarios', 'responsable'));
drop policy if exists perfiles_write on perfiles;
create policy perfiles_write on perfiles for all to authenticated
  using (fn_tiene_permiso('usuarios', 'responsable'))
  with check (fn_tiene_permiso('usuarios', 'responsable'));

-- Rol Administrador: responsable + datos sensibles en todos los módulos. Jhojan queda
-- acá — es dato (una fila por módulo), no una excepción especial en el código.
insert into roles (nombre) values ('Administrador') on conflict (nombre) do nothing;

insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, m.id, 'responsable', true
from roles r
cross join modulos m
where r.nombre = 'Administrador'
on conflict (rol_id, modulo_id) do update set
  nivel = excluded.nivel,
  ve_datos_sensibles = excluded.ve_datos_sensibles;

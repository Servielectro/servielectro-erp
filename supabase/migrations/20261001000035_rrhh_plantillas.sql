-- RRHH — alta del módulo y plantillas de documentos (contrato laboral), 2026-10-01.
--
-- Alcance: SOLO almacenar plantillas .docx con historial de versiones. La generación de
-- contratos NO existe todavía: el modelo de Jhojan pasa por abogado antes. Cuando exista,
-- cada contrato generado va a apuntar a la VERSIÓN exacta de la plantilla que se usó
-- (plantilla_versiones.id), por eso las versiones nunca se borran ni se pisan: solo se
-- marca cuál es la vigente.
--
-- Diseño preparado para la generación (sin implementarla):
--   - plantilla_versiones.marcadores: lista de marcadores {{ASI}} que trae el .docx
--     (NOMBRE_TRABAJADOR, CARGO, SALARIO_LETRAS, FECHA_INICIO…), para validar datos
--     antes de generar. Hoy queda vacío.
--   - Los datos del empleador saldrán fijos del ERP (como en la cotización), no de la
--     plantilla.
--
-- PERMISOS: RRHH maneja salarios y documentos de identidad. A diferencia de Comercial
-- (RLS `using (true)`, Fase 2b pendiente), estas tablas y su bucket nacen con RLS POR
-- ROL: consultar = ver y descargar; trabajar = subir plantillas y versiones. Nadie
-- borra (no hay política de delete).
--
-- Idempotente.

-- ---------------------------------------------------------------- módulo
insert into modulos (id, nombre, orden)
values ('rrhh', 'RRHH', 6)
on conflict (id) do update set nombre = excluded.nombre;

insert into permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'rrhh', 'responsable', true
from roles r
where r.nombre = 'Administrador'
on conflict (rol_id, modulo_id) do nothing;

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type tipo_plantilla as enum ('CONTRATO_LABORAL');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- tablas
create table if not exists plantillas_documento (
  id uuid primary key default gen_random_uuid(),
  modulo_id text not null default 'rrhh' references modulos (id),
  tipo tipo_plantilla not null,
  nombre text not null,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (modulo_id, nombre)
);

create table if not exists plantilla_versiones (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references plantillas_documento (id) on delete restrict,
  version int not null check (version > 0),
  storage_path text not null unique,
  nombre_archivo text not null,
  tamano_bytes bigint,
  vigente boolean not null default false,
  marcadores text[] not null default '{}', -- ver encabezado: se llena con la generación
  notas text,
  subida_por uuid references auth.users (id) default auth.uid(),
  subida_en timestamptz not null default now(),
  unique (plantilla_id, version)
);

-- Una sola versión vigente por plantilla.
create unique index if not exists uq_plantilla_version_vigente
  on plantilla_versiones (plantilla_id) where vigente;

-- Una versión es inmutable: lo único que puede cambiar es si es la vigente (al subir
-- otra, la anterior deja de serlo). Así el historial es confiable.
create or replace function fn_plantilla_version_inmutable()
returns trigger
language plpgsql
as $$
begin
  if (new.plantilla_id, new.version, new.storage_path, new.nombre_archivo, new.tamano_bytes,
      new.marcadores, new.notas, new.subida_por, new.subida_en)
     is distinct from
     (old.plantilla_id, old.version, old.storage_path, old.nombre_archivo, old.tamano_bytes,
      old.marcadores, old.notas, old.subida_por, old.subida_en) then
    raise exception 'Una versión de plantilla no se modifica: sube una versión nueva';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_plantilla_version_inmutable on plantilla_versiones;
create trigger trg_plantilla_version_inmutable
  before update on plantilla_versiones
  for each row execute function fn_plantilla_version_inmutable();

-- Publicar una versión nueva: numera, la deja vigente y quita la marca a la anterior,
-- todo en una transacción. Invoker: la RLS de abajo exige nivel "trabajar" en RRHH.
create or replace function fn_publicar_version_plantilla(
  p_plantilla_id uuid,
  p_storage_path text,
  p_nombre_archivo text,
  p_tamano_bytes bigint,
  p_notas text default null
)
returns uuid
language plpgsql
as $$
declare
  v_version int;
  v_id uuid;
begin
  if not fn_tiene_permiso('rrhh', 'trabajar') then
    raise exception 'No tienes permiso para subir plantillas de RRHH';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from plantilla_versiones where plantilla_id = p_plantilla_id;

  update plantilla_versiones set vigente = false
  where plantilla_id = p_plantilla_id and vigente;

  insert into plantilla_versiones (plantilla_id, version, storage_path, nombre_archivo, tamano_bytes, vigente, notas)
  values (p_plantilla_id, v_version, p_storage_path, p_nombre_archivo, p_tamano_bytes, true, nullif(trim(p_notas), ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------- RLS por rol
alter table plantillas_documento enable row level security;
drop policy if exists plantillas_documento_select on plantillas_documento;
create policy plantillas_documento_select on plantillas_documento for select to authenticated
  using (fn_tiene_permiso('rrhh', 'consultar'));
drop policy if exists plantillas_documento_insert on plantillas_documento;
create policy plantillas_documento_insert on plantillas_documento for insert to authenticated
  with check (fn_tiene_permiso('rrhh', 'trabajar'));
drop policy if exists plantillas_documento_update on plantillas_documento;
create policy plantillas_documento_update on plantillas_documento for update to authenticated
  using (fn_tiene_permiso('rrhh', 'trabajar'))
  with check (fn_tiene_permiso('rrhh', 'trabajar'));

alter table plantilla_versiones enable row level security;
drop policy if exists plantilla_versiones_select on plantilla_versiones;
create policy plantilla_versiones_select on plantilla_versiones for select to authenticated
  using (fn_tiene_permiso('rrhh', 'consultar'));
drop policy if exists plantilla_versiones_insert on plantilla_versiones;
create policy plantilla_versiones_insert on plantilla_versiones for insert to authenticated
  with check (fn_tiene_permiso('rrhh', 'trabajar'));
drop policy if exists plantilla_versiones_update on plantilla_versiones;
create policy plantilla_versiones_update on plantilla_versiones for update to authenticated
  using (fn_tiene_permiso('rrhh', 'trabajar'))
  with check (fn_tiene_permiso('rrhh', 'trabajar'));

-- ---------------------------------------------------------------- Storage
-- Bucket privado, solo .docx, máx 10 MB. Carpeta: plantillas/{plantilla_id}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-rrhh',
  'documentos-rrhh',
  false,
  10485760,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documentos_rrhh_select on storage.objects;
create policy documentos_rrhh_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos-rrhh' and fn_tiene_permiso('rrhh', 'consultar'));

drop policy if exists documentos_rrhh_insert on storage.objects;
create policy documentos_rrhh_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-rrhh' and fn_tiene_permiso('rrhh', 'trabajar'));
-- Sin políticas de update ni delete: un archivo subido no se reemplaza ni se borra.

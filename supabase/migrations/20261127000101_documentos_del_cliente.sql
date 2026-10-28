-- Documentos del CLIENTE que no son de ninguna obra (2026-10-27): cámara de comercio, certificado
-- de existencia y representación (copropiedades: alcaldía), actas del consejo y de la asamblea,
-- reglamento de propiedad horizontal, cédula del representante, certificado bancario. Pedido de
-- Jhojan: "que queden en un cuadro de submódulo del cliente como documentos cargados".
--
-- No se duplica nada: los documentos de obra siguen en proyecto_documentos (migración 90) y el
-- RUT sigue en `documentos` (flujo de lectura con IA, migraciones 14 y 71). La ficha del cliente
-- muestra los tres juntos leyendo de donde viven.
--
-- Mismo diseño que proyecto_documentos: sha256 para no subir dos veces lo mismo, el archivo no se
-- cambia, nada se borra (se archiva con motivo y quién). Permisos: los del cliente (migración
-- 70, fn_clientes_permiso): Comercial o Administrativo; "consultar" ve, "trabajar" sube y archiva.
--
-- Storage: el bucket documentos-clientes, carpeta clientes/{cliente_id}/docs/. Comercial ya tiene
-- todo el bucket (migración 38); Administrativo tenía solo la carpeta rut/ (71) y aquí se le suma
-- docs/. El bucket sube a 15 MB (igual que documentos-proyectos: un acta escaneada pasa de 10) y
-- acepta Word, Excel y HEIC además de PDF y fotos.
--
-- Va después de la 90. Idempotente.
-- Verificación: supabase/verificaciones/20261127000101_verificar.sql
-- Rollback:     supabase/rollbacks/20261127000101_documentos_del_cliente_down.sql

-- ============================================================ 1) tabla
create table if not exists public.cliente_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  tipo text not null check (tipo in (
    'camara_comercio', 'existencia_representacion', 'acta_consejo', 'acta_asamblea',
    'reglamento_ph', 'cedula_representante', 'certificado_bancario', 'otro')),
  nombre text not null check (length(trim(nombre)) > 0),
  nombre_archivo text not null,
  path text not null unique,                                    -- clientes/{cliente_id}/docs/...
  mime text not null,
  bytes bigint not null check (bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  fecha_documento date,
  origen text not null default 'original' check (origen in ('original', 'escaneado', 'fotos', 'generado')),
  notas text,
  subido_por uuid default auth.uid() references public.perfiles (id),
  subido_en timestamptz not null default now(),
  archivado boolean not null default false,
  archivado_en timestamptz,
  archivado_por uuid references public.perfiles (id),
  motivo_archivo text,
  updated_at timestamptz not null default now(),
  constraint cliente_documentos_path check (path like 'clientes/' || cliente_id::text || '/docs/%'),
  constraint cliente_documentos_archivo check (not archivado or length(trim(coalesce(motivo_archivo, ''))) > 0)
);
create unique index if not exists uq_cliente_documentos_sha on public.cliente_documentos (cliente_id, sha256) where not archivado;
create index if not exists idx_cliente_documentos on public.cliente_documentos (cliente_id, tipo, fecha_documento desc);
drop trigger if exists trg_cliente_documentos_updated_at on public.cliente_documentos;
create trigger trg_cliente_documentos_updated_at before update on public.cliente_documentos
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 2) reglas (NO definer: current_user es quien llama)
create or replace function public.fn_cliente_documentos_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Un documento del cliente no se borra: se archiva con motivo.';
  end if;
  if tg_op = 'INSERT' then
    if current_user <> 'service_role' then
      new.subido_por := auth.uid();
    end if;
    new.subido_en := now();
    new.archivado := false;
    new.archivado_en := null; new.archivado_por := null; new.motivo_archivo := null;
    return new;
  end if;
  if (new.cliente_id, new.path, new.nombre_archivo, new.mime, new.bytes, new.sha256, new.subido_por, new.subido_en)
     is distinct from (old.cliente_id, old.path, old.nombre_archivo, old.mime, old.bytes, old.sha256, old.subido_por, old.subido_en) then
    raise exception 'El archivo de un documento no se cambia: sube otro y archiva este.';
  end if;
  if new.archivado is distinct from old.archivado then
    if length(trim(coalesce(new.motivo_archivo, ''))) = 0 or new.motivo_archivo is not distinct from old.motivo_archivo then
      raise exception 'Escribe el motivo (%).', case when new.archivado then 'por qué se archiva' else 'por qué se saca del archivo' end;
    end if;
    new.archivado_en := case when new.archivado then now() end;
    new.archivado_por := auth.uid();
  elsif (new.archivado_en, new.archivado_por) is distinct from (old.archivado_en, old.archivado_por) then
    raise exception 'Quién y cuándo archivó lo registra la base.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cliente_documentos_reglas on public.cliente_documentos;
create trigger trg_cliente_documentos_reglas before insert or update or delete on public.cliente_documentos
  for each row execute function public.fn_cliente_documentos_reglas();

-- ============================================================ 3) RLS
alter table public.cliente_documentos enable row level security;
revoke all on table public.cliente_documentos from anon;
revoke truncate, trigger, references, delete on table public.cliente_documentos from authenticated;
drop policy if exists cliente_documentos_select on public.cliente_documentos;
create policy cliente_documentos_select on public.cliente_documentos for select to authenticated
  using (fn_clientes_permiso('consultar'));
drop policy if exists cliente_documentos_insert on public.cliente_documentos;
create policy cliente_documentos_insert on public.cliente_documentos for insert to authenticated
  with check (fn_clientes_permiso('trabajar'));
drop policy if exists cliente_documentos_update on public.cliente_documentos;
create policy cliente_documentos_update on public.cliente_documentos for update to authenticated
  using (fn_clientes_permiso('trabajar'))
  with check (fn_clientes_permiso('trabajar'));

-- ============================================================ 4) Storage: carpeta docs/ para Administrativo
-- (Comercial ya ve y sube en todo el bucket desde la 38.) Se sube a la carpeta de un cliente que
-- existe; se ve si su fila se ve. Definer porque storage.objects no ve clientes con la RLS de quien
-- llama… y sí debe: la condición es "ese cliente existe", no "lo puedes ver".
create or replace function public.fn_cliente_archivo(p_nombre text, p_accion text)
returns boolean language sql stable security definer set search_path = public as $$
  select (storage.foldername(p_nombre))[1] = 'clientes'
     and (storage.foldername(p_nombre))[3] = 'docs'
     and case p_accion
           when 'ver' then fn_tiene_permiso('administrativo', 'consultar')
                           and exists (select 1 from cliente_documentos d where d.path = p_nombre)
           when 'subir' then fn_tiene_permiso('administrativo', 'trabajar')
                             and exists (select 1 from clientes c where c.id::text = (storage.foldername(p_nombre))[2])
           else false
         end;
$$;
revoke all on function public.fn_cliente_archivo(text, text) from public, anon;
grant execute on function public.fn_cliente_archivo(text, text) to authenticated;
revoke all on function public.fn_cliente_documentos_reglas() from public, anon, authenticated;

drop policy if exists documentos_clientes_docs_administrativo_select on storage.objects;
create policy documentos_clientes_docs_administrativo_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes' and fn_cliente_archivo(name, 'ver'));
drop policy if exists documentos_clientes_docs_administrativo_insert on storage.objects;
create policy documentos_clientes_docs_administrativo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes' and fn_cliente_archivo(name, 'subir'));

-- ============================================================ 5) bucket: 15 MB y más tipos
update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-excel.sheet.macroEnabled.12', 'text/plain']
 where id = 'documentos-clientes';

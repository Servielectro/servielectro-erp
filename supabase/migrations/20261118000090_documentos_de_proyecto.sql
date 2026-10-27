-- Documentos de un proyecto y sus pólizas (2026-10-27). Lo que bloquea cargar las obras reales
-- (la primera, CSE-26-151 Tintalá Fase VI). Diseño del orquestador, con tres ajustes:
--
--   1) PÓLIZAS CON AMPAROS. Una póliza no tiene UNA vigencia: la de cumplimiento de Tintalá trae
--      seis amparos (anticipo y cumplimiento hasta 15/05/2027, salarios hasta 15/11/2029, calidad
--      del servicio hasta 15/11/2027) y dos de ellos (calidad y correcto funcionamiento, y
--      estabilidad de la obra) EMPIEZAN con el acta de entrega: "1 año, 0 meses y 24 días" desde
--      esa firma, sin fecha todavía. Los avisos de vencimiento salen de los amparos, no de la
--      póliza. Por eso: proyecto_polizas (lo del documento: aseguradora, número, prima, quién la
--      pagó) + proyecto_poliza_amparos (cada amparo con su valor y su vigencia, o "empieza con el
--      acta de entrega" y su duración tal como la escribe la aseguradora).
--   2) RESERVADO. La cotización en Excel (.xlsm) trae el cuadro de costos: compra, factores y
--      utilidades. No la puede abrir cualquiera que vea el proyecto: un documento "reservado" lo
--      ven solo quienes tienen ve_datos_sensibles en Comercial o Proyectos (el mecanismo que ya
--      existe en permisos_rol).
--   3) Columnas genéricas: origen (original | escaneado | fotos | generado), referencia (número
--      de recibo, de cuenta de cobro…) y valor. Y un mismo archivo no se sube dos veces al mismo
--      proyecto (sha256).
--
-- Permisos: los del proyecto (migración 63): Comercial o Proyectos, "consultar" ve, "trabajar"
-- sube. Nada se borra: se archiva con motivo y quién (y se saca del archivo con motivo, igual).
-- Las pólizas y sus amparos no se borran: se corrigen (quedan con updated_at).
-- Bucket privado documentos-proyectos, 15 MB, {proyecto_id}/{archivo}. Sin reemplazar ni borrar.
--
-- Va después de la 63. Idempotente.
-- Verificación: supabase/verificaciones/20261118000090_verificar.sql
-- Rollback:     supabase/rollbacks/20261118000090_documentos_de_proyecto_down.sql

-- ============================================================ 1) documentos
create table if not exists public.proyecto_documentos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete restrict,
  tipo text not null check (tipo in (
    'cotizacion', 'contrato_firmado', 'contrato_borrador', 'poliza', 'comprobante_pago_poliza',
    'acta_inicio', 'acta_corte', 'acta_entrega', 'acta_liquidacion', 'informe_tecnico',
    'cuenta_de_cobro', 'orden_compra', 'cronograma', 'plano', 'registro_fotografico', 'otro')),
  nombre text not null check (length(trim(nombre)) > 0),      -- cómo se muestra
  nombre_archivo text not null,                                 -- el nombre original
  path text not null unique,                                    -- {proyecto_id}/... en el bucket
  mime text not null,
  bytes bigint not null check (bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  fecha_documento date,
  origen text not null default 'original' check (origen in ('original', 'escaneado', 'fotos', 'generado')),
  referencia text,
  valor numeric(16,2) check (valor is null or valor >= 0),
  reservado boolean not null default false,
  notas text,
  subido_por uuid default auth.uid() references public.perfiles (id),
  subido_en timestamptz not null default now(),
  archivado boolean not null default false,
  archivado_en timestamptz,
  archivado_por uuid references public.perfiles (id),
  motivo_archivo text,
  updated_at timestamptz not null default now(),
  constraint proyecto_documentos_path check (path like proyecto_id::text || '/%'),
  constraint proyecto_documentos_archivo check (not archivado or length(trim(coalesce(motivo_archivo, ''))) > 0)
);
create unique index if not exists uq_proyecto_documentos_sha on public.proyecto_documentos (proyecto_id, sha256) where not archivado;
create index if not exists idx_proyecto_documentos on public.proyecto_documentos (proyecto_id, tipo, fecha_documento desc);
drop trigger if exists trg_proyecto_documentos_updated_at on public.proyecto_documentos;
create trigger trg_proyecto_documentos_updated_at before update on public.proyecto_documentos
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 2) pólizas y amparos
create table if not exists public.proyecto_polizas (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null unique references public.proyecto_documentos (id) on delete restrict,
  aseguradora text not null check (length(trim(aseguradora)) > 0),
  numero text not null check (length(trim(numero)) > 0),
  ramo text,                                   -- "Cumplimiento particular", "RCE derivada de cumplimiento"
  fecha_expedicion date,
  prima_neta numeric(14,2) check (prima_neta is null or prima_neta >= 0),
  gastos_expedicion numeric(14,2) check (gastos_expedicion is null or gastos_expedicion >= 0),
  iva numeric(14,2) check (iva is null or iva >= 0),
  total_pagar numeric(14,2) check (total_pagar is null or total_pagar >= 0),
  valor_asegurado_total numeric(16,2) check (valor_asegurado_total is null or valor_asegurado_total >= 0),
  -- El comprobante de pago (un mismo recibo puede cubrir varias pólizas). Sin pago la póliza
  -- puede terminarse por mora: de aquí sale el aviso "póliza sin pagar".
  pago_documento_id uuid references public.proyecto_documentos (id) on delete restrict,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aseguradora, numero)
);
drop trigger if exists trg_proyecto_polizas_updated_at on public.proyecto_polizas;
create trigger trg_proyecto_polizas_updated_at before update on public.proyecto_polizas
  for each row execute function extensions.moddatetime(updated_at);

create table if not exists public.proyecto_poliza_amparos (
  id uuid primary key default gen_random_uuid(),
  poliza_id uuid not null references public.proyecto_polizas (id) on delete restrict,
  amparo text not null check (length(trim(amparo)) > 0),
  valor_asegurado numeric(16,2) not null check (valor_asegurado >= 0),
  -- 'fecha': vigencia con fechas. 'acta_entrega': empieza al firmar el acta de entrega; mientras
  -- no esté firmada, sin fechas y con la duración como la escribe la póliza.
  inicia_con text not null default 'fecha' check (inicia_con in ('fecha', 'acta_entrega')),
  vigencia_desde date,
  vigencia_hasta date,
  duracion text,
  deducible text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proyecto_amparos_vigencia check (
    (inicia_con = 'fecha' and vigencia_desde is not null and vigencia_hasta is not null and vigencia_hasta >= vigencia_desde)
    or (inicia_con = 'acta_entrega' and length(trim(coalesce(duracion, ''))) > 0
        and (vigencia_hasta is null or vigencia_desde is not null)
        and (vigencia_hasta is null or vigencia_hasta >= vigencia_desde)))
);
create index if not exists idx_proyecto_amparos_vence on public.proyecto_poliza_amparos (vigencia_hasta);
drop trigger if exists trg_proyecto_amparos_updated_at on public.proyecto_poliza_amparos;
create trigger trg_proyecto_amparos_updated_at before update on public.proyecto_poliza_amparos
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 3) funciones de acceso
-- ¿Puede ver este documento? Lo del proyecto, y si es reservado, además datos sensibles.
create or replace function public.fn_proyecto_documento_visible(p_documento_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proyecto_documentos d
    where d.id = p_documento_id
      and (fn_tiene_permiso('comercial', 'consultar') or fn_tiene_permiso('proyectos', 'consultar'))
      and (not d.reservado or fn_ve_datos_sensibles('comercial') or fn_ve_datos_sensibles('proyectos')));
$$;

create or replace function public.fn_proyecto_documentos_trabajar()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_tiene_permiso('comercial', 'trabajar') or fn_tiene_permiso('proyectos', 'trabajar');
$$;

-- Archivo del bucket: se ve si su fila se ve. Se sube a la carpeta de un proyecto que existe.
create or replace function public.fn_proyecto_archivo(p_nombre text, p_accion text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_accion
    when 'ver' then exists (select 1 from proyecto_documentos d where d.path = p_nombre and fn_proyecto_documento_visible(d.id))
    when 'subir' then fn_proyecto_documentos_trabajar()
                      and exists (select 1 from proyectos p where p.id::text = (storage.foldername(p_nombre))[1])
    else false
  end;
$$;

-- ============================================================ 4) reglas (NO definer: current_user tiene que ser quien llama)
create or replace function public.fn_proyecto_documentos_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Un documento del proyecto no se borra: se archiva con motivo.';
  end if;
  if tg_op = 'INSERT' then
    -- El cargue inicial (service_role) puede dejar subido_por vacío; desde la app, quien sube.
    if current_user <> 'service_role' then
      new.subido_por := auth.uid();
    end if;
    new.subido_en := now();
    new.archivado := false;
    new.archivado_en := null; new.archivado_por := null; new.motivo_archivo := null;
    return new;
  end if;
  -- UPDATE: el archivo es el que es.
  if (new.proyecto_id, new.path, new.nombre_archivo, new.mime, new.bytes, new.sha256, new.subido_por, new.subido_en)
     is distinct from (old.proyecto_id, old.path, old.nombre_archivo, old.mime, old.bytes, old.sha256, old.subido_por, old.subido_en) then
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
  -- Marcar o desmarcar "reservado" pide datos sensibles: si no, cualquiera podría destaparlo.
  if new.reservado is distinct from old.reservado
     and not (fn_ve_datos_sensibles('comercial') or fn_ve_datos_sensibles('proyectos')) then
    raise exception 'Solo quien ve datos sensibles marca o desmarca un documento como reservado.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_proyecto_documentos_reglas on public.proyecto_documentos;
create trigger trg_proyecto_documentos_reglas before insert or update or delete on public.proyecto_documentos
  for each row execute function public.fn_proyecto_documentos_reglas();

-- La póliza cuelga de un documento tipo 'poliza'; su pago, de uno tipo 'comprobante_pago_poliza'
-- del mismo proyecto. (Definer de lectura usada por trigger: sin filtro de permiso, ver la 88.)
create or replace function public.fn_proyecto_documento_tipo(p_documento_id uuid, out tipo text, out proyecto_id uuid)
language sql stable security definer set search_path = public as $$
  select d.tipo, d.proyecto_id from proyecto_documentos d where d.id = p_documento_id and pg_trigger_depth() > 0;
$$;

create or replace function public.fn_proyecto_polizas_reglas()
returns trigger language plpgsql set search_path = public as $$
declare
  v_doc record;
  v_pago record;
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Una póliza no se borra: se corrige, o se archiva su documento.';
  end if;
  select * into v_doc from fn_proyecto_documento_tipo(new.documento_id);
  if v_doc.tipo is distinct from 'poliza' then
    raise exception 'Una póliza va con un documento de tipo póliza.';
  end if;
  if new.pago_documento_id is not null then
    select * into v_pago from fn_proyecto_documento_tipo(new.pago_documento_id);
    if v_pago.tipo is distinct from 'comprobante_pago_poliza' or v_pago.proyecto_id is distinct from v_doc.proyecto_id then
      raise exception 'El pago de la póliza es un comprobante de pago de póliza del mismo proyecto.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_proyecto_polizas_reglas on public.proyecto_polizas;
create trigger trg_proyecto_polizas_reglas before insert or update or delete on public.proyecto_polizas
  for each row execute function public.fn_proyecto_polizas_reglas();

create or replace function public.fn_proyecto_amparos_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  raise exception 'Un amparo no se borra: se corrige.';
end;
$$;
drop trigger if exists trg_proyecto_amparos_reglas on public.proyecto_poliza_amparos;
create trigger trg_proyecto_amparos_reglas before delete on public.proyecto_poliza_amparos
  for each row execute function public.fn_proyecto_amparos_reglas();

-- ============================================================ 5) vigencias (de aquí salen los avisos)
create or replace view public.v_proyecto_amparos_vigencia
with (security_invoker = true) as
select a.id as amparo_id, p.id as poliza_id, d.proyecto_id, d.id as documento_id,
       p.aseguradora, p.numero, p.ramo, a.amparo, a.valor_asegurado, a.inicia_con,
       a.vigencia_desde, a.vigencia_hasta, a.duracion,
       case when a.vigencia_hasta is null then null
            else a.vigencia_hasta - (now() at time zone 'America/Bogota')::date end as dias_para_vencer,
       (p.pago_documento_id is not null) as pagada
from public.proyecto_poliza_amparos a
join public.proyecto_polizas p on p.id = a.poliza_id
join public.proyecto_documentos d on d.id = p.documento_id
where not d.archivado;

-- ============================================================ 6) privilegios y RLS
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['proyecto_documentos', 'proyecto_polizas', 'proyecto_poliza_amparos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references, delete on table public.%I from authenticated', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;
revoke all on table public.v_proyecto_amparos_vigencia from anon;

create policy proyecto_documentos_select on public.proyecto_documentos for select to authenticated
  using (fn_proyecto_documento_visible(id));
create policy proyecto_documentos_insert on public.proyecto_documentos for insert to authenticated
  with check (fn_proyecto_documentos_trabajar()
              and (not reservado or fn_ve_datos_sensibles('comercial') or fn_ve_datos_sensibles('proyectos')));
create policy proyecto_documentos_update on public.proyecto_documentos for update to authenticated
  using (fn_proyecto_documentos_trabajar() and fn_proyecto_documento_visible(id))
  with check (fn_proyecto_documentos_trabajar());

create policy proyecto_polizas_select on public.proyecto_polizas for select to authenticated
  using (fn_proyecto_documento_visible(documento_id));
create policy proyecto_polizas_insert on public.proyecto_polizas for insert to authenticated
  with check (fn_proyecto_documentos_trabajar());
create policy proyecto_polizas_update on public.proyecto_polizas for update to authenticated
  using (fn_proyecto_documentos_trabajar() and fn_proyecto_documento_visible(documento_id))
  with check (fn_proyecto_documentos_trabajar());

create policy proyecto_poliza_amparos_select on public.proyecto_poliza_amparos for select to authenticated
  using (exists (select 1 from proyecto_polizas p where p.id = poliza_id));
create policy proyecto_poliza_amparos_insert on public.proyecto_poliza_amparos for insert to authenticated
  with check (fn_proyecto_documentos_trabajar());
create policy proyecto_poliza_amparos_update on public.proyecto_poliza_amparos for update to authenticated
  using (fn_proyecto_documentos_trabajar() and exists (select 1 from proyecto_polizas p where p.id = poliza_id))
  with check (fn_proyecto_documentos_trabajar());

-- ============================================================ 7) bucket privado documentos-proyectos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-proyectos', 'documentos-proyectos', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel.sheet.macroEnabled.12',
              'application/vnd.ms-project', 'application/acad', 'image/vnd.dwg', 'application/dxf', 'text/plain'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documentos_proyectos_insert on storage.objects;
create policy documentos_proyectos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-proyectos' and fn_proyecto_archivo(name, 'subir'));
drop policy if exists documentos_proyectos_select on storage.objects;
create policy documentos_proyectos_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos-proyectos' and fn_proyecto_archivo(name, 'ver'));
-- Sin update ni delete: lo subido no se reemplaza ni se borra.

-- ============================================================ 8) privilegios de las funciones
revoke all on function public.fn_proyecto_documento_visible(uuid) from public, anon;
revoke all on function public.fn_proyecto_documentos_trabajar() from public, anon;
revoke all on function public.fn_proyecto_archivo(text, text) from public, anon;
revoke all on function public.fn_proyecto_documento_tipo(uuid) from public, anon;
grant execute on function public.fn_proyecto_documento_visible(uuid) to authenticated, service_role;
grant execute on function public.fn_proyecto_documentos_trabajar() to authenticated, service_role;
grant execute on function public.fn_proyecto_archivo(text, text) to authenticated;
grant execute on function public.fn_proyecto_documento_tipo(uuid) to authenticated, service_role;
-- de trigger: nadie
revoke all on function public.fn_proyecto_documentos_reglas() from public, anon, authenticated;
revoke all on function public.fn_proyecto_polizas_reglas() from public, anon, authenticated;
revoke all on function public.fn_proyecto_amparos_reglas() from public, anon, authenticated;

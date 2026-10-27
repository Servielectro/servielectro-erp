-- SG-SST, primera vuelta (2026-10-26): armador de plantillas, formatos llenados en sitio con fotos y
-- firmas (sellados), y la ESTRUCTURA del plan de trabajo, vacía. Alcance: docs/modulo-sgsst.md.
--
-- Decisiones (docs/modulo-sgsst.md y lo que Jhojan confirmó el 26/10):
--   - Las plantillas se ARMAN, no se programan: los campos son datos (jsonb) que la base valida.
--     Una plantilla publicada no cambia: para cambiarla se publica una versión nueva, y cada
--     formato queda amarrado a la versión exacta con que se llenó.
--   - Firma manuscrita digitalizada (el mismo lienzo de las visitas). Lo que la hace defendible es el
--     registro alrededor, y eso lo pone la base: quién la registró (sesión), cuándo la recibió el
--     servidor y cuándo se hizo en el dispositivo (puede haberse hecho sin señal), desde qué
--     dispositivo, dónde (GPS), y el SHA-256 del contenido que se firmó. NO es firma digital con
--     certificado (Ley 527 de 1999).
--   - Sellado: con la PRIMERA firma el contenido del formato queda congelado (respuestas, fotos,
--     lugar, fecha): todos firman lo mismo. Al cerrarlo ("firmado") se guarda el hash del contenido;
--     fn_sst_formato_integro() lo recalcula para comprobar que nada cambió.
--   - Todo se archiva, nada se borra: plantillas archivadas, formatos y evidencias anulados con
--     motivo. Ni el administrador borra por SQL sin desactivar los disparadores a propósito.
--   - Plan de trabajo: estándar, responsable, fecha límite, evidencias y avance. NO se carga ningún
--     estándar: lo arman Jhojan y la responsable SST.
--
-- Permisos (módulo nuevo "sgsst", dos oficios):
--   responsable = gestión (oficina): arma y publica plantillas, aprueba y anula formatos, arma el plan.
--   trabajar    = SST en obra: llena formatos, recoge firmas y fotos, cierra; carga avance y evidencias.
--   consultar   = ve todo (no hay plata aquí).
--   El técnico que firma un ATS no necesita el módulo: su firma la registra el SST en su dispositivo.
--
-- Verificación: supabase/verificaciones/20261105000075_verificar.sql
-- Rollback:     supabase/rollbacks/20261105000075_sgsst_plantillas_formatos_plan_down.sql
-- Idempotente.

-- ============================================================ 1) módulo
insert into public.modulos (id, nombre, orden)
values ('sgsst', 'SG-SST', 12)
on conflict (id) do nothing;

insert into public.permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'sgsst', 'responsable', true
from public.roles r
where r.nombre = 'Administrador'
on conflict (rol_id, modulo_id) do nothing;

-- ============================================================ 2) plantillas
-- campos: [{ "id": "trabajo", "tipo": "texto", "etiqueta": "Trabajo a realizar", "obligatorio": true,
--            "ayuda": "...", "opciones": [...] (lista), "multiple": bool (lista),
--            "columnas": [{ "id", "tipo", "etiqueta", "opciones" }] (tabla) }, ...]
-- firmas: [{ "rol": "tecnico" | "responsable_sst" | "sst_cliente" | "otro", "etiqueta": "...", "obligatoria": bool }]
create or replace function public.fn_sst_campos_problema(p_campos jsonb, p_firmas jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  c jsonb;
  col jsonb;
  ids text[] := '{}';
  idsc text[];
  tipos text[] := array['seccion', 'texto', 'texto_largo', 'numero', 'si_no', 'lista', 'fecha', 'hora', 'foto', 'firma', 'ubicacion', 'tabla'];
  tipos_col text[] := array['texto', 'numero', 'si_no', 'lista', 'fecha', 'hora'];
  f jsonb;
begin
  if jsonb_typeof(p_campos) is distinct from 'array' then
    return 'Los campos tienen que ser una lista.';
  end if;
  if jsonb_array_length(p_campos) = 0 then
    return 'La plantilla no tiene campos.';
  end if;
  for c in select * from jsonb_array_elements(p_campos) loop
    if jsonb_typeof(c) <> 'object' or coalesce(c ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' then
      return format('Un campo tiene un identificador inválido (%s): solo minúsculas, números y _.', coalesce(c ->> 'id', 'vacío'));
    end if;
    if (c ->> 'id') = any (ids) then
      return format('El identificador "%s" está repetido.', c ->> 'id');
    end if;
    ids := ids || (c ->> 'id');
    if not (coalesce(c ->> 'tipo', '') = any (tipos)) then
      return format('El campo "%s" tiene un tipo que no existe (%s).', c ->> 'id', coalesce(c ->> 'tipo', 'vacío'));
    end if;
    if length(trim(coalesce(c ->> 'etiqueta', ''))) = 0 then
      return format('El campo "%s" no tiene nombre.', c ->> 'id');
    end if;
    if c ->> 'tipo' = 'lista' and (jsonb_typeof(c -> 'opciones') is distinct from 'array' or jsonb_array_length(c -> 'opciones') = 0) then
      return format('La lista "%s" no tiene opciones.', c ->> 'etiqueta');
    end if;
    if c ->> 'tipo' = 'tabla' then
      if jsonb_typeof(c -> 'columnas') is distinct from 'array' or jsonb_array_length(c -> 'columnas') = 0 then
        return format('La tabla "%s" no tiene columnas.', c ->> 'etiqueta');
      end if;
      idsc := '{}';
      for col in select * from jsonb_array_elements(c -> 'columnas') loop
        if coalesce(col ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' or (col ->> 'id') = any (idsc) then
          return format('La tabla "%s" tiene una columna con identificador inválido o repetido.', c ->> 'etiqueta');
        end if;
        idsc := idsc || (col ->> 'id');
        if not (coalesce(col ->> 'tipo', '') = any (tipos_col)) or length(trim(coalesce(col ->> 'etiqueta', ''))) = 0 then
          return format('La tabla "%s" tiene una columna sin nombre o de un tipo que no va en tablas.', c ->> 'etiqueta');
        end if;
        if col ->> 'tipo' = 'lista' and (jsonb_typeof(col -> 'opciones') is distinct from 'array' or jsonb_array_length(col -> 'opciones') = 0) then
          return format('La columna "%s" de "%s" no tiene opciones.', col ->> 'etiqueta', c ->> 'etiqueta');
        end if;
      end loop;
    end if;
  end loop;
  if jsonb_typeof(p_firmas) is distinct from 'array' then
    return 'Las firmas tienen que ser una lista.';
  end if;
  for f in select * from jsonb_array_elements(p_firmas) loop
    if not (coalesce(f ->> 'rol', '') = any (array['tecnico', 'responsable_sst', 'sst_cliente', 'otro'])) then
      return format('La firma "%s" tiene un rol que no existe.', coalesce(f ->> 'etiqueta', '?'));
    end if;
    if length(trim(coalesce(f ->> 'etiqueta', ''))) = 0 then
      return 'Una firma no tiene nombre (ej. "SST del cliente").';
    end if;
  end loop;
  return null;
end;
$$;

create table if not exists public.sst_plantillas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (length(trim(codigo)) > 0),          -- ej. SST-F-001
  nombre text not null check (length(trim(nombre)) > 0),          -- ej. Análisis de trabajo seguro (ATS)
  version int not null default 1 check (version > 0),
  plantilla_anterior_id uuid references public.sst_plantillas (id),
  descripcion text,
  campos jsonb not null default '[]'::jsonb,
  firmas jsonb not null default '[]'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'publicada', 'archivada')),
  creada_por uuid default auth.uid() references public.perfiles (id),
  creada_en timestamptz not null default now(),
  publicada_por uuid references public.perfiles (id),
  publicada_en timestamptz,
  archivada_por uuid references public.perfiles (id),
  archivada_en timestamptz,
  motivo_archivo text,
  updated_at timestamptz not null default now(),
  unique (codigo, version),
  constraint sst_plantillas_publicada check (estado = 'borrador' or publicada_en is not null or archivada_en is not null),
  constraint sst_plantillas_archivo check (estado <> 'archivada' or length(trim(coalesce(motivo_archivo, ''))) > 0)
);

create or replace function public.fn_sst_plantilla_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_problema text;
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Las plantillas no se borran: se archivan con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.estado := 'borrador';
    new.creada_por := auth.uid();
    new.creada_en := now();
    new.publicada_por := null; new.publicada_en := null;
    new.archivada_por := null; new.archivada_en := null; new.motivo_archivo := null;
    if new.plantilla_anterior_id is not null then
      select max(version) + 1 into new.version from sst_plantillas
      where codigo = (select codigo from sst_plantillas where id = new.plantilla_anterior_id);
      new.codigo := (select codigo from sst_plantillas where id = new.plantilla_anterior_id);
    end if;
    -- A medio armar sirve, pero lo que traiga tiene que tener forma válida.
    if jsonb_array_length(new.campos) > 0 then
      v_problema := fn_sst_campos_problema(new.campos, new.firmas);
      if v_problema is not null then
        raise exception '%', v_problema;
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if old.estado = 'archivada' then
    raise exception 'La plantilla está archivada: no cambia.';
  end if;
  if old.estado = 'publicada'
     and (new.codigo, new.nombre, new.version, new.campos, new.firmas, new.descripcion, new.plantilla_anterior_id)
         is distinct from (old.codigo, old.nombre, old.version, old.campos, old.firmas, old.descripcion, old.plantilla_anterior_id) then
    raise exception 'La plantilla ya está publicada: no se edita. Crea una versión nueva.';
  end if;
  if (new.creada_por, new.creada_en) is distinct from (old.creada_por, old.creada_en) then
    raise exception 'Quién y cuándo creó la plantilla no se cambia.';
  end if;
  if new.estado is distinct from old.estado then
    if old.estado = 'borrador' and new.estado = 'publicada' then
      v_problema := fn_sst_campos_problema(new.campos, new.firmas);
      if v_problema is not null then
        raise exception 'No se puede publicar: %', v_problema;
      end if;
      if jsonb_array_length(new.firmas) = 0 then
        raise exception 'No se puede publicar: la plantilla no pide ninguna firma.';
      end if;
      new.publicada_por := auth.uid();
      new.publicada_en := now();
    elsif new.estado = 'archivada' then
      if length(trim(coalesce(new.motivo_archivo, ''))) = 0 then
        raise exception 'Escribe por qué se archiva la plantilla.';
      end if;
      new.archivada_por := auth.uid();
      new.archivada_en := now();
    else
      raise exception 'Una plantilla no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  elsif (new.publicada_por, new.publicada_en, new.archivada_por, new.archivada_en, new.motivo_archivo)
        is distinct from (old.publicada_por, old.publicada_en, old.archivada_por, old.archivada_en, old.motivo_archivo) then
    raise exception 'La publicación y el archivo los pone la base.';
  end if;
  -- En borrador, los campos se pueden guardar a medio armar, pero con forma válida si traen algo.
  if new.estado = 'borrador' and jsonb_array_length(new.campos) > 0 then
    v_problema := fn_sst_campos_problema(new.campos, new.firmas);
    if v_problema is not null then
      raise exception '%', v_problema;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_plantilla_reglas on public.sst_plantillas;
create trigger trg_sst_plantilla_reglas
  before insert or update or delete on public.sst_plantillas
  for each row execute function public.fn_sst_plantilla_reglas();
drop trigger if exists trg_sst_plantillas_updated_at on public.sst_plantillas;
create trigger trg_sst_plantillas_updated_at
  before update on public.sst_plantillas
  for each row execute function extensions.moddatetime(updated_at);

-- ============================================================ 3) formatos llenados
-- El id lo genera el dispositivo (sin señal): reintentar no duplica.
create table if not exists public.sst_formatos (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.sst_plantillas (id),
  proyecto_id uuid references public.proyectos (id),
  cliente_id uuid references public.clientes (id),
  lugar text,
  fecha date not null default ((now() at time zone 'America/Bogota')::date),
  respuestas jsonb not null default '{}'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'firmado', 'aprobado', 'anulado')),
  creado_por uuid not null default auth.uid() references public.perfiles (id),
  creado_en timestamptz not null default now(),
  sellado_en timestamptz,
  hash_contenido text,
  aprobado_por uuid references public.perfiles (id),
  aprobado_en timestamptz,
  anulado_por uuid references public.perfiles (id),
  anulado_en timestamptz,
  motivo_anulacion text,
  updated_at timestamptz not null default now(),
  constraint sst_formatos_respuestas check (jsonb_typeof(respuestas) = 'object'),
  constraint sst_formatos_anulado check (estado <> 'anulado' or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
create index if not exists idx_sst_formatos on public.sst_formatos (plantilla_id, fecha desc);
create index if not exists idx_sst_formatos_proyecto on public.sst_formatos (proyecto_id, fecha desc);

-- Fotos y firmas de campos (las del cuerpo del formato). Son contenido: se congelan con la primera firma.
create table if not exists public.sst_formato_archivos (
  id uuid primary key default gen_random_uuid(),
  formato_id uuid not null references public.sst_formatos (id) on delete restrict,
  campo_id text not null,
  path text not null unique,              -- bucket sgsst: formatos/{formato_id}/...
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text,
  tomada_en timestamptz,
  lat numeric(9,6),
  lng numeric(9,6),
  subido_por uuid not null default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  check (path like 'formatos/' || formato_id::text || '/%')
);
create index if not exists idx_sst_archivos on public.sst_formato_archivos (formato_id, campo_id);

-- Las firmas de cierre: técnico(s), responsable SST de Servielectro, SST del cliente.
create table if not exists public.sst_formato_firmas (
  id uuid primary key default gen_random_uuid(),
  formato_id uuid not null references public.sst_formatos (id) on delete restrict,
  rol text not null check (rol in ('tecnico', 'responsable_sst', 'sst_cliente', 'otro')),
  nombre text not null check (length(trim(nombre)) > 0),
  documento text not null check (length(trim(documento)) > 0),   -- cédula
  cargo text,
  empresa text,
  imagen_path text not null unique,       -- bucket sgsst: formatos/{formato_id}/firma-{id}.png
  imagen_sha256 text not null check (imagen_sha256 ~ '^[0-9a-f]{64}$'),
  firmada_en_dispositivo timestamptz not null,   -- reloj del dispositivo (pudo ser sin señal)
  recibida_en timestamptz not null default now(), -- reloj del servidor
  registrada_por uuid not null default auth.uid() references public.perfiles (id),
  dispositivo text,                        -- navegador / equipo desde el que se firmó
  gps_estado text check (gps_estado in ('concedido', 'denegado', 'sin_senal', 'no_disponible')),
  lat numeric(9,6),
  lng numeric(9,6),
  hash_contenido text not null,            -- lo pone la base: el contenido que se firmó
  check (imagen_path like 'formatos/' || formato_id::text || '/firma-%')
);
create index if not exists idx_sst_firmas on public.sst_formato_firmas (formato_id, rol);

-- El contenido que se firma: plantilla (versión), datos generales, respuestas y el hash de cada archivo.
create or replace function public.fn_sst_hash_formato(p_formato_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'plantilla', f.plantilla_id,
    'proyecto', f.proyecto_id,
    'cliente', f.cliente_id,
    'lugar', f.lugar,
    'fecha', f.fecha,
    'respuestas', f.respuestas,
    'archivos', coalesce((select jsonb_agg(jsonb_build_array(a.campo_id, a.sha256) order by a.path)
                          from sst_formato_archivos a where a.formato_id = f.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')
  from sst_formatos f
  where f.id = p_formato_id
    and (fn_tiene_permiso('sgsst', 'consultar'));
$$;

/** true si lo guardado hoy es exactamente lo que se selló (y lo que firmó cada uno). */
create or replace function public.fn_sst_formato_integro(p_formato_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select f.hash_contenido is not null
     and f.hash_contenido = fn_sst_hash_formato(f.id)
     and not exists (select 1 from sst_formato_firmas x where x.formato_id = f.id and x.hash_contenido <> f.hash_contenido)
  from sst_formatos f
  where f.id = p_formato_id and fn_tiene_permiso('sgsst', 'consultar');
$$;

create or replace function public.fn_sst_formato_tiene_firmas(p_formato_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from sst_formato_firmas where formato_id = p_formato_id);
$$;

/** Campos obligatorios sin respuesta (las etiquetas), para decirlo antes de la primera firma. */
create or replace function public.fn_sst_faltantes(p_formato_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_campos jsonb;
  v_resp jsonb;
  c jsonb;
  v jsonb;
  falta text[] := '{}';
begin
  select p.campos, f.respuestas into v_campos, v_resp
  from sst_formatos f join sst_plantillas p on p.id = f.plantilla_id
  where f.id = p_formato_id;
  for c in select * from jsonb_array_elements(coalesce(v_campos, '[]'::jsonb)) loop
    if coalesce((c ->> 'obligatorio')::boolean, false) is not true or c ->> 'tipo' = 'seccion' then
      continue;
    end if;
    if c ->> 'tipo' in ('foto', 'firma') then
      if not exists (select 1 from sst_formato_archivos a where a.formato_id = p_formato_id and a.campo_id = c ->> 'id') then
        falta := falta || (c ->> 'etiqueta');
      end if;
      continue;
    end if;
    v := v_resp -> (c ->> 'id');
    if v is null or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and length(trim(v #>> '{}')) = 0)
       or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
      falta := falta || (c ->> 'etiqueta');
    end if;
  end loop;
  return falta;
end;
$$;

create or replace function public.fn_sst_formato_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_firmado boolean;
  v_falta text;
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Los formatos de SST no se borran: se anulan con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from sst_plantillas p where p.id = new.plantilla_id and p.estado = 'publicada') then
      raise exception 'Solo se llenan plantillas publicadas.';
    end if;
    new.estado := 'borrador';
    new.creado_por := auth.uid();
    new.creado_en := now();
    new.sellado_en := null; new.hash_contenido := null;
    new.aprobado_por := null; new.aprobado_en := null;
    new.anulado_por := null; new.anulado_en := null; new.motivo_anulacion := null;
    return new;
  end if;

  -- UPDATE
  if old.estado = 'anulado' then
    raise exception 'El formato está anulado: no cambia.';
  end if;
  if (new.creado_por, new.creado_en) is distinct from (old.creado_por, old.creado_en) then
    raise exception 'Quién y cuándo lo creó no se cambia.';
  end if;
  v_firmado := fn_sst_formato_tiene_firmas(old.id);
  if (new.plantilla_id, new.proyecto_id, new.cliente_id, new.lugar, new.fecha, new.respuestas)
     is distinct from (old.plantilla_id, old.proyecto_id, old.cliente_id, old.lugar, old.fecha, old.respuestas) then
    if v_firmado or old.estado <> 'borrador' then
      raise exception 'El formato ya tiene firmas: su contenido quedó sellado y no se edita.';
    end if;
    if old.plantilla_id is distinct from new.plantilla_id then
      raise exception 'La plantilla de un formato no se cambia.';
    end if;
    if old.creado_por <> auth.uid() and not fn_tiene_permiso('sgsst', 'responsable') then
      raise exception 'Solo quien lo creó edita el formato (o la gestión SST).';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if old.estado = 'borrador' and new.estado = 'firmado' then
      -- Cerrar: todas las firmas obligatorias de la plantilla.
      select string_agg(x ->> 'etiqueta', ', ') into v_falta
      from sst_plantillas p, jsonb_array_elements(p.firmas) x
      where p.id = old.plantilla_id
        and coalesce((x ->> 'obligatoria')::boolean, true)
        and not exists (select 1 from sst_formato_firmas s where s.formato_id = old.id and s.rol = x ->> 'rol');
      if v_falta is not null then
        raise exception 'Faltan firmas para cerrarlo: %.', v_falta;
      end if;
      new.sellado_en := now();
      new.hash_contenido := fn_sst_hash_formato(old.id);
    elsif old.estado = 'firmado' and new.estado = 'aprobado' then
      if not fn_tiene_permiso('sgsst', 'responsable') then
        raise exception 'Solo la gestión SST aprueba formatos.';
      end if;
      new.aprobado_por := auth.uid();
      new.aprobado_en := now();
    elsif new.estado = 'anulado' then
      if not fn_tiene_permiso('sgsst', 'responsable') then
        raise exception 'Solo la gestión SST anula formatos.';
      end if;
      if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
        raise exception 'Escribe por qué se anula el formato.';
      end if;
      new.anulado_por := auth.uid();
      new.anulado_en := now();
    else
      raise exception 'Un formato no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;
  if new.estado is not distinct from old.estado
     and (new.sellado_en, new.hash_contenido, new.aprobado_por, new.aprobado_en, new.anulado_por, new.anulado_en, new.motivo_anulacion)
         is distinct from (old.sellado_en, old.hash_contenido, old.aprobado_por, old.aprobado_en, old.anulado_por, old.anulado_en, old.motivo_anulacion) then
    raise exception 'El sello, la aprobación y la anulación los pone la base.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_formato_reglas on public.sst_formatos;
create trigger trg_sst_formato_reglas
  before insert or update or delete on public.sst_formatos
  for each row execute function public.fn_sst_formato_reglas();
drop trigger if exists trg_sst_formatos_updated_at on public.sst_formatos;
create trigger trg_sst_formatos_updated_at
  before update on public.sst_formatos
  for each row execute function extensions.moddatetime(updated_at);

create or replace function public.fn_sst_archivo_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Las fotos y firmas de un formato no se cambian ni se borran.';
  end if;
  if not exists (select 1 from sst_formatos f where f.id = new.formato_id and f.estado = 'borrador')
     or fn_sst_formato_tiene_firmas(new.formato_id) then
    raise exception 'El formato ya tiene firmas: su contenido quedó sellado y no recibe más fotos.';
  end if;
  new.subido_por := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists trg_sst_archivo_reglas on public.sst_formato_archivos;
create trigger trg_sst_archivo_reglas
  before insert or update or delete on public.sst_formato_archivos
  for each row execute function public.fn_sst_archivo_reglas();

create or replace function public.fn_sst_firma_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_falta text[];
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Una firma registrada no se cambia ni se borra.';
  end if;
  if not exists (select 1 from sst_formatos f where f.id = new.formato_id and f.estado = 'borrador') then
    raise exception 'El formato ya está cerrado: no recibe más firmas.';
  end if;
  -- Antes de la primera firma, todo lo obligatorio respondido: después ya no se puede editar.
  if not fn_sst_formato_tiene_firmas(new.formato_id) then
    v_falta := fn_sst_faltantes(new.formato_id);
    if array_length(v_falta, 1) > 0 then
      raise exception 'Antes de firmar falta llenar: %.', array_to_string(v_falta, ', ');
    end if;
  end if;
  if new.firmada_en_dispositivo > now() + interval '10 minutes' then
    raise exception 'La hora de la firma en el dispositivo está adelantada: revisa el reloj del celular.';
  end if;
  -- El registro lo pone la base, no el dispositivo.
  new.registrada_por := auth.uid();
  new.recibida_en := now();
  new.hash_contenido := fn_sst_hash_formato(new.formato_id);
  return new;
end;
$$;
drop trigger if exists trg_sst_firma_reglas on public.sst_formato_firmas;
create trigger trg_sst_firma_reglas
  before insert or update or delete on public.sst_formato_firmas
  for each row execute function public.fn_sst_firma_reglas();

-- ============================================================ 4) plan de trabajo (estructura, vacía)
create table if not exists public.sst_plan_items (
  id uuid primary key default gen_random_uuid(),
  estandar text not null check (length(trim(estandar)) > 0),     -- como lo escriban (código y nombre)
  descripcion text,
  responsable_id uuid references public.perfiles (id),
  fecha_limite date,
  avance int not null default 0 check (avance between 0 and 100),
  orden int not null default 0,
  creado_por uuid default auth.uid() references public.perfiles (id),
  creado_en timestamptz not null default now(),
  archivado_por uuid references public.perfiles (id),
  archivado_en timestamptz,
  motivo_archivo text,
  updated_at timestamptz not null default now(),
  constraint sst_plan_archivo check (archivado_en is null or length(trim(coalesce(motivo_archivo, ''))) > 0)
);
create index if not exists idx_sst_plan on public.sst_plan_items (orden, fecha_limite);

create table if not exists public.sst_plan_evidencias (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.sst_plan_items (id) on delete restrict,
  descripcion text not null check (length(trim(descripcion)) > 0),
  path text unique,                                   -- bucket sgsst: plan/{item_id}/...
  formato_id uuid references public.sst_formatos (id),  -- o un formato llenado que lo soporta
  subida_por uuid not null default auth.uid() references public.perfiles (id),
  subida_en timestamptz not null default now(),
  anulada_por uuid references public.perfiles (id),
  anulada_en timestamptz,
  motivo_anulacion text,
  check (path is not null or formato_id is not null),
  check (path is null or path like 'plan/' || item_id::text || '/%'),
  constraint sst_evidencia_anulada check (anulada_en is null or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
create index if not exists idx_sst_evidencias on public.sst_plan_evidencias (item_id);

create or replace function public.fn_sst_plan_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'El plan de trabajo no se borra: se archiva con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
    new.archivado_por := null; new.archivado_en := null; new.motivo_archivo := null;
    return new;
  end if;
  if old.archivado_en is not null then
    raise exception 'El ítem está archivado: no cambia.';
  end if;
  if (new.creado_por, new.creado_en) is distinct from (old.creado_por, old.creado_en) then
    raise exception 'Quién y cuándo lo creó no se cambia.';
  end if;
  -- Estándar, responsable y fecha límite los fija la gestión; el avance lo carga también el SST.
  if (new.estandar, new.descripcion, new.responsable_id, new.fecha_limite, new.orden)
     is distinct from (old.estandar, old.descripcion, old.responsable_id, old.fecha_limite, old.orden)
     and not fn_tiene_permiso('sgsst', 'responsable') then
    raise exception 'El estándar, el responsable y la fecha límite los cambia la gestión SST.';
  end if;
  if new.archivado_en is not null and old.archivado_en is null then
    if not fn_tiene_permiso('sgsst', 'responsable') then
      raise exception 'Solo la gestión SST archiva ítems del plan.';
    end if;
    if length(trim(coalesce(new.motivo_archivo, ''))) = 0 then
      raise exception 'Escribe por qué se archiva.';
    end if;
    new.archivado_por := auth.uid();
    new.archivado_en := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_plan_reglas on public.sst_plan_items;
create trigger trg_sst_plan_reglas
  before insert or update or delete on public.sst_plan_items
  for each row execute function public.fn_sst_plan_reglas();
drop trigger if exists trg_sst_plan_updated_at on public.sst_plan_items;
create trigger trg_sst_plan_updated_at
  before update on public.sst_plan_items
  for each row execute function extensions.moddatetime(updated_at);

create or replace function public.fn_sst_evidencia_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('postgres', 'supabase_admin') then return old; end if;
    raise exception 'Las evidencias no se borran: se anulan con motivo.';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from sst_plan_items i where i.id = new.item_id and i.archivado_en is not null) then
      raise exception 'El ítem está archivado: no recibe evidencias.';
    end if;
    new.subida_por := auth.uid();
    new.subida_en := now();
    new.anulada_por := null; new.anulada_en := null; new.motivo_anulacion := null;
    return new;
  end if;
  if old.anulada_en is not null then
    raise exception 'La evidencia está anulada: no cambia.';
  end if;
  if (to_jsonb(new) - array['anulada_por', 'anulada_en', 'motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['anulada_por', 'anulada_en', 'motivo_anulacion']) then
    raise exception 'Una evidencia no se edita: se anula y se sube otra.';
  end if;
  if new.anulada_en is null and old.anulada_en is null and new.motivo_anulacion is not null then
    new.anulada_en := now();
  end if;
  if new.anulada_en is not null then
    if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
      raise exception 'Escribe por qué se anula la evidencia.';
    end if;
    new.anulada_por := auth.uid();
    new.anulada_en := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sst_evidencia_reglas on public.sst_plan_evidencias;
create trigger trg_sst_evidencia_reglas
  before insert or update or delete on public.sst_plan_evidencias
  for each row execute function public.fn_sst_evidencia_reglas();

-- ============================================================ 5) RLS
alter table public.sst_plantillas enable row level security;
alter table public.sst_formatos enable row level security;
alter table public.sst_formato_archivos enable row level security;
alter table public.sst_formato_firmas enable row level security;
alter table public.sst_plan_items enable row level security;
alter table public.sst_plan_evidencias enable row level security;
revoke all on table public.sst_plantillas, public.sst_formatos, public.sst_formato_archivos, public.sst_formato_firmas,
  public.sst_plan_items, public.sst_plan_evidencias from anon;

do $$
declare t text;
begin
  foreach t in array array['sst_plantillas', 'sst_formatos', 'sst_formato_archivos', 'sst_formato_firmas', 'sst_plan_items', 'sst_plan_evidencias'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (fn_tiene_permiso(''sgsst'', ''consultar''))', t || '_select', t);
  end loop;
end $$;

-- Plantillas: solo la gestión.
drop policy if exists sst_plantillas_insert on public.sst_plantillas;
create policy sst_plantillas_insert on public.sst_plantillas for insert to authenticated with check (fn_tiene_permiso('sgsst', 'responsable'));
drop policy if exists sst_plantillas_update on public.sst_plantillas;
create policy sst_plantillas_update on public.sst_plantillas for update to authenticated
  using (fn_tiene_permiso('sgsst', 'responsable')) with check (fn_tiene_permiso('sgsst', 'responsable'));

-- Formatos, fotos, firmas, plan y evidencias: SST en obra ("trabajar") y la gestión.
drop policy if exists sst_formatos_insert on public.sst_formatos;
create policy sst_formatos_insert on public.sst_formatos for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_formatos_update on public.sst_formatos;
create policy sst_formatos_update on public.sst_formatos for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_formato_archivos_insert on public.sst_formato_archivos;
create policy sst_formato_archivos_insert on public.sst_formato_archivos for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_formato_firmas_insert on public.sst_formato_firmas;
create policy sst_formato_firmas_insert on public.sst_formato_firmas for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_plan_items_insert on public.sst_plan_items;
create policy sst_plan_items_insert on public.sst_plan_items for insert to authenticated with check (fn_tiene_permiso('sgsst', 'responsable'));
drop policy if exists sst_plan_items_update on public.sst_plan_items;
create policy sst_plan_items_update on public.sst_plan_items for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_plan_evidencias_insert on public.sst_plan_evidencias;
create policy sst_plan_evidencias_insert on public.sst_plan_evidencias for insert to authenticated with check (fn_tiene_permiso('sgsst', 'trabajar'));
drop policy if exists sst_plan_evidencias_update on public.sst_plan_evidencias;
create policy sst_plan_evidencias_update on public.sst_plan_evidencias for update to authenticated
  using (fn_tiene_permiso('sgsst', 'trabajar')) with check (fn_tiene_permiso('sgsst', 'trabajar'));
-- Sin políticas de delete en ninguna: nada se borra.

-- ============================================================ 6) archivos (bucket privado sgsst)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sgsst', 'sgsst', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- formatos/{formato_id}/...: solo mientras el formato esté en borrador (la firma de cierre también va ahí).
-- plan/{item_id}/...: mientras el ítem no esté archivado.
create or replace function public.fn_sst_archivo_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('sgsst', 'trabajar') and case (storage.foldername(p_nombre))[1]
    when 'formatos' then exists (select 1 from sst_formatos f where f.id::text = (storage.foldername(p_nombre))[2] and f.estado = 'borrador')
    when 'plan' then exists (select 1 from sst_plan_items i where i.id::text = (storage.foldername(p_nombre))[2] and i.archivado_en is null)
    else false
  end;
$$;
drop policy if exists sgsst_archivos_select on storage.objects;
create policy sgsst_archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'sgsst' and fn_tiene_permiso('sgsst', 'consultar'));
drop policy if exists sgsst_archivos_insert on storage.objects;
create policy sgsst_archivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sgsst' and fn_sst_archivo_subible(name));
-- Sin reemplazar ni borrar.

-- ============================================================ 7) privilegios
revoke all on function public.fn_sst_plantilla_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_formato_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_archivo_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_firma_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_plan_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_evidencia_reglas() from public, anon, authenticated;
revoke all on function public.fn_sst_campos_problema(jsonb, jsonb) from public, anon;
grant execute on function public.fn_sst_campos_problema(jsonb, jsonb) to authenticated, service_role;
revoke all on function public.fn_sst_hash_formato(uuid) from public, anon;
grant execute on function public.fn_sst_hash_formato(uuid) to authenticated, service_role;
revoke all on function public.fn_sst_formato_integro(uuid) from public, anon;
grant execute on function public.fn_sst_formato_integro(uuid) to authenticated, service_role;
revoke all on function public.fn_sst_formato_tiene_firmas(uuid) from public, anon;
grant execute on function public.fn_sst_formato_tiene_firmas(uuid) to authenticated, service_role;
revoke all on function public.fn_sst_faltantes(uuid) from public, anon;
grant execute on function public.fn_sst_faltantes(uuid) to authenticated, service_role;
revoke all on function public.fn_sst_archivo_subible(text) from public, anon;
grant execute on function public.fn_sst_archivo_subible(text) to authenticated, service_role;

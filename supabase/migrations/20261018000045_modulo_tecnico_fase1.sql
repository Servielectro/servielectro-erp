-- Módulo Técnico, FASE 1: visitas, jornadas, fotos, firmas, notas posteriores y
-- sugerencias del técnico con su historial. Reemplaza a Auvo/2Workers (vence feb 2027).
--
-- Escrita sobre el ESTADO REAL consultado el 2026-10-18 (estado_previo_tecnico.sql):
--   - módulos tecnico (app de campo) y operativo (supervisión) YA existen, separados;
--   - rol "Técnicos" YA existe (tecnico/trabajar, sin sensibles, 0 usuarios): no se crea;
--   - fn_tiene_permiso / fn_ve_datos_sensibles / fn_mis_permisos son security definer;
--   - perfiles NO tiene cédula ni teléfono: se agregan (la firma del técnico se precarga
--     de su perfil, no se escribe a mano cada día);
--   - espacio: base 14 MB, Storage ~5 MB. Supabase es solo el amortiguador de fotos: un
--     proceso aparte (fase posterior) las pasa a Google Drive y las borra de acá.
--
-- QUIÉN VE Y ESCRIBE (por fila, por primera vez en el ERP):
--   - técnico (tecnico/trabajar): SOLO las visitas asignadas a él;
--   - operativo/consultar: ve todas; operativo/trabajar: crea, asigna y edita;
--     operativo/responsable: borra (y solo si nadie firmó);
--   - sugerencias: además las ve el comercial (comercial/consultar) y las toma, cotiza o
--     descarta (comercial/trabajar) por fn_cambiar_estado_sugerencia, que deja el rastro.
--
-- SIN SEÑAL: los ids los genera el celular (uuid), así un reintento de la cola no
-- duplica (insert ... on conflict do nothing).
--
-- EVIDENCIA: cuando firma el cliente, la visita queda cerrada EN LA BASE. Un candado
-- rechaza cambiar o borrar jornadas, fotos, sugerencias (su contenido) y la visita.
-- Firmas y notas posteriores no se editan ni se borran nunca (sin políticas de update/
-- delete). Lo que sí sigue cambiando después de firmar: el estado de las sugerencias
-- (por la función, con historial) y los datos de traslado a Drive de las fotos.
--
-- Verificación: supabase/verificaciones/20261018000045_verificar.sql
-- Rollback:     supabase/rollbacks/20261018000045_modulo_tecnico_fase1_down.sql
-- Idempotente.

-- ============================================================ 0) perfiles: cédula y teléfono
alter table public.perfiles add column if not exists cedula text;
alter table public.perfiles add column if not exists telefono text;

-- Jhojan no se queda por fuera: el rol Administrador es responsable (con sensibles) en
-- tecnico y operativo, si todavía no tiene fila para esos módulos.
insert into public.permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, m.modulo, 'responsable', true
from public.roles r
cross join (values ('tecnico'), ('operativo')) as m(modulo)
where r.nombre = 'Administrador'
  and not exists (
    select 1 from public.permisos_rol pr where pr.rol_id = r.id and pr.modulo_id = m.modulo
  );

-- ============================================================ 1) tablas
create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id),
  titulo text not null check (length(trim(titulo)) > 0),
  descripcion_trabajo text,           -- qué hay que hacer (lo escribe quien asigna)
  direccion text,
  tipo text not null default 'visita' check (tipo in ('visita', 'obra')),
  estado text not null default 'programada'
    check (estado in ('programada', 'en_curso', 'firmada', 'cerrada', 'cancelada')),
  tecnico_id uuid references public.perfiles (id),
  fecha_programada date,
  fecha_fin_estimada date,            -- obras largas
  firmada_en timestamptz,
  creada_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_visitas_tecnico on public.visitas (tecnico_id, fecha_programada);
create index if not exists idx_visitas_cliente on public.visitas (cliente_id);

-- Una por día de trabajo: la visita simple tiene una; la obra de 15 días, quince.
create table if not exists public.visita_jornadas (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visitas (id) on delete restrict,
  tecnico_id uuid references public.perfiles (id) default auth.uid(),
  fecha date not null default ((now() at time zone 'America/Bogota')::date),
  check_in_en timestamptz,
  check_in_gps_estado text check (check_in_gps_estado in ('concedido', 'denegado', 'sin_senal', 'no_disponible')),
  check_in_lat numeric(9,6),
  check_in_lng numeric(9,6),
  check_in_precision_m numeric(8,1),
  check_out_en timestamptz,
  check_out_gps_estado text check (check_out_gps_estado in ('concedido', 'denegado', 'sin_senal', 'no_disponible')),
  check_out_lat numeric(9,6),
  check_out_lng numeric(9,6),
  check_out_precision_m numeric(8,1),
  labor_ejecutada text,
  no_ejecutado text,
  pendiente text,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_jornadas_visita on public.visita_jornadas (visita_id, fecha);

create table if not exists public.visita_fotos (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visitas (id) on delete restrict,
  jornada_id uuid references public.visita_jornadas (id) on delete restrict,
  storage_path text not null,         -- bucket visitas: {visita_id}/{foto_id}.jpg
  tomada_en timestamptz,
  bytes integer check (bytes is null or bytes > 0),
  sha256 text,                        -- huella del archivo tal como se subió (evidencia)
  nota text,
  -- Traslado a Google Drive (fase posterior). No es contenido: cambia después de firmar.
  estado_archivo text not null default 'supabase'
    check (estado_archivo in ('supabase', 'subiendo_drive', 'drive', 'error_drive')),
  drive_file_id text,
  drive_url text,
  drive_md5 text,
  movida_en timestamptz,
  intentos integer not null default 0,
  ultimo_error text,
  subida_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fotos_visita on public.visita_fotos (visita_id, tomada_en);
create index if not exists idx_fotos_pendientes_drive on public.visita_fotos (estado_archivo)
  where estado_archivo <> 'drive';

create table if not exists public.visita_firmas (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visitas (id) on delete restrict,
  tipo text not null check (tipo in ('tecnico', 'cliente')),
  nombre text not null check (length(trim(nombre)) > 0),
  cedula text not null check (length(trim(cedula)) > 0),
  cargo text,
  imagen_path text not null,          -- bucket visitas: {visita_id}/firma-{tipo}.png
  firmada_en timestamptz not null default now(),
  gps_estado text check (gps_estado in ('concedido', 'denegado', 'sin_senal', 'no_disponible')),
  lat numeric(9,6),
  lng numeric(9,6),
  hash_contenido text,                -- SHA-256 del contenido de la visita al firmar
  registrada_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (visita_id, tipo)
);

create table if not exists public.visita_notas_posteriores (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visitas (id) on delete restrict,
  texto text not null check (length(trim(texto)) > 0),
  autor uuid default auth.uid(),
  autor_nombre text,
  created_at timestamptz not null default now()
);

create table if not exists public.visita_sugerencias (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visitas (id) on delete restrict,
  jornada_id uuid references public.visita_jornadas (id) on delete restrict,
  item_catalogo_id uuid references public.items_catalogo (id),  -- si lo eligió del catálogo
  descripcion text not null check (length(trim(descripcion)) > 0),
  cantidad numeric(14,4) check (cantidad is null or cantidad > 0),
  unidad text,
  motivo text,                        -- por qué lo sugiere
  sugerida_por uuid default auth.uid(),
  sugerida_en timestamptz not null default now(),
  -- Recorrido (lo cambia solo fn_cambiar_estado_sugerencia):
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_revision', 'cotizada', 'descartada')),
  tomada_por uuid,
  cotizacion_id uuid references public.cotizaciones (id),
  motivo_descarte text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_sugerencias_estado on public.visita_sugerencias (estado, sugerida_en);
create index if not exists idx_sugerencias_visita on public.visita_sugerencias (visita_id);

-- Historial: una fila por cada cambio de estado. Solo se agregan filas.
create table if not exists public.sugerencia_eventos (
  id uuid primary key default gen_random_uuid(),
  sugerencia_id uuid not null references public.visita_sugerencias (id) on delete restrict,
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  cotizacion_id uuid,
  actor uuid default auth.uid(),
  actor_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_sugerencia_eventos on public.sugerencia_eventos (sugerencia_id, creado_en);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['visitas', 'visita_jornadas', 'visita_fotos', 'visita_sugerencias'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function extensions.moddatetime(updated_at)',
      t, t);
  end loop;
end $$;

-- ============================================================ 2) funciones de acceso
-- security definer: leen visitas sin pasar por su propia RLS (evita recursión).
create or replace function public.fn_puede_ver_visita(p_visita_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('operativo', 'consultar')
      or (fn_tiene_permiso('tecnico', 'trabajar')
          and exists (select 1 from visitas v where v.id = p_visita_id and v.tecnico_id = auth.uid()));
$$;

create or replace function public.fn_puede_escribir_visita(p_visita_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('operativo', 'trabajar')
      or (fn_tiene_permiso('tecnico', 'trabajar')
          and exists (select 1 from visitas v where v.id = p_visita_id and v.tecnico_id = auth.uid()));
$$;

-- ¿Ya firmó el cliente? (el candado)
create or replace function public.fn_visita_firmada(p_visita_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from visita_firmas f where f.visita_id = p_visita_id and f.tipo = 'cliente');
$$;

-- Visita dueña de un archivo del bucket visitas ({visita_id}/...). Null si la ruta no
-- empieza con un uuid (en vez de reventar la política con un error de conversión).
create or replace function public.fn_visita_de_ruta(p_nombre text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return split_part(p_nombre, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

-- ============================================================ 3) candado de evidencia
-- El SQL Editor (postgres) queda fuera del candado: es el administrador de la base, que
-- igual podría desactivar triggers. Las funciones security definer de este archivo no
-- tocan contenido protegido.
create or replace function public.fn_candado_visita()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Por jsonb: visitas no tiene columna visita_id y plpgsql fallaría al resolver old.visita_id.
  v_visita uuid := case when tg_table_name = 'visitas' then old.id
                        else (to_jsonb(old) ->> 'visita_id')::uuid end;
begin
  if current_user in ('postgres', 'supabase_admin') or not fn_visita_firmada(v_visita) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'La visita ya está firmada por el cliente: no se puede borrar. Agrega una nota posterior.';
  end if;

  -- Lo único que puede cambiar después de firmar:
  if tg_table_name = 'visitas' then
    if (to_jsonb(new) - array['estado', 'firmada_en', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado', 'firmada_en', 'updated_at']) then
      raise exception 'La visita ya está firmada por el cliente: no se edita. Agrega una nota posterior.';
    end if;
  elsif tg_table_name = 'visita_fotos' then
    if (to_jsonb(new) - array['estado_archivo', 'drive_file_id', 'drive_url', 'drive_md5', 'movida_en', 'intentos', 'ultimo_error', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado_archivo', 'drive_file_id', 'drive_url', 'drive_md5', 'movida_en', 'intentos', 'ultimo_error', 'updated_at']) then
      raise exception 'La visita ya está firmada por el cliente: las fotos no se cambian.';
    end if;
  elsif tg_table_name = 'visita_sugerencias' then
    if (to_jsonb(new) - array['estado', 'tomada_por', 'cotizacion_id', 'motivo_descarte', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado', 'tomada_por', 'cotizacion_id', 'motivo_descarte', 'updated_at']) then
      raise exception 'La visita ya está firmada por el cliente: la sugerencia no se edita (su estado sí se puede seguir).';
    end if;
  else  -- visita_jornadas
    raise exception 'La visita ya está firmada por el cliente: la jornada no se edita. Agrega una nota posterior.';
  end if;
  return new;
end;
$$;

-- Nada nuevo en una visita firmada (jornadas, fotos, sugerencias).
create or replace function public.fn_candado_visita_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') and fn_visita_firmada(new.visita_id) then
    raise exception 'La visita ya está firmada por el cliente: no se agrega nada. Usa una nota posterior.';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['visitas', 'visita_jornadas', 'visita_fotos', 'visita_sugerencias'] loop
    execute format('drop trigger if exists trg_%s_candado on public.%I', t, t);
    execute format(
      'create trigger trg_%s_candado before update or delete on public.%I for each row execute function public.fn_candado_visita()',
      t, t);
  end loop;
  foreach t in array array['visita_jornadas', 'visita_fotos', 'visita_sugerencias'] loop
    execute format('drop trigger if exists trg_%s_candado_insert on public.%I', t, t);
    execute format(
      'create trigger trg_%s_candado_insert before insert on public.%I for each row execute function public.fn_candado_visita_insert()',
      t, t);
  end loop;
end $$;

-- El técnico asignado (sin operativo/trabajar) solo cambia el ESTADO de su visita
-- (programada → en_curso). Asignar, reprogramar o cambiar el trabajo es de Operativo.
create or replace function public.fn_visitas_solo_estado_tecnico()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') or fn_tiene_permiso('operativo', 'trabajar') then
    return new;
  end if;
  if (to_jsonb(new) - array['estado', 'updated_at']) is distinct from (to_jsonb(old) - array['estado', 'updated_at']) then
    raise exception 'Solo Operativo puede cambiar los datos de la visita; el técnico solo su estado.';
  end if;
  if new.estado not in ('programada', 'en_curso') then
    raise exception 'El técnico solo puede marcar la visita en curso; firmarla la cierra.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_visitas_solo_estado_tecnico on public.visitas;
create trigger trg_visitas_solo_estado_tecnico
  before update on public.visitas
  for each row execute function public.fn_visitas_solo_estado_tecnico();

-- ============================================================ 4) firmas
-- Primero el técnico, después el cliente. Al firmar el cliente, la visita pasa a firmada.
create or replace function public.fn_firma_antes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tipo = 'cliente'
     and not exists (select 1 from visita_firmas f where f.visita_id = new.visita_id and f.tipo = 'tecnico') then
    raise exception 'Primero firma el técnico, después el cliente.';
  end if;
  return new;
end;
$$;

create or replace function public.fn_firma_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'cliente' then
    update visitas set estado = 'firmada', firmada_en = new.firmada_en where id = new.visita_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_firma_antes on public.visita_firmas;
create trigger trg_firma_antes before insert on public.visita_firmas
  for each row execute function public.fn_firma_antes();
drop trigger if exists trg_firma_despues on public.visita_firmas;
create trigger trg_firma_despues after insert on public.visita_firmas
  for each row execute function public.fn_firma_despues();

-- ============================================================ 5) sugerencias: recorrido
-- El estado no se cambia con un update directo: solo por fn_cambiar_estado_sugerencia
-- (security definer, corre como postgres), que valida la transición, exige motivo al
-- descartar y deja la fila en sugerencia_eventos.
create or replace function public.fn_sugerencias_estado_protegido()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin')
     and (new.estado, new.tomada_por, new.cotizacion_id, new.motivo_descarte)
         is distinct from (old.estado, old.tomada_por, old.cotizacion_id, old.motivo_descarte) then
    raise exception 'El estado de una sugerencia se cambia desde la bandeja (queda en el historial).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sugerencias_estado_protegido on public.visita_sugerencias;
create trigger trg_sugerencias_estado_protegido before update on public.visita_sugerencias
  for each row execute function public.fn_sugerencias_estado_protegido();

-- Al crearse, el historial arranca con "pendiente".
create or replace function public.fn_sugerencia_creada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into sugerencia_eventos (sugerencia_id, estado_anterior, estado_nuevo, comentario, actor, actor_nombre)
  values (new.id, null, new.estado, 'Sugerida en la visita', new.sugerida_por,
          (select nombre from perfiles where id = new.sugerida_por));
  return null;
end;
$$;

drop trigger if exists trg_sugerencia_creada on public.visita_sugerencias;
create trigger trg_sugerencia_creada after insert on public.visita_sugerencias
  for each row execute function public.fn_sugerencia_creada();

create or replace function public.fn_cambiar_estado_sugerencia(
  p_sugerencia_id uuid,
  p_estado text,
  p_comentario text default null,
  p_cotizacion_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s visita_sugerencias;
begin
  select * into s from visita_sugerencias where id = p_sugerencia_id for update;
  if not found then
    raise exception 'La sugerencia no existe.';
  end if;

  -- Quién: tomar y cotizar es del comercial; descartar, del comercial o del supervisor.
  if p_estado in ('en_revision', 'cotizada') and not fn_tiene_permiso('comercial', 'trabajar') then
    raise exception 'Tomar o cotizar una sugerencia requiere permiso de Comercial.';
  end if;
  if p_estado = 'descartada'
     and not (fn_tiene_permiso('comercial', 'trabajar') or fn_tiene_permiso('operativo', 'trabajar')) then
    raise exception 'Descartar una sugerencia requiere permiso de Comercial u Operativo.';
  end if;
  if p_estado = 'pendiente' and not (fn_tiene_permiso('comercial', 'trabajar') or fn_tiene_permiso('operativo', 'trabajar')) then
    raise exception 'Devolver una sugerencia a pendiente requiere permiso de Comercial u Operativo.';
  end if;

  -- Transiciones válidas.
  if not (
       (s.estado = 'pendiente'   and p_estado in ('en_revision', 'cotizada', 'descartada'))
    or (s.estado = 'en_revision' and p_estado in ('pendiente', 'cotizada', 'descartada'))
    or (s.estado = 'descartada'  and p_estado = 'pendiente')
  ) then
    raise exception 'No se puede pasar de % a %.', s.estado, p_estado;
  end if;
  if p_estado = 'descartada' and coalesce(trim(p_comentario), '') = '' then
    raise exception 'Escribe por qué se descarta: queda en el historial.';
  end if;
  if p_estado = 'cotizada' and p_cotizacion_id is null then
    raise exception 'Para marcarla cotizada hay que indicar la cotización.';
  end if;

  update visita_sugerencias set
    estado = p_estado,
    tomada_por = case when p_estado in ('en_revision', 'cotizada') then coalesce(tomada_por, auth.uid())
                      when p_estado = 'pendiente' then null else tomada_por end,
    cotizacion_id = case when p_estado = 'cotizada' then p_cotizacion_id
                         when p_estado = 'pendiente' then null else cotizacion_id end,
    motivo_descarte = case when p_estado = 'descartada' then trim(p_comentario)
                           when p_estado = 'pendiente' then null else motivo_descarte end
  where id = p_sugerencia_id;

  insert into sugerencia_eventos (sugerencia_id, estado_anterior, estado_nuevo, comentario, cotizacion_id, actor, actor_nombre)
  values (p_sugerencia_id, s.estado, p_estado, nullif(trim(coalesce(p_comentario, '')), ''),
          p_cotizacion_id, auth.uid(), (select nombre from perfiles where id = auth.uid()));

  return p_estado;
end;
$$;

-- ============================================================ 6) privilegios y RLS
do $$
declare
  t text;
  r record;
  tablas text[] := array['visitas', 'visita_jornadas', 'visita_fotos', 'visita_firmas',
                         'visita_notas_posteriores', 'visita_sugerencias', 'sugerencia_eventos'];
begin
  foreach t in array tablas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references on table public.%I from authenticated', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- visitas
create policy visitas_select on public.visitas for select to authenticated
  using (fn_tiene_permiso('operativo', 'consultar')
         or (fn_tiene_permiso('tecnico', 'trabajar') and tecnico_id = auth.uid()));
create policy visitas_insert on public.visitas for insert to authenticated
  with check (fn_tiene_permiso('operativo', 'trabajar'));
create policy visitas_update on public.visitas for update to authenticated
  using (fn_tiene_permiso('operativo', 'trabajar')
         or (fn_tiene_permiso('tecnico', 'trabajar') and tecnico_id = auth.uid()))
  with check (fn_tiene_permiso('operativo', 'trabajar')
              or (fn_tiene_permiso('tecnico', 'trabajar') and tecnico_id = auth.uid()));
create policy visitas_delete on public.visitas for delete to authenticated
  using (fn_tiene_permiso('operativo', 'responsable'));

-- jornadas, fotos, sugerencias: lo del técnico asignado o de Operativo
do $$
declare t text;
begin
  foreach t in array array['visita_jornadas', 'visita_fotos', 'visita_sugerencias'] loop
    execute format('create policy %I on public.%I for select to authenticated using (fn_puede_ver_visita(visita_id)%s)',
      t || '_select', t,
      case when t = 'visita_sugerencias' then ' or fn_tiene_permiso(''comercial'', ''consultar'')' else '' end);
    execute format('create policy %I on public.%I for insert to authenticated with check (fn_puede_escribir_visita(visita_id))',
      t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (fn_puede_escribir_visita(visita_id)) with check (fn_puede_escribir_visita(visita_id))',
      t || '_update', t);
    -- Borrar: solo Operativo responsable y antes de la firma (candado). Las sugerencias
    -- no se borran nunca: se descartan con motivo, para que quede el rastro.
    if t <> 'visita_sugerencias' then
      execute format('create policy %I on public.%I for delete to authenticated using (fn_tiene_permiso(''operativo'', ''responsable''))',
        t || '_delete', t);
    end if;
  end loop;
end $$;

-- firmas y notas posteriores: se agregan y se leen; nunca se editan ni se borran
create policy visita_firmas_select on public.visita_firmas for select to authenticated
  using (fn_puede_ver_visita(visita_id));
create policy visita_firmas_insert on public.visita_firmas for insert to authenticated
  with check (fn_puede_escribir_visita(visita_id));
create policy visita_notas_posteriores_select on public.visita_notas_posteriores for select to authenticated
  using (fn_puede_ver_visita(visita_id));
create policy visita_notas_posteriores_insert on public.visita_notas_posteriores for insert to authenticated
  with check (fn_puede_escribir_visita(visita_id));

-- historial de sugerencias: solo lectura (lo escriben las funciones)
create policy sugerencia_eventos_select on public.sugerencia_eventos for select to authenticated
  using (exists (
    select 1 from visita_sugerencias s
    where s.id = sugerencia_id
      and (fn_puede_ver_visita(s.visita_id) or fn_tiene_permiso('comercial', 'consultar'))
  ));

revoke all on function public.fn_cambiar_estado_sugerencia(uuid, text, text, uuid) from public, anon;
grant execute on function public.fn_cambiar_estado_sugerencia(uuid, text, text, uuid) to authenticated;

-- ============================================================ 7) Storage: bucket visitas
-- Fotos ya comprimidas en el celular (~200 KB) y firmas. Tope 5 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visitas', 'visitas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%''visitas''%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Leer y subir: quien puede ver / escribir esa visita. Sin update ni delete: lo que se
-- subió no se pisa; el traslado a Drive borra con la clave de servicio del servidor.
create policy visitas_archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'visitas' and fn_puede_ver_visita(fn_visita_de_ruta(name)));
create policy visitas_archivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'visitas'
              and fn_puede_escribir_visita(fn_visita_de_ruta(name))
              and not fn_visita_firmada(fn_visita_de_ruta(name)));

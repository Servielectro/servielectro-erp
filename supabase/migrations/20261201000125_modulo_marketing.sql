-- Módulo de Marketing, fase 1: calendario de ideas, campañas, biblioteca y reportes (2026-10-30).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- Jhojan pidió formalizar Marketing con "un agente conectado para crear contenido diario a través
-- de un calendario de ideas", con carruseles, videos, campañas, reportes y conexión de Instagram,
-- Facebook y LinkedIn. Aprobó el plan en tres fases y la cadencia de 3 por semana con LinkedIn
-- primero.
--
-- ESTA ES LA FASE 1 Y NO DEPENDE DE NADIE: ni de la API de Gemini, ni de la revisión de Meta, ni
-- de n8n. Se puede usar desde el primer día publicando a mano. Las fases 2 (generar arte con
-- Nano Banana por la API) y 3 (publicar automático) se enchufan encima sin cambiar este modelo:
-- por eso `marketing_piezas` ya guarda el prompt y el generador, y `marketing_publicaciones` ya
-- guarda el id externo del post.
--
-- ------------------------------------------------------------------ la idea de fondo
-- El calendario NO arranca en una hoja en blanco. La ventaja de Servielectro frente a su
-- competencia no es generar imágenes con IA —eso lo hace cualquiera— sino que hace trabajo real
-- que nadie más puede mostrar: visitas con fotos, obras entregadas, actas firmadas, técnicos
-- certificados. Todo eso ya entra al ERP solo.
--
-- Por eso una idea puede colgar de un proyecto, de una visita o de un formato (`origen_*`), y la
-- vista `v_marketing_oportunidades` propone de dónde sacar contenido esta semana leyendo la
-- operación. Una idea sin origen también vale (campañas, fechas, anuncios).
--
-- ------------------------------------------------------------------ EL CANDADO QUE MÁS IMPORTA
-- Publicar la instalación de seguridad de un cliente LO EXPONE. Mostrar dónde quedaron las cámaras
-- de una copropiedad es, literalmente, información útil para quien quiera entrar a robar. Y el
-- cliente casi nunca dio permiso para salir en redes.
--
-- Por eso `marketing_biblioteca` tiene `autorizacion` e `identificable`, y una idea NO puede pasar
-- a 'aprobada' si usa material identificable sin autorización concedida. Lo fuerza un trigger, no
-- la buena memoria de quien publica. Es la clase de error que no se puede deshacer: una vez
-- publicado, ya lo vio quien lo tenía que ver.

-- ============================================================ 1) cuentas conectadas
create table if not exists public.marketing_cuentas (
  id          uuid primary key default gen_random_uuid(),
  canal       text not null check (canal in ('linkedin', 'instagram', 'facebook', 'youtube', 'tiktok', 'otro')),
  nombre      text not null check (length(trim(nombre)) > 0),
  handle      text,
  url         text,
  -- 'manual' = todavía se publica copiando y pegando (fase 1). 'conectada' = ya publica la API.
  estado      text not null default 'manual' check (estado in ('manual', 'en_tramite', 'conectada', 'suspendida')),
  externo_id  text,
  notas       text,
  activa      boolean not null default true,
  creado_por  uuid default auth.uid() references public.perfiles (id),
  creado_en   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (canal, nombre)
);

-- ============================================================ 2) campañas
create table if not exists public.marketing_campanas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(trim(nombre)) > 0),
  objetivo      text,
  publico       text,
  canales       text[] not null default '{}',
  fecha_inicio  date,
  fecha_fin     date,
  estado        text not null default 'borrador' check (estado in ('borrador', 'activa', 'pausada', 'terminada')),
  notas         text,
  creado_por    uuid default auth.uid() references public.perfiles (id),
  creado_en     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint marketing_campanas_fechas check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)
);

-- ============================================================ 3) biblioteca de material
-- Aquí entran las fotos de proyectos propios que va a subir Jhojan, y las que ya vivan en el ERP.
create table if not exists public.marketing_biblioteca (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null default 'foto' check (tipo in ('foto', 'video', 'logo', 'plantilla', 'otro')),
  titulo         text not null check (length(trim(titulo)) > 0),
  descripcion    text,
  path           text unique,
  bytes          bigint check (bytes is null or bytes > 0),
  sha256         text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  -- De dónde salió, si salió de la operación.
  cliente_id     uuid references public.clientes (id),
  proyecto_id    uuid references public.proyectos (id),
  visita_id      uuid references public.visitas (id),
  visita_foto_id uuid references public.visita_fotos (id),
  etiquetas      text[] not null default '{}',
  tomada_en      date,
  -- ¿Se reconoce de quién es la obra? (fachada, nombre del conjunto, placa, uniforme con logo ajeno)
  identificable  boolean not null default true,
  autorizacion   text not null default 'pendiente'
                 check (autorizacion in ('pendiente', 'concedida', 'negada', 'no_aplica')),
  autorizacion_nota text,
  autorizada_por uuid references public.perfiles (id),
  autorizada_en  timestamptz,
  subido_por     uuid default auth.uid() references public.perfiles (id),
  subido_en      timestamptz not null default now(),
  archivada      boolean not null default false,
  updated_at     timestamptz not null default now(),
  -- Conceder o negar deja rastro de quién y cuándo.
  constraint marketing_biblioteca_autorizacion check (
    autorizacion in ('pendiente', 'no_aplica') or (autorizada_por is not null and autorizada_en is not null))
);
create index if not exists idx_marketing_biblioteca on public.marketing_biblioteca (tipo, autorizacion) where not archivada;
create index if not exists idx_marketing_biblioteca_cliente on public.marketing_biblioteca (cliente_id) where cliente_id is not null;

-- ============================================================ 4) el calendario de ideas
create table if not exists public.marketing_ideas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (length(trim(titulo)) > 0),
  tipo           text not null check (tipo in ('carrusel', 'video', 'post', 'caso_obra', 'historia', 'articulo')),
  canales        text[] not null default '{}',
  campana_id     uuid references public.marketing_campanas (id) on delete set null,
  -- idea → guion → arte → aprobada → programada → publicada (o descartada en cualquier momento)
  estado         text not null default 'idea'
                 check (estado in ('idea', 'guion', 'arte', 'aprobada', 'programada', 'publicada', 'descartada')),
  fecha_programada date,
  gancho         text,
  guion          jsonb not null default '[]'::jsonb,
  llamado_accion text,
  notas          text,
  -- De qué trabajo real sale.
  origen_proyecto_id uuid references public.proyectos (id),
  origen_visita_id   uuid references public.visitas (id),
  origen_formato_id  uuid references public.sst_formatos (id),
  responsable_id uuid references public.perfiles (id),
  aprobada_por   uuid references public.perfiles (id),
  aprobada_en    timestamptz,
  motivo_descarte text,
  creado_por     uuid default auth.uid() references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint marketing_ideas_guion check (jsonb_typeof(guion) = 'array'),
  constraint marketing_ideas_descarte check (estado <> 'descartada' or length(trim(coalesce(motivo_descarte, ''))) > 0),
  constraint marketing_ideas_programada check (estado not in ('programada', 'publicada') or fecha_programada is not null)
);
create index if not exists idx_marketing_ideas_calendario on public.marketing_ideas (fecha_programada, estado);
create index if not exists idx_marketing_ideas_estado on public.marketing_ideas (estado, creado_en desc);

-- ============================================================ 5) las piezas de cada idea
create table if not exists public.marketing_piezas (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid not null references public.marketing_ideas (id) on delete cascade,
  orden         int not null default 1,
  tipo          text not null default 'imagen' check (tipo in ('imagen', 'video', 'texto')),
  texto         text,
  path          text,
  biblioteca_id uuid references public.marketing_biblioteca (id),
  -- Fase 2: de dónde salió el arte.
  generada_por  text check (generada_por is null or generada_por in ('manual', 'nano_banana', 'veo', 'flow', 'otro')),
  prompt        text,
  modelo        text,
  creado_por    uuid default auth.uid() references public.perfiles (id),
  creado_en     timestamptz not null default now(),
  unique (idea_id, orden)
);

-- ============================================================ 6) lo publicado y sus números
create table if not exists public.marketing_publicaciones (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid not null references public.marketing_ideas (id) on delete restrict,
  cuenta_id     uuid not null references public.marketing_cuentas (id) on delete restrict,
  publicado_en  timestamptz not null default now(),
  url           text,
  externo_id    text,
  -- 'manual' mientras no esté la fase 3.
  via           text not null default 'manual' check (via in ('manual', 'api', 'n8n')),
  creado_por    uuid default auth.uid() references public.perfiles (id),
  unique (idea_id, cuenta_id)
);

create table if not exists public.marketing_metricas (
  id              uuid primary key default gen_random_uuid(),
  publicacion_id  uuid not null references public.marketing_publicaciones (id) on delete cascade,
  medida_en       date not null default ((now() at time zone 'America/Bogota')::date),
  alcance         int check (alcance is null or alcance >= 0),
  impresiones     int check (impresiones is null or impresiones >= 0),
  interacciones   int check (interacciones is null or interacciones >= 0),
  clics           int check (clics is null or clics >= 0),
  guardados       int check (guardados is null or guardados >= 0),
  comentarios     int check (comentarios is null or comentarios >= 0),
  registrado_por  uuid default auth.uid() references public.perfiles (id),
  registrado_en   timestamptz not null default now(),
  unique (publicacion_id, medida_en)
);

-- ============================================================ 7) el candado de autorización
-- Una idea no se aprueba si usa material identificable de un cliente sin permiso concedido.
create or replace function public.fn_marketing_aprobar_reglas()
returns trigger language plpgsql set search_path = public as $$
declare v_sin text;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if new.estado in ('aprobada', 'programada', 'publicada')
     and (tg_op = 'INSERT' or old.estado not in ('aprobada', 'programada', 'publicada')) then
    select string_agg(b.titulo, ', ') into v_sin
    from marketing_piezas p
    join marketing_biblioteca b on b.id = p.biblioteca_id
    where p.idea_id = new.id and b.identificable and b.autorizacion <> 'concedida';
    if v_sin is not null then
      raise exception 'No se puede aprobar: hay material identificable de un cliente sin autorización (%). Publicar la instalación de seguridad de un cliente lo expone.', v_sin;
    end if;
    if new.aprobada_por is null then
      new.aprobada_por := auth.uid();
      new.aprobada_en := now();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_marketing_aprobar on public.marketing_ideas;
create trigger trg_marketing_aprobar before insert or update on public.marketing_ideas
  for each row execute function public.fn_marketing_aprobar_reglas();
revoke all on function public.fn_marketing_aprobar_reglas() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['marketing_cuentas','marketing_campanas','marketing_biblioteca',
                           'marketing_ideas','marketing_piezas','marketing_publicaciones','marketing_metricas'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('create trigger trg_%s_updated_at before update on public.%I
                      for each row execute function extensions.moddatetime(updated_at)', t, t);
    end if;
  end loop;
end $$;

-- ============================================================ 8) de qué hablar esta semana
-- Lee la operación y propone. No inventa: cada fila es algo que de verdad pasó.
create or replace view public.v_marketing_oportunidades
with (security_invoker = true) as
select * from (
  select 'proyecto'::text as fuente, p.id as origen_id,
         'Obra entregada: ' || p.codigo || ' · ' || p.nombre as titulo,
         'Un proyecto cerrado es el mejor caso de obra: qué se instaló, en cuánto tiempo, qué resolvió.'::text as por_que,
         coalesce(p.fecha_cierre, p.updated_at::date) as cuando,
         'caso_obra'::text as tipo_sugerido
  from proyectos p where p.estado = 'CERRADO'
  union all
  select 'visita', v.id,
         'Visita cerrada: ' || coalesce(v.titulo, v.cliente_nombre, 'sin título'),
         'Hay fotos del antes y el después; sirve para carrusel.',
         v.cerrada_en::date, 'carrusel'
  from visitas v where v.cerrada_en is not null
  union all
  select 'equipo', q.id,
         'Equipo con inspección al día: ' || q.codigo || ' · ' || q.clase,
         'Mostrar que los equipos de protección se inspeccionan genera confianza en el comprador.',
         q.creado_en::date, 'post'
  from sst_equipos q where q.estado = 'activo'
  union all
  select 'formato', f.id,
         'Formato firmado en obra',
         'Trabajo con permiso de alturas y ATS firmados: pocos competidores lo pueden mostrar.',
         f.fecha, 'post'
  from sst_formatos f where f.estado in ('firmado', 'aprobado')
) o
where not exists (
  select 1 from marketing_ideas i
  where (o.fuente = 'proyecto' and i.origen_proyecto_id = o.origen_id)
     or (o.fuente = 'visita'   and i.origen_visita_id   = o.origen_id)
     or (o.fuente = 'formato'  and i.origen_formato_id  = o.origen_id))
order by cuando desc nulls last;

comment on view public.v_marketing_oportunidades is
  'Trabajo real del que todavia no se ha hecho contenido. La materia prima del calendario.';

-- ============================================================ 9) permisos
do $$
declare t text;
begin
  foreach t in array array['marketing_cuentas','marketing_campanas','marketing_biblioteca',
                           'marketing_ideas','marketing_piezas','marketing_publicaciones','marketing_metricas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (fn_tiene_permiso(''marketing'', ''consultar''))', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_trabajar', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (fn_tiene_permiso(''marketing'', ''trabajar''))
                    with check (fn_tiene_permiso(''marketing'', ''trabajar''))', t||'_trabajar', t);
  end loop;
end $$;

revoke all on public.v_marketing_oportunidades from public, anon;
grant select on public.v_marketing_oportunidades to authenticated;

-- ============================================================ 10) bucket y secciones
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing', 'marketing', false, 52428800,
        array['image/jpeg','image/png','image/webp','image/heic','image/gif',
              'video/mp4','video/quicktime','application/pdf'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fn_marketing_archivo(p_accion text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_accion when 'ver' then fn_tiene_permiso('marketing', 'consultar')
                       else fn_tiene_permiso('marketing', 'trabajar') end;
$$;
revoke all on function public.fn_marketing_archivo(text) from public, anon;
grant execute on function public.fn_marketing_archivo(text) to authenticated;

drop policy if exists marketing_archivos_select on storage.objects;
create policy marketing_archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'marketing' and fn_marketing_archivo('ver'));
drop policy if exists marketing_archivos_insert on storage.objects;
create policy marketing_archivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing' and fn_marketing_archivo('subir'));

insert into public.modulo_secciones (modulo_id, seccion_id, nombre, href, orden) values
  ('marketing','calendario','Calendario de contenido','/marketing/calendario',1),
  ('marketing','ideas','Ideas','/marketing/ideas',2),
  ('marketing','campanas','Campañas','/marketing/campanas',3),
  ('marketing','biblioteca','Biblioteca de fotos','/marketing/biblioteca',4),
  ('marketing','cuentas','Cuentas conectadas','/marketing/cuentas',5),
  ('marketing','reportes','Reportes','/marketing/reportes',6)
on conflict (modulo_id, seccion_id) do update
  set nombre = excluded.nombre, href = excluded.href, orden = excluded.orden;

-- ============================================================ 11) las tres cuentas, en su estado real
insert into public.marketing_cuentas (canal, nombre, estado, notas, creado_por) values
  ('linkedin','Servielectro SAS','manual','Canal prioritario: ahí están los administradores de PH, constructores y jefes de compras. Publicar a mano hasta la fase 3.',null),
  ('instagram','Servielectro','manual','Requiere cuenta de empresa vinculada a una pagina de Facebook y revision de Meta (2 a 4 semanas) antes de publicar por API.',null),
  ('facebook','Servielectro','manual','Pagina de empresa. Necesaria tambien para que Instagram pueda publicar por API.',null)
on conflict (canal, nombre) do nothing;

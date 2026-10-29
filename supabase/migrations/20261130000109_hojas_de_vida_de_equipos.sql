-- Hoja de vida de equipos de protección contra caídas y herramienta.
-- Escrita y aplicada por el orquestador (2026-10-29). Idempotente.
--
-- Pedido de Jhojan: "genera las hojas de vida de los equipos que encontraste también, tal como están."
-- Los equipos salieron de C:\Users\servi\OneDrive\BACKUP\COMERCIAL\CLIENTES 2026\NATRIO SAS\
-- PERMISOS DE TRABAJO\certificados: un arnés, una eslinga, sus fichas técnicas, facturas e
-- inspecciones, hoy sueltos en una carpeta.
--
-- Por qué una hoja de vida y no una columna más en el FOR-27: esa carpeta demuestra que el equipo
-- ya tiene historia propia (compra, ficha, inspecciones repetidas). El FOR-27 es el inventario a
-- una fecha y el FOR-39 es un chequeo puntual; los dos son fotos de algo que dura años. Así cada
-- diligenciada queda colgada del equipo en vez de ser una lista que se vuelve a escribir.
--
-- ------------------------------------------------------------------ la regla que importa
-- fn_sst_equipo_vigente(equipo, fecha) responde si el equipo servía ESE DÍA, no si sirve hoy. Es la
-- misma regla que pedimos para los certificados del FOR-15: cuando se audita un permiso de alturas
-- firmado en marzo, la pregunta es si el arnés estaba vigente en marzo. Inspeccionarlo hoy no
-- legaliza una firma de ayer, y la prueba D de la verificación existe para eso.
--
-- Verificación: supabase/verificaciones/20261130000109_verificar.sql

create table if not exists public.sst_equipos (
  id                        uuid primary key default gen_random_uuid(),
  codigo                    text not null unique,
  clase                     text not null,
  marca                     text,
  referencia                text,
  serial                    text,
  norma                     text,
  fecha_fabricacion         date,
  fecha_compra              date,
  fecha_ingreso_servicio    date,
  vida_util_meses           int,
  periodicidad_inspeccion_meses int not null default 6,
  asignado_a                uuid references public.empleados(id),
  estado                    text not null default 'activo',
  fecha_retiro              date,
  motivo_retiro             text,
  confiabilidad             text not null default 'pendiente',
  notas                     text,
  creado_por                uuid default auth.uid() references auth.users(id),
  creado_en                 timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint sst_equipos_clase_check check (clase in (
    'arnes','eslinga','linea_de_vida','conector','absorbedor','mosqueton','casco','escalera',
    'plataforma_elevadora','herramienta_manual','taladro','otro')),
  constraint sst_equipos_estado_check check (estado in ('activo','fuera_de_servicio','retirado')),
  constraint sst_equipos_confiabilidad_check check (confiabilidad in ('confirmada','informada','inferida','pendiente')),
  -- Un equipo retirado tiene que decir cuándo y por qué: un EPCC se retira por vencimiento, por
  -- caída o por daño, y eso es justo lo que una auditoría pregunta.
  constraint sst_equipos_retiro_completo check (
    (estado <> 'retirado') or (fecha_retiro is not null and nullif(trim(motivo_retiro),'') is not null)),
  constraint sst_equipos_periodicidad_check check (periodicidad_inspeccion_meses between 1 and 60)
);

comment on table public.sst_equipos is
  'Hoja de vida del equipo. confiabilidad usa el vocabulario de la casa: confirmada / informada / inferida / pendiente.';
comment on column public.sst_equipos.confiabilidad is
  'De donde salio el dato. pendiente = hay que leer la ficha tecnica y la factura; no se inventa serial ni fecha.';

create table if not exists public.sst_equipo_inspecciones (
  id            uuid primary key default gen_random_uuid(),
  equipo_id     uuid not null references public.sst_equipos(id) on delete cascade,
  fecha         date not null,
  resultado     text not null,
  formato_id    uuid references public.sst_formatos(id),
  path          text,
  inspector_id  uuid references public.empleados(id),
  observaciones text,
  creado_por    uuid default auth.uid() references auth.users(id),
  creado_en     timestamptz not null default now(),
  constraint sst_equipo_inspecciones_resultado_check
    check (resultado in ('apto','apto_con_observaciones','no_apto')),
  -- Si no está apto, hay que decir por qué.
  constraint sst_equipo_inspecciones_motivo check
    (resultado = 'apto' or nullif(trim(observaciones),'') is not null),
  constraint sst_equipo_inspecciones_unica unique (equipo_id, fecha)
);

comment on table public.sst_equipo_inspecciones is
  'Cada inspeccion del equipo. formato_id apunta al FOR-39 o FOR-40 diligenciado en el ERP; path, al papel escaneado.';

create table if not exists public.sst_equipo_archivos (
  id          uuid primary key default gen_random_uuid(),
  equipo_id   uuid not null references public.sst_equipos(id) on delete cascade,
  tipo        text not null,
  descripcion text not null,
  path        text not null,
  subido_por  uuid default auth.uid() references auth.users(id),
  subido_en   timestamptz not null default now(),
  constraint sst_equipo_archivos_tipo_check
    check (tipo in ('ficha_tecnica','certificado','factura','inspeccion','foto','manual','otro'))
);

create index if not exists sst_equipo_inspecciones_equipo_ix on public.sst_equipo_inspecciones (equipo_id, fecha desc);
create index if not exists sst_equipo_archivos_equipo_ix on public.sst_equipo_archivos (equipo_id);
create index if not exists sst_equipos_asignado_ix on public.sst_equipos (asignado_a) where asignado_a is not null;

-- ============================================================ vigencia A UNA FECHA, no hoy
create or replace function public.fn_sst_equipo_vigente(p_equipo_id uuid, p_fecha date)
returns boolean language sql stable security definer set search_path = public as $$
  select e.estado = 'activo'
     and (e.fecha_retiro is null or e.fecha_retiro > p_fecha)
     and (e.vida_util_meses is null or e.fecha_ingreso_servicio is null
          or e.fecha_ingreso_servicio + (e.vida_util_meses || ' months')::interval > p_fecha)
     and exists (
       select 1 from sst_equipo_inspecciones i
       where i.equipo_id = e.id and i.fecha <= p_fecha and i.resultado <> 'no_apto'
         and i.fecha + (e.periodicidad_inspeccion_meses || ' months')::interval > p_fecha)
  from sst_equipos e where e.id = p_equipo_id;
$$;

comment on function public.fn_sst_equipo_vigente(uuid, date) is
  'Si el equipo estaba apto para usarse en esa fecha: activo, sin vida util cumplida y con inspeccion vigente ese dia.';

create or replace view public.v_sst_equipos
with (security_invoker = true) as
select e.*,
  u.fecha                                        as ultima_inspeccion,
  u.resultado                                    as ultimo_resultado,
  (u.fecha + (e.periodicidad_inspeccion_meses || ' months')::interval)::date as proxima_inspeccion,
  case when e.fecha_ingreso_servicio is not null and e.vida_util_meses is not null
       then (e.fecha_ingreso_servicio + (e.vida_util_meses || ' months')::interval)::date end as fin_vida_util,
  fn_sst_equipo_vigente(e.id, (now() at time zone 'America/Bogota')::date) as vigente_hoy,
  (select count(*) from sst_equipo_archivos a where a.equipo_id = e.id)     as archivos
from sst_equipos e
left join lateral (
  select i.fecha, i.resultado from sst_equipo_inspecciones i
  where i.equipo_id = e.id order by i.fecha desc limit 1
) u on true;

-- ============================================================ permisos
alter table public.sst_equipos enable row level security;
alter table public.sst_equipo_inspecciones enable row level security;
alter table public.sst_equipo_archivos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sst_equipos','sst_equipo_inspecciones','sst_equipo_archivos'] loop
    if not exists (select 1 from pg_policy where polname = t||'_select') then
      execute format('create policy %I on public.%I for select using (fn_tiene_permiso(''sgsst'', ''consultar''))', t||'_select', t);
    end if;
    if not exists (select 1 from pg_policy where polname = t||'_trabajar') then
      execute format('create policy %I on public.%I for all using (fn_tiene_permiso(''sgsst'', ''trabajar'')) with check (fn_tiene_permiso(''sgsst'', ''trabajar''))', t||'_trabajar', t);
    end if;
  end loop;
end $$;

revoke all on table public.sst_equipos, public.sst_equipo_inspecciones, public.sst_equipo_archivos from public, anon;
grant select, insert, update, delete on table public.sst_equipos, public.sst_equipo_inspecciones, public.sst_equipo_archivos to authenticated;
revoke all on public.v_sst_equipos from public, anon;
grant select on public.v_sst_equipos to authenticated;
revoke all on function public.fn_sst_equipo_vigente(uuid, date) from public, anon;
grant execute on function public.fn_sst_equipo_vigente(uuid, date) to authenticated, service_role;

-- ============================================================ los dos equipos que aparecieron
-- La referencia sale del NOMBRE del archivo, no de haber leído el documento: queda como
-- 'informada'. Serial, fechas y norma siguen vacíos a propósito. No se inventa el serial de un
-- arnés: de eso depende que alguien se cuelgue.
insert into public.sst_equipos (codigo, clase, referencia, confiabilidad, notas, creado_por)
values
  ('EPCC-001','arnes','402-MT-X4-EM','informada',
   'Referencia tomada del nombre del archivo en NATRIO SAS\PERMISOS DE TRABAJO\certificados. Falta leer ficha tecnica y factura para marca, serial, fecha de compra, norma y vida util.',null),
  ('EPCC-002','eslinga','LT 35R','informada',
   'Referencia tomada del nombre del archivo en NATRIO SAS\PERMISOS DE TRABAJO\certificados. Falta leer ficha tecnica y factura para marca, serial, fecha de compra, norma y vida util.',null)
on conflict (codigo) do nothing;

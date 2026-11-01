-- Referenciados: agentes comerciales externos y su plan de comisiones (2026-10-30).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- Jhojan: "es mejor una persona y/o empresa que me traiga 20 clientes, que tocar 20 puertas".
-- Freelance y empresas de seguridad privada que traen negocio, con comisión.
--
-- ------------------------------------------------------------------ EL NÚMERO QUE MANDA
-- Tintalá: contrato $16.970.535, AIU 6/5/6. La utilidad del AIU es ~$870.284.
-- Una comisión del 5% SOBRE EL VALOR DEL CONTRATO = $848.527 = el 97% de esa utilidad.
-- Al 10% = $1.697.054 = el 195%: pagaría el doble de lo que gana.
--
-- Por eso este módulo NO permite comisionar a ciegas sobre el contrato. La comisión se PRECIA
-- DENTRO de la cotización usando cotizaciones.pct_comision_comercial, que ya existe y estaba en
-- 0.0000 en las dos cotizaciones. Ese campo es exactamente para esto y nunca se había usado.
--
-- ------------------------------------------------------------------ dos reglas comerciales duras
-- 1. LA COMISIÓN SE CAUSA CON EL RECAUDO, no con la firma. Si el cliente no paga, no hay comisión
--    que pagar. Es lo que evita financiarle el negocio a un tercero con plata que todavía no entra.
-- 2. EL REGISTRO DE OPORTUNIDAD VENCE. Un referido registra un prospecto y queda protegido por una
--    ventana (90 días por defecto). Sin eso, dentro de dos años alguien aparece a cobrar por un
--    cliente que llegó solo. Y un mismo prospecto no puede estar registrado por dos referidos a la
--    vez: lo impide un índice único, no la buena fe.

create table if not exists public.referidos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'persona' check (tipo in ('persona','empresa')),
  nombre text not null check (length(trim(nombre)) > 0),
  tipo_documento text not null default 'CC' check (tipo_documento in ('CC','CE','PA','PPT','NIT')),
  numero_documento text not null check (length(trim(numero_documento)) > 0),
  categoria text not null default 'freelance'
    check (categoria in ('freelance','empresa_seguridad','administrador_ph','instalador','arquitecto_constructor','otro')),
  correo text, telefono text, ciudad text,
  plan_id uuid,
  estado text not null default 'activo' check (estado in ('activo','inactivo','suspendido')),
  acuerdo_firmado boolean not null default false,
  acuerdo_path text,
  notas text,
  creado_por uuid default auth.uid() references public.perfiles (id),
  creado_en timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_documento, numero_documento)
);

create table if not exists public.referido_planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  descripcion text,
  -- 'valor_contrato' queda PROHIBIDO a propósito: es el que se come el margen (ver nota de arriba).
  base text not null default 'utilidad' check (base in ('utilidad','precio_con_comision')),
  porcentaje numeric(6,4) not null check (porcentaje > 0 and porcentaje <= 0.5),
  porcentaje_recurrente numeric(6,4) check (porcentaje_recurrente is null or (porcentaje_recurrente > 0 and porcentaje_recurrente <= 0.5)),
  meses_recurrencia int check (meses_recurrencia is null or meses_recurrencia between 1 and 60),
  tope_por_proyecto numeric(14,2) check (tope_por_proyecto is null or tope_por_proyecto > 0),
  dias_vigencia_registro int not null default 90 check (dias_vigencia_registro between 15 and 730),
  causa text not null default 'recaudo' check (causa in ('recaudo','firma')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'referidos_plan_fk') then
    alter table public.referidos add constraint referidos_plan_fk
      foreign key (plan_id) references public.referido_planes (id);
  end if;
end $$;

create table if not exists public.referido_registros (
  id uuid primary key default gen_random_uuid(),
  referido_id uuid not null references public.referidos (id) on delete restrict,
  cliente_id uuid references public.clientes (id),
  nit_prospecto text,
  nombre_prospecto text not null check (length(trim(nombre_prospecto)) > 0),
  contacto text, telefono text, ciudad text,
  nota text,
  registrado_en date not null default ((now() at time zone 'America/Bogota')::date),
  vence_el date not null,
  estado text not null default 'vigente' check (estado in ('vigente','ganado','perdido','vencido')),
  motivo text,
  creado_por uuid default auth.uid() references public.perfiles (id),
  updated_at timestamptz not null default now(),
  constraint referido_registros_vence check (vence_el > registrado_en),
  constraint referido_registros_cierre check (estado not in ('perdido') or length(trim(coalesce(motivo,''))) > 0)
);
create unique index if not exists uq_referido_registro_nit
  on public.referido_registros (nit_prospecto) where estado = 'vigente' and nit_prospecto is not null;
create unique index if not exists uq_referido_registro_cliente
  on public.referido_registros (cliente_id) where estado = 'vigente' and cliente_id is not null;

create table if not exists public.referido_comisiones (
  id uuid primary key default gen_random_uuid(),
  referido_id uuid not null references public.referidos (id) on delete restrict,
  registro_id uuid references public.referido_registros (id),
  proyecto_id uuid references public.proyectos (id),
  cotizacion_id uuid references public.cotizaciones (id),
  concepto text not null check (length(trim(concepto)) > 0),
  base_calculo numeric(14,2) not null check (base_calculo > 0),
  porcentaje numeric(6,4) not null check (porcentaje > 0),
  valor numeric(14,2) not null check (valor > 0),
  estado text not null default 'causada' check (estado in ('causada','aprobada','pagada','anulada')),
  causada_en date not null default ((now() at time zone 'America/Bogota')::date),
  aprobada_por uuid references public.perfiles (id),
  aprobada_en timestamptz,
  pagada_en date,
  soporte_path text,
  motivo text,
  creado_por uuid default auth.uid() references public.perfiles (id),
  creado_en timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referido_comisiones_anulada check (estado <> 'anulada' or length(trim(coalesce(motivo,''))) > 0),
  constraint referido_comisiones_pagada check (estado <> 'pagada' or pagada_en is not null)
);
create index if not exists idx_referido_comisiones on public.referido_comisiones (referido_id, estado, causada_en desc);

create or replace view public.v_referido_registros
with (security_invoker = true) as
select r.*,
       case when r.estado = 'vigente' and r.vence_el < (now() at time zone 'America/Bogota')::date
            then 'vencido' else r.estado end as estado_real,
       (r.vence_el - (now() at time zone 'America/Bogota')::date) as dias_restantes,
       f.nombre as referido_nombre, f.categoria
from public.referido_registros r
join public.referidos f on f.id = r.referido_id;

create or replace view public.v_referidos_resumen
with (security_invoker = true) as
select f.id, f.nombre, f.categoria, f.estado, f.ciudad,
       count(distinct g.id) filter (where g.estado = 'vigente')  as registros_vigentes,
       count(distinct g.id) filter (where g.estado = 'ganado')   as registros_ganados,
       coalesce(sum(c.valor) filter (where c.estado in ('causada','aprobada')), 0) as comision_pendiente,
       coalesce(sum(c.valor) filter (where c.estado = 'pagada'), 0)                as comision_pagada
from public.referidos f
left join public.referido_registros g on g.referido_id = f.id
left join public.referido_comisiones c on c.referido_id = f.id
group by f.id, f.nombre, f.categoria, f.estado, f.ciudad;

do $$
declare t text;
begin
  foreach t in array array['referidos','referido_planes','referido_registros','referido_comisiones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select to authenticated
      using (fn_tiene_permiso(''administrativo'', ''consultar'') or fn_tiene_permiso(''comercial'', ''consultar''))', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_trabajar', t);
    execute format('create policy %I on public.%I for all to authenticated
      using (fn_tiene_permiso(''administrativo'', ''trabajar''))
      with check (fn_tiene_permiso(''administrativo'', ''trabajar''))', t||'_trabajar', t);
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
      execute format('create trigger trg_%s_updated_at before update on public.%I
                      for each row execute function extensions.moddatetime(updated_at)', t, t);
    end if;
  end loop;
end $$;

revoke all on public.v_referido_registros, public.v_referidos_resumen from public, anon;
grant select on public.v_referido_registros, public.v_referidos_resumen to authenticated;

insert into public.modulo_secciones (modulo_id, seccion_id, nombre, href, orden) values
  ('administrativo','referidos','Referenciados','/administrativo/referidos',3),
  ('administrativo','comisiones','Comisiones','/administrativo/comisiones',4)
on conflict (modulo_id, seccion_id) do update
  set nombre = excluded.nombre, href = excluded.href, orden = excluded.orden;

-- Los dos planes sembrados como PROPUESTA v1 (Jhojan los puede mover).
insert into public.referido_planes (nombre, descripcion, base, porcentaje, porcentaje_recurrente, meses_recurrencia, dias_vigencia_registro, causa) values
 ('Freelance — propuesta v1',
  'Agente independiente. 8% del valor del proyecto, PRECIADO DENTRO de la cotizacion (pct_comision_comercial), no descontado de la utilidad. Mas 10% del canon mensual de monitoreo o mantenimiento durante 12 meses. Se causa con el recaudo.',
  'precio_con_comision', 0.0800, 0.1000, 12, 90, 'recaudo'),
 ('Empresa de seguridad privada — propuesta v1',
  'Ya tiene la relacion con la copropiedad o la planta. 6% del proyecto preciado dentro de la cotizacion, y 12% del canon recurrente durante 24 meses: menos de entrada, mas residual, porque su valor esta en el volumen y en que se queda con el cliente.',
  'precio_con_comision', 0.0600, 0.1200, 24, 120, 'recaudo')
on conflict (nombre) do nothing;

-- RRHH → Personal (2026-10-30): la ficha del empleado, duplicada de NEXGO pestaña por pestaña
-- (docs/nexgo-personal-ficha-empleado.md). Ocho pestañas: Datos · Hoja de vida · Contrato ·
-- Accesos · Dotación · Sueldo/liquidación · Desprendible · Caja menor.
--
-- Desviaciones obligatorias (orquestador y Jhojan):
--   - Accesos: NINGUNA contraseña se guarda. empleados.perfil_id enlaza la ficha con el usuario
--     del ERP, que tiene su propio manejo de contraseñas. El "Rol de menú" de NEXGO es acá el
--     rol del usuario enlazado (Configuración), no un campo de la ficha.
--   - El sistema NO calcula nómina ni liquidación: "la señora Alejandra hace eso y sube al
--     sistema". Sueldo/liquidación y Desprendible son CAPTURA (los valores que ella escribe) +
--     el archivo que ella sube + historial. Ninguna fórmula acá.
--   - Caja menor (viáticos, obra fuera de la ciudad) y gastos de materiales (compras en la
--     ciudad, migración 64) son flujos distintos y conviven.
--   - Ningún valor de ley acá: el auxilio que hereda la ficha sale de Parámetros de liquidación
--     (65) y se sobrescribe por persona en empleado_parametros.
--
-- Todo con RRHH "trabajar" (salarios y documentos de identidad). Lo que es registro (liquidación,
-- desprendible, recibo de caja menor) no se edita: se anula con motivo y se hace otro.
--
-- Verificación: supabase/verificaciones/20261030000066_verificar.sql
-- Rollback:     supabase/rollbacks/20261030000066_personal_down.sql
-- Idempotente. Requiere la 64 (documentos_personal) y la 65 (parámetros).

-- ============================================================ 1) la ficha
create table if not exists public.empleados (
  id uuid primary key default gen_random_uuid(),
  -- Accesos: el usuario del ERP de esta persona (uno a uno). Nunca su contraseña.
  perfil_id uuid unique references public.perfiles (id),
  -- Datos
  primer_nombre text not null check (length(trim(primer_nombre)) > 0),
  otros_nombres text,
  primer_apellido text not null check (length(trim(primer_apellido)) > 0),
  segundo_apellido text,
  tipo_documento text not null default 'CC' check (tipo_documento in ('CC', 'CE', 'TI', 'PA', 'PPT', 'NIT')),
  numero_documento text not null check (length(trim(numero_documento)) > 0),
  codigo_interno text,
  titulacion text,
  mostrar_titulacion_carnet boolean not null default false,
  cargo text,
  area text,
  estado_laboral text not null default 'activo' check (estado_laboral in ('activo', 'en_pausa', 'retirado')),
  correo text,
  telefono text,
  ciudad text,
  direccion text,
  municipio_dane text check (municipio_dane is null or municipio_dane ~ '^\d{5}$'),
  fecha_nacimiento date,
  rh text,
  eps text,
  afp text,
  arl text,
  caja_compensacion text,
  contacto_emergencia text,
  telefono_emergencia text,
  fecha_ingreso date not null,
  fecha_retiro date,
  motivo_retiro text,
  salario_base numeric(14,2) not null check (salario_base >= 0),
  bonificacion numeric(14,2) check (bonificacion is null or bonificacion >= 0),
  rodamiento numeric(14,2) check (rodamiento is null or rodamiento >= 0),
  detalle_bonificacion text,
  tipo_contrato text check (tipo_contrato in ('termino_fijo', 'indefinido', 'obra_labor', 'prestacion_servicios')),
  aplica_auxilio_transporte boolean not null default true,
  salario_integral boolean not null default false,
  -- Foto (Subir foto / Quitar) y Hoja de vida (notas)
  foto_path text,
  notas_hoja_vida text,
  -- Dotación: tallas
  talla_camisa text,
  talla_pantalon text,
  talla_botas text,
  creado_por uuid default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_documento, numero_documento),
  constraint empleados_retiro check (fecha_retiro is null or fecha_retiro >= fecha_ingreso)
);
create index if not exists idx_empleados_estado on public.empleados (estado_laboral, primer_apellido);

drop trigger if exists trg_empleados_updated_at on public.empleados;
create trigger trg_empleados_updated_at
  before update on public.empleados
  for each row execute function extensions.moddatetime(updated_at);

-- Lo que la ficha sobrescribe de Parámetros de liquidación (ej. el auxilio de transporte).
-- Sin fila = hereda el de la empresa.
create table if not exists public.empleado_parametros (
  empleado_id uuid not null references public.empleados (id) on delete restrict,
  clave text not null references public.parametros_liquidacion (clave),
  valor numeric(16,4) not null check (valor >= 0),
  nota text,
  actualizado_por uuid default auth.uid() references public.perfiles (id),
  actualizado_en timestamptz not null default now(),
  primary key (empleado_id, clave)
);

-- ============================================================ 2) hoja de vida
create table if not exists public.empleado_archivos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados (id) on delete restrict,
  tipo text not null default 'hoja_de_vida' check (tipo in ('hoja_de_vida', 'certificacion', 'otro')),
  storage_path text not null unique,
  nombre_archivo text,
  mime text,
  bytes bigint,
  subido_por uuid not null default auth.uid() references public.perfiles (id),
  subido_en timestamptz not null default now(),
  constraint empleado_archivos_ruta check (storage_path like 'personal/' || empleado_id || '/%')
);
create index if not exists idx_empleado_archivos on public.empleado_archivos (empleado_id, subido_en desc);

-- ============================================================ 3) dotación
-- Herramientas de la empresa (el "inventario interno" del selector de NEXGO). No es un
-- inventario con bodega y movimientos: es la lista de activos que se entregan a alguien.
create table if not exists public.herramientas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  serial text,
  descripcion text,
  item_catalogo_id uuid references public.items_catalogo (id),
  foto_path text,
  estado text not null default 'disponible' check (estado in ('disponible', 'asignada', 'baja')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_herramientas_updated_at on public.herramientas;
create trigger trg_herramientas_updated_at
  before update on public.herramientas
  for each row execute function extensions.moddatetime(updated_at);

-- Lo entregado a cada persona: herramienta del inventario, herramienta propia (por nombre),
-- EPP o uniforme. "Puede editar o borrar cada ítem" (NEXGO).
create table if not exists public.dotacion_entregas (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados (id) on delete restrict,
  categoria text not null default 'herramienta' check (categoria in ('herramienta', 'epp', 'uniforme')),
  herramienta_id uuid references public.herramientas (id),
  nombre text,                                   -- si no es del inventario
  cantidad int not null default 1 check (cantidad > 0),
  talla text,
  fecha_entrega date not null,
  foto_path text,
  observacion text,
  devuelta_en date,
  registrado_por uuid default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  constraint dotacion_que check (herramienta_id is not null or length(trim(coalesce(nombre, ''))) > 0)
);
create index if not exists idx_dotacion_empleado on public.dotacion_entregas (empleado_id, fecha_entrega desc);

-- ============================================================ 4) registros que se anulan, no se editan
-- Liquidación, desprendible y recibo de caja menor: lo único que cambia después de creado es
-- la anulación (una vez, con motivo). Quién y cuándo los pone la base.
create or replace function public.fn_rrhh_registro_anulable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Este registro no se borra: se anula con un motivo.';
  end if;
  if (to_jsonb(new) - array['anulado_en', 'anulado_por', 'motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['anulado_en', 'anulado_por', 'motivo_anulacion']) then
    raise exception 'Este registro no se edita: anúlalo con un motivo y haz uno nuevo.';
  end if;
  if old.anulado_en is not null then
    raise exception 'Ya está anulado.';
  end if;
  if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
    raise exception 'Escribe por qué se anula.';
  end if;
  new.anulado_en := now();
  new.anulado_por := auth.uid();
  return new;
end;
$$;

-- ============================================================ 5) sueldo / liquidación (captura)
-- Lo que Alejandra liquidó por fuera, con sus valores y el archivo. El sistema no calcula.
create table if not exists public.liquidaciones (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados (id) on delete restrict,
  tipo text not null default 'periodo' check (tipo in ('periodo', 'retiro')),
  fecha_inicio date not null,
  fecha_corte date not null,
  dias_laborados numeric(6,2),
  dias_base numeric(6,2),
  sueldo_dias numeric(14,2),
  auxilio_transporte numeric(14,2),
  total_devengado numeric(14,2),
  aporte_salud numeric(14,2),
  aporte_pension numeric(14,2),
  neto_pagar numeric(14,2),
  notas text,
  archivo_path text,                             -- el PDF que hizo Alejandra
  documento_id uuid references public.documentos_personal (id),  -- si se publicó a la persona
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  registrado_en timestamptz not null default now(),
  anulado_en timestamptz,
  anulado_por uuid references public.perfiles (id),
  motivo_anulacion text,
  constraint liquidaciones_fechas check (fecha_corte >= fecha_inicio)
);
create index if not exists idx_liquidaciones_empleado on public.liquidaciones (empleado_id, fecha_corte desc);

-- Horas extras y recargos · Licencias, permisos y ausencias · Valor extra no salarial.
create table if not exists public.liquidacion_lineas (
  id uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null references public.liquidaciones (id) on delete restrict,
  seccion text not null check (seccion in ('extras_recargos', 'ausencias', 'extra_no_salarial')),
  concepto text not null check (length(trim(concepto)) > 0),
  cantidad numeric(10,2),
  valor numeric(14,2),
  orden int not null default 0
);
create index if not exists idx_liquidacion_lineas on public.liquidacion_lineas (liquidacion_id, orden);

-- ============================================================ 6) desprendible (captura)
create table if not exists public.desprendibles (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados (id) on delete restrict,
  liquidacion_id uuid references public.liquidaciones (id),
  fecha_pago date not null,
  medio_pago text,                               -- Transferencia, efectivo…
  cuenta_observacion text,                       -- "Banco, cuenta o nota"
  periodo_inicio date not null,
  periodo_fin date not null,
  dias_pagados numeric(6,2),
  sueldo_dias numeric(14,2),
  auxilio_transporte numeric(14,2),
  total_devengado numeric(14,2),
  neto_pagar numeric(14,2),
  archivo_path text,
  documento_id uuid references public.documentos_personal (id),  -- lo que ve la persona
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  registrado_en timestamptz not null default now(),
  anulado_en timestamptz,
  anulado_por uuid references public.perfiles (id),
  motivo_anulacion text,
  constraint desprendibles_fechas check (periodo_fin >= periodo_inicio)
);
create index if not exists idx_desprendibles_empleado on public.desprendibles (empleado_id, periodo_fin desc);

-- ============================================================ 7) caja menor (viáticos)
-- Solo para obra fuera de la ciudad (Jhojan). No es salario ni entra al desprendible.
create table if not exists public.caja_menor_recibos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados (id) on delete restrict,
  concepto text not null check (length(trim(concepto)) > 0),   -- "Para qué se entrega el dinero"
  proyecto_id uuid references public.proyectos (id),            -- la obra fuera de la ciudad
  fecha_entrega date not null default ((now() at time zone 'America/Bogota')::date),
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  registrado_en timestamptz not null default now(),
  anulado_en timestamptz,
  anulado_por uuid references public.perfiles (id),
  motivo_anulacion text
);
create index if not exists idx_caja_menor_empleado on public.caja_menor_recibos (empleado_id, fecha_entrega desc);

create table if not exists public.caja_menor_lineas (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references public.caja_menor_recibos (id) on delete restrict,
  concepto text not null check (length(trim(concepto)) > 0),    -- Transporte, hotel, alimentación…
  documento_soporte text,                                        -- Factura, cuenta o relación
  valor numeric(14,2) not null check (valor > 0),
  orden int not null default 0
);
create index if not exists idx_caja_menor_lineas on public.caja_menor_lineas (recibo_id, orden);

create table if not exists public.caja_menor_soportes (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references public.caja_menor_recibos (id) on delete restrict,
  storage_path text not null unique,
  nombre_archivo text,
  mime text,
  bytes bigint,
  subido_por uuid not null default auth.uid() references public.perfiles (id),
  subido_en timestamptz not null default now()
);

-- Total a entregar: la suma de las líneas (aritmética, no ley).
create or replace view public.v_caja_menor_recibos with (security_invoker = true) as
select r.*, coalesce((select sum(l.valor) from caja_menor_lineas l where l.recibo_id = r.id), 0) as total
from caja_menor_recibos r;

-- ============================================================ 8) reglas de los registros
do $$
declare t text;
begin
  foreach t in array array['liquidaciones', 'desprendibles', 'caja_menor_recibos'] loop
    execute format('drop trigger if exists trg_%s_anulable on public.%I', t, t);
    execute format('create trigger trg_%s_anulable before update or delete on public.%I for each row execute function public.fn_rrhh_registro_anulable()', t, t);
  end loop;
end $$;

-- Líneas y soportes de un registro: solo se agregan, y no a uno anulado.
create or replace function public.fn_rrhh_hijo_de_registro()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_anulado timestamptz;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Las líneas y los soportes no se cambian: anula el registro y haz uno nuevo.';
  end if;
  if tg_table_name = 'liquidacion_lineas' then
    select anulado_en into v_anulado from liquidaciones where id = new.liquidacion_id;
  else
    select anulado_en into v_anulado from caja_menor_recibos where id = new.recibo_id;
  end if;
  if v_anulado is not null then
    raise exception 'El registro está anulado.';
  end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['liquidacion_lineas', 'caja_menor_lineas', 'caja_menor_soportes'] loop
    execute format('drop trigger if exists trg_%s_hijo on public.%I', t, t);
    execute format('create trigger trg_%s_hijo before insert or update or delete on public.%I for each row execute function public.fn_rrhh_hijo_de_registro()', t, t);
  end loop;
end $$;

-- ============================================================ 9) RLS: RRHH "trabajar"
do $$
declare t text;
begin
  foreach t in array array['empleados', 'empleado_parametros', 'empleado_archivos', 'herramientas', 'dotacion_entregas',
                           'liquidaciones', 'liquidacion_lineas', 'desprendibles', 'caja_menor_recibos',
                           'caja_menor_lineas', 'caja_menor_soportes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (fn_rrhh_ve_todo())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (fn_rrhh_ve_todo())', t || '_insert', t);
  end loop;
  -- Se editan: la ficha, sus parámetros propios, las herramientas, las entregas y la anulación
  -- de los registros (la regla de qué columnas, en los triggers).
  foreach t in array array['empleados', 'empleado_parametros', 'herramientas', 'dotacion_entregas',
                           'liquidaciones', 'desprendibles', 'caja_menor_recibos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (fn_rrhh_ve_todo()) with check (fn_rrhh_ve_todo())', t || '_update', t);
  end loop;
  -- Se borran: un parámetro propio (vuelve a heredar) y una entrega de dotación (NEXGO).
  foreach t in array array['empleado_parametros', 'dotacion_entregas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (fn_rrhh_ve_todo())', t || '_delete', t);
  end loop;
end $$;
revoke all on public.v_caja_menor_recibos from anon;

-- ============================================================ 10) Storage: archivo de personal
-- Hoja de vida (PDF, Word o imagen, 10 MB), foto, fotos de dotación, liquidaciones y soportes
-- de caja menor. Carpeta: personal/{empleado_id}/... Sin update ni delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rrhh-personal', 'rrhh-personal', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rrhh_personal_select on storage.objects;
create policy rrhh_personal_select on storage.objects for select to authenticated
  using (bucket_id = 'rrhh-personal' and fn_rrhh_ve_todo());
drop policy if exists rrhh_personal_insert on storage.objects;
create policy rrhh_personal_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rrhh-personal' and fn_rrhh_ve_todo()
              and (name like 'personal/%' or name like 'herramientas/%'));

-- ============================================================ 11) privilegios
revoke all on function public.fn_rrhh_registro_anulable() from public, anon, authenticated;
revoke all on function public.fn_rrhh_hijo_de_registro() from public, anon, authenticated;

-- RRHH → Contratos laborales (2026-10-30), estructura según docs/nexgo-contratos-laborales.md.
--
-- Se replica la ESTRUCTURA de NEXGO: cuatro tipos de documento, plantillas con cláusulas
-- editables (Título / Texto), pólizas con % y vigencia, cronograma de ejecución, y Renovar /
-- Otro sí. El TEXTO de las cláusulas NO: Jhojan lo transcribe completo ("Crea los módulos,
-- crea los campos y yo hago toda la transcripción completa"). Por eso las plantillas nacen
-- con los títulos del documento y el texto VACÍO, y las pólizas sin porcentaje ni vigencia.
-- El contrato laboral de Servielectro ya tuvo problemas serios (no competencia posterior,
-- descuentos de salario, "Contratista" para un trabajador): ningún texto legal sale de acá.
--
-- Un contrato copia la plantilla al crearse (cláusulas, pólizas y cronograma): si la
-- plantilla cambia después, el contrato ya hecho no cambia. Mientras está en borrador se
-- edita; firmado (vigente) no: los cambios van por Otro sí, y la extensión por Renovar.
--
-- Pendiente para cuando llegue el contrato desde la cotización: cotizacion_id y forma_pago ya
-- existen (50-50, 60-40, 50-30-20 u otra, con los hitos de Servielectro); cargarlos solos
-- desde la cotización aprobada es otro paso.
--
-- Verificación: supabase/verificaciones/20261030000067_verificar.sql
-- Rollback:     supabase/rollbacks/20261030000067_contratos_laborales_down.sql
-- Idempotente. Requiere la 66 (empleados).

-- ============================================================ 1) plantillas
create table if not exists public.contrato_plantillas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('termino_fijo', 'indefinido', 'obra_labor', 'prestacion_servicios')),
  nombre text not null check (length(trim(nombre)) > 0),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo, nombre)
);
drop trigger if exists trg_contrato_plantillas_updated_at on public.contrato_plantillas;
create trigger trg_contrato_plantillas_updated_at
  before update on public.contrato_plantillas
  for each row execute function extensions.moddatetime(updated_at);

create table if not exists public.contrato_plantilla_clausulas (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.contrato_plantillas (id) on delete cascade,
  orden int not null default 0,
  titulo text not null check (length(trim(titulo)) > 0),
  texto text not null default ''
);
create index if not exists idx_plantilla_clausulas on public.contrato_plantilla_clausulas (plantilla_id, orden);

create table if not exists public.contrato_plantilla_polizas (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.contrato_plantillas (id) on delete cascade,
  orden int not null default 0,
  activo boolean not null default true,
  poliza text not null check (length(trim(poliza)) > 0),
  porcentaje numeric(6,3) check (porcentaje is null or porcentaje >= 0),
  durante_anios int check (durante_anios is null or durante_anios >= 0),
  meses_extra int check (meses_extra is null or meses_extra >= 0),
  complemento text
);
create index if not exists idx_plantilla_polizas on public.contrato_plantilla_polizas (plantilla_id, orden);

create table if not exists public.contrato_plantilla_cronograma (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.contrato_plantillas (id) on delete cascade,
  orden int not null default 0,
  actividad text not null check (length(trim(actividad)) > 0),
  dia_inicio int check (dia_inicio is null or dia_inicio >= 0),
  duracion_habiles int check (duracion_habiles is null or duracion_habiles > 0),
  responsable text
);
create index if not exists idx_plantilla_cronograma on public.contrato_plantilla_cronograma (plantilla_id, orden);

-- Plantillas por defecto: una por tipo, con los TÍTULOS del documento y el texto vacío.
insert into public.contrato_plantillas (tipo, nombre)
select t, 'Plantilla por defecto' from unnest(array['termino_fijo', 'indefinido', 'obra_labor', 'prestacion_servicios']) t
on conflict (tipo, nombre) do nothing;

insert into public.contrato_plantilla_clausulas (plantilla_id, orden, titulo)
select p.id, c.orden * 10, c.titulo
from public.contrato_plantillas p
cross join unnest(array['TIPO Y DURACIÓN', 'PERIODO DE PRUEBA', 'NATURALEZA DEL VÍNCULO', 'CARGO Y FUNCIONES',
  'LUGAR DE TRABAJO', 'JORNADA Y HORARIO', 'SALARIO Y FORMA DE PAGO', 'AUXILIO DE TRANSPORTE',
  'PRESTACIONES SOCIALES', 'SEGURIDAD SOCIAL', 'OBLIGACIONES DEL TRABAJADOR', 'OBLIGACIONES DEL EMPLEADOR',
  'POLÍTICAS, NORMAS Y SG-SST']) with ordinality c(titulo, orden)
where p.nombre = 'Plantilla por defecto' and p.tipo in ('termino_fijo', 'indefinido', 'obra_labor')
  and not exists (select 1 from public.contrato_plantilla_clausulas x where x.plantilla_id = p.id);

insert into public.contrato_plantilla_clausulas (plantilla_id, orden, titulo)
select p.id, c.orden * 10, c.titulo
from public.contrato_plantillas p
cross join unnest(array['OBJETO', 'OBLIGACIONES DEL CONTRATISTA', 'DURACIÓN', 'PROPUESTA Y ANEXO TÉCNICO',
  'VALOR Y FORMA DE PAGO', 'PAGOS DURANTE LA EJECUCIÓN Y ENTREGA PARCIAL', 'PROPIEDAD INTELECTUAL',
  'DATOS PERSONALES', 'TERMINACIÓN', 'INEXISTENCIA DE RELACIÓN LABORAL', 'PERSONAL, SST Y SEGURIDAD SOCIAL',
  'GASTOS', 'GARANTÍAS Y PÓLIZAS', 'MÉRITO EJECUTIVO', 'DOMICILIO CONTRACTUAL']) with ordinality c(titulo, orden)
where p.nombre = 'Plantilla por defecto' and p.tipo = 'prestacion_servicios'
  and not exists (select 1 from public.contrato_plantilla_clausulas x where x.plantilla_id = p.id);

-- Pólizas y cronograma vistos en el video, sin porcentaje, vigencia ni días.
insert into public.contrato_plantilla_polizas (plantilla_id, orden, poliza)
select p.id, c.orden * 10, c.poliza
from public.contrato_plantillas p
cross join unnest(array['Cumplimiento', 'Buen manejo del anticipo', 'Calidad de materiales y equipos',
  'Responsabilidad civil extracontractual', 'Estabilidad de la obra', 'Prestaciones sociales']) with ordinality c(poliza, orden)
where p.nombre = 'Plantilla por defecto' and p.tipo = 'prestacion_servicios'
  and not exists (select 1 from public.contrato_plantilla_polizas x where x.plantilla_id = p.id);

insert into public.contrato_plantilla_cronograma (plantilla_id, orden, actividad)
select p.id, c.orden * 10, c.actividad
from public.contrato_plantillas p
cross join unnest(array['Acta de inicio / movilización', 'Levantamiento y planeación',
  'Ejecución / suministro e instalación']) with ordinality c(actividad, orden)
where p.nombre = 'Plantilla por defecto' and p.tipo = 'prestacion_servicios'
  and not exists (select 1 from public.contrato_plantilla_cronograma x where x.plantilla_id = p.id);

-- ============================================================ 2) contratos
create table if not exists public.contratos_laborales (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('termino_fijo', 'indefinido', 'obra_labor', 'prestacion_servicios')),
  plantilla_id uuid references public.contrato_plantillas (id),
  clase text not null default 'original' check (clase in ('original', 'renovacion', 'otro_si')),
  contrato_padre_id uuid references public.contratos_laborales (id),
  origen text not null default 'empleado' check (origen in ('empleado', 'externo')),
  empleado_id uuid references public.empleados (id),
  trabajador text,                               -- nombre o razón social (si no es de nómina)
  tipo_documento text,
  documento text,
  salario numeric(14,2) check (salario is null or salario >= 0),
  ciudad_firma text,
  fecha_contrato date,
  fecha_inicio date,
  fecha_fin date,
  objeto text,
  cotizacion_id uuid references public.cotizaciones (id),
  forma_pago text check (forma_pago in ('50-50', '60-40', '50-30-20', 'otra')),
  forma_pago_detalle text,
  plazo_ejecucion text,
  estado text not null default 'borrador' check (estado in ('borrador', 'vigente', 'terminado', 'anulado')),
  archivo_firmado_path text,                     -- el PDF firmado que se sube
  notas text,
  creado_por uuid default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contratos_quien check (empleado_id is not null or length(trim(coalesce(trabajador, ''))) > 0),
  constraint contratos_padre check ((clase = 'original') = (contrato_padre_id is null)),
  constraint contratos_fechas check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)
);
create index if not exists idx_contratos_empleado on public.contratos_laborales (empleado_id, fecha_contrato desc);
create index if not exists idx_contratos_padre on public.contratos_laborales (contrato_padre_id);
drop trigger if exists trg_contratos_updated_at on public.contratos_laborales;
create trigger trg_contratos_updated_at
  before update on public.contratos_laborales
  for each row execute function extensions.moddatetime(updated_at);

create table if not exists public.contrato_clausulas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos_laborales (id) on delete cascade,
  orden int not null default 0,
  titulo text not null check (length(trim(titulo)) > 0),
  texto text not null default ''
);
create index if not exists idx_contrato_clausulas on public.contrato_clausulas (contrato_id, orden);

create table if not exists public.contrato_polizas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos_laborales (id) on delete cascade,
  orden int not null default 0,
  activo boolean not null default true,
  poliza text not null check (length(trim(poliza)) > 0),
  porcentaje numeric(6,3) check (porcentaje is null or porcentaje >= 0),
  durante_anios int check (durante_anios is null or durante_anios >= 0),
  meses_extra int check (meses_extra is null or meses_extra >= 0),
  complemento text
);
create index if not exists idx_contrato_polizas on public.contrato_polizas (contrato_id, orden);

create table if not exists public.contrato_cronograma (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos_laborales (id) on delete cascade,
  orden int not null default 0,
  actividad text not null check (length(trim(actividad)) > 0),
  dia_inicio int check (dia_inicio is null or dia_inicio >= 0),
  fecha_inicio date,
  duracion_habiles int check (duracion_habiles is null or duracion_habiles > 0),
  fecha_fin date,
  responsable text
);
create index if not exists idx_contrato_cronograma on public.contrato_cronograma (contrato_id, orden);

-- Crea el contrato copiando la plantilla. Renovar / Otro sí copian el contrato padre.
-- Invoker: la RLS exige RRHH "trabajar" en cada tabla.
create or replace function public.fn_crear_contrato_laboral(p_datos jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_plantilla uuid := nullif(p_datos ->> 'plantilla_id', '')::uuid;
  v_padre uuid := nullif(p_datos ->> 'contrato_padre_id', '')::uuid;
  v_clase text := coalesce(nullif(p_datos ->> 'clase', ''), 'original');
begin
  if not fn_rrhh_ve_todo() then
    raise exception 'Crear contratos requiere RRHH en nivel "trabajar".';
  end if;
  if v_clase <> 'original' then
    if v_padre is null then
      raise exception 'Renovar u Otro sí necesitan el contrato original.';
    end if;
    insert into contratos_laborales (tipo, plantilla_id, clase, contrato_padre_id, origen, empleado_id, trabajador,
      tipo_documento, documento, salario, ciudad_firma, fecha_contrato, fecha_inicio, fecha_fin, objeto,
      cotizacion_id, forma_pago, forma_pago_detalle, plazo_ejecucion)
    select c.tipo, c.plantilla_id, v_clase, c.id, c.origen, c.empleado_id, c.trabajador, c.tipo_documento,
      c.documento, c.salario, c.ciudad_firma, nullif(p_datos ->> 'fecha_contrato', '')::date,
      nullif(p_datos ->> 'fecha_inicio', '')::date, nullif(p_datos ->> 'fecha_fin', '')::date, c.objeto,
      c.cotizacion_id, c.forma_pago, c.forma_pago_detalle, c.plazo_ejecucion
    from contratos_laborales c where c.id = v_padre
    returning id into v_id;
    if v_id is null then
      raise exception 'No se encontró el contrato original.';
    end if;
    insert into contrato_clausulas (contrato_id, orden, titulo, texto)
    select v_id, orden, titulo, texto from contrato_clausulas where contrato_id = v_padre;
    insert into contrato_polizas (contrato_id, orden, activo, poliza, porcentaje, durante_anios, meses_extra, complemento)
    select v_id, orden, activo, poliza, porcentaje, durante_anios, meses_extra, complemento from contrato_polizas where contrato_id = v_padre;
    insert into contrato_cronograma (contrato_id, orden, actividad, dia_inicio, fecha_inicio, duracion_habiles, fecha_fin, responsable)
    select v_id, orden, actividad, dia_inicio, fecha_inicio, duracion_habiles, fecha_fin, responsable from contrato_cronograma where contrato_id = v_padre;
    return v_id;
  end if;

  insert into contratos_laborales (tipo, plantilla_id, origen, empleado_id, trabajador, tipo_documento, documento,
    salario, ciudad_firma, fecha_contrato, fecha_inicio, fecha_fin, objeto, cotizacion_id, forma_pago,
    forma_pago_detalle, plazo_ejecucion)
  values (
    p_datos ->> 'tipo', v_plantilla, coalesce(nullif(p_datos ->> 'origen', ''), 'empleado'),
    nullif(p_datos ->> 'empleado_id', '')::uuid, nullif(p_datos ->> 'trabajador', ''),
    nullif(p_datos ->> 'tipo_documento', ''), nullif(p_datos ->> 'documento', ''),
    nullif(p_datos ->> 'salario', '')::numeric, nullif(p_datos ->> 'ciudad_firma', ''),
    nullif(p_datos ->> 'fecha_contrato', '')::date, nullif(p_datos ->> 'fecha_inicio', '')::date,
    nullif(p_datos ->> 'fecha_fin', '')::date, nullif(p_datos ->> 'objeto', ''),
    nullif(p_datos ->> 'cotizacion_id', '')::uuid, nullif(p_datos ->> 'forma_pago', ''),
    nullif(p_datos ->> 'forma_pago_detalle', ''), nullif(p_datos ->> 'plazo_ejecucion', ''))
  returning id into v_id;
  if v_plantilla is not null then
    insert into contrato_clausulas (contrato_id, orden, titulo, texto)
    select v_id, orden, titulo, texto from contrato_plantilla_clausulas where plantilla_id = v_plantilla;
    insert into contrato_polizas (contrato_id, orden, activo, poliza, porcentaje, durante_anios, meses_extra, complemento)
    select v_id, orden, activo, poliza, porcentaje, durante_anios, meses_extra, complemento from contrato_plantilla_polizas where plantilla_id = v_plantilla;
    insert into contrato_cronograma (contrato_id, orden, actividad, dia_inicio, duracion_habiles, responsable)
    select v_id, orden, actividad, dia_inicio, duracion_habiles, responsable from contrato_plantilla_cronograma where plantilla_id = v_plantilla;
  end if;
  return v_id;
end;
$$;

-- Un contrato vigente o terminado no se edita (ni sus cláusulas, pólizas o cronograma): lo
-- que cambie va por Otro sí. Solo puede pasar de vigente a terminado, y subirse el firmado.
create or replace function public.fn_contrato_candado()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_estado text;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'contratos_laborales' then
    if tg_op = 'DELETE' then
      raise exception 'Un contrato no se borra: se anula.';
    end if;
    if old.estado = 'borrador' then
      return new;
    end if;
    if (to_jsonb(new) - array['estado', 'archivo_firmado_path', 'notas', 'updated_at'])
       is distinct from (to_jsonb(old) - array['estado', 'archivo_firmado_path', 'notas', 'updated_at']) then
      raise exception 'El contrato ya no está en borrador: los cambios van por un Otro sí.';
    end if;
    if new.estado is distinct from old.estado and not (old.estado = 'vigente' and new.estado = 'terminado') then
      raise exception 'Un contrato % no pasa a %.', old.estado, new.estado;
    end if;
    return new;
  end if;
  select estado into v_estado from contratos_laborales
  where id = (case when tg_op = 'DELETE' then old.contrato_id else new.contrato_id end);
  if v_estado is distinct from 'borrador' then
    raise exception 'El contrato ya no está en borrador: los cambios van por un Otro sí.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['contratos_laborales', 'contrato_clausulas', 'contrato_polizas', 'contrato_cronograma'] loop
    execute format('drop trigger if exists trg_%s_candado on public.%I', t, t);
    execute format('create trigger trg_%s_candado before update or delete on public.%I for each row execute function public.fn_contrato_candado()', t, t);
  end loop;
  -- Agregar cláusulas, pólizas o actividades: también solo en borrador.
  foreach t in array array['contrato_clausulas', 'contrato_polizas', 'contrato_cronograma'] loop
    execute format('drop trigger if exists trg_%s_candado_ins on public.%I', t, t);
    execute format('create trigger trg_%s_candado_ins before insert on public.%I for each row execute function public.fn_contrato_candado()', t, t);
  end loop;
end $$;

-- ============================================================ 3) RLS: RRHH "trabajar"
do $$
declare t text;
begin
  foreach t in array array['contrato_plantillas', 'contrato_plantilla_clausulas', 'contrato_plantilla_polizas',
                           'contrato_plantilla_cronograma', 'contratos_laborales', 'contrato_clausulas',
                           'contrato_polizas', 'contrato_cronograma'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (fn_rrhh_ve_todo())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (fn_rrhh_ve_todo())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (fn_rrhh_ve_todo()) with check (fn_rrhh_ve_todo())', t || '_update', t);
  end loop;
  -- Borrar filas de una tabla (Eliminar cláusula / póliza / actividad), en plantillas y en
  -- contratos en borrador (el candado cuida lo demás). Los contratos y las plantillas no se borran.
  foreach t in array array['contrato_plantilla_clausulas', 'contrato_plantilla_polizas', 'contrato_plantilla_cronograma',
                           'contrato_clausulas', 'contrato_polizas', 'contrato_cronograma'] loop
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (fn_rrhh_ve_todo())', t || '_delete', t);
  end loop;
end $$;

-- Storage: el contrato firmado va al archivo de personal (rrhh-personal, carpeta contratos/).
drop policy if exists rrhh_personal_insert on storage.objects;
create policy rrhh_personal_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rrhh-personal' and fn_rrhh_ve_todo()
              and (name like 'personal/%' or name like 'herramientas/%' or name like 'contratos/%'));

revoke all on function public.fn_crear_contrato_laboral(jsonb) from public, anon;
grant execute on function public.fn_crear_contrato_laboral(jsonb) to authenticated, service_role;
revoke all on function public.fn_contrato_candado() from public, anon, authenticated;

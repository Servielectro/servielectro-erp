-- Contratistas (2026-10-27). Alcance de Jhojan, textual:
--   "para el contratista vamos a generarle un usuario y un submódulo en técnicos, solo para
--    contratistas. en dónde se pacte el valor del día trabajado y/y obra labor. también, que
--    tenga un espacio para subir la planilla de parafiscales, que se lea y se determinen
--    automáticamente los tiempos de vigencia y personal asegurado. y también tendrá un modulo
--    para subir y/o crear las cuentas de cobro que deba presentar a la empresa para los pagos
--    correspondientes."
--
-- QUIÉN VE LA TARIFA (pregunta abierta a Jhojan, sin respuesta al escribir esto): SOLO
-- Administrativo "responsable" y el propio contratista. Nadie más: ni Técnicos, ni Operativo, ni
-- Administrativo "consultar"/"trabajar". Las cuentas de cobro dicen la tarifa (valor por día), así
-- que siguen la misma regla. Es lo conservador: abrir después es una política; cerrar después
-- es descubrir quién ya la vio.
--
-- LA PLANILLA DE PARAFISCALES (PILA): la lectura automática llena SOLO columnas *_inferida y
-- filas con fuente 'lectura'. Eso es INFERIDO: no vale como dato hasta que alguien de
-- Administrativo ("trabajar") lo revise y confirme. Al confirmar se escriben las columnas
-- confirmadas (vigencia_desde / vigencia_hasta) y la lista de personal queda sellada. De ahí sale
-- la defensa de solidaridad laboral, por eso:
--   - quien confirma NO puede ser el mismo contratista;
--   - una planilla confirmada o rechazada no se cambia (se sube otra);
--   - la cobertura (fn_contratista_cobertura) solo cuenta planillas confirmadas.
--
-- PAGO: una cuenta de cobro no se aprueba si los días de su periodo no están cubiertos por
-- planillas CONFIRMADAS del contratista. Es la regla de la defensa; si Jhojan la quiere más
-- laxa, se abre con su razón escrita.
--
-- Acceso del contratista: su usuario (perfiles) con el rol nuevo "Contratistas", que solo tiene
-- el módulo "contratistas" (su portal). Todo lo "propio" exige además ese permiso: si se le
-- quita el rol, deja de ver lo suyo en ese momento. El lado de la empresa usa el módulo
-- "administrativo" que ya existe.
--
-- Nada se borra: contratista inactivo, tarifa reemplazada por una nueva, persona descartada,
-- cuenta anulada. El historial (contratista_eventos) solo suma filas y lo escriben triggers.
--
-- Funciones: revoke de public y anon desde el primer día (lección de la 54).
-- Verificación: supabase/verificaciones/20261115000087_verificar.sql
-- Rollback:     supabase/rollbacks/20261115000087_contratistas_down.sql
-- Idempotente. Tablas nuevas: no depende del estado de las demás salvo perfiles, roles,
-- modulos, permisos_rol, fn_tiene_permiso y fn_nombre_actor.

-- ============================================================ 1) módulo y rol
insert into public.modulos (id, nombre, orden)
values ('contratistas', 'Contratistas', 13)
on conflict (id) do nothing;

insert into public.roles (nombre)
select 'Contratistas'
where not exists (select 1 from public.roles where nombre = 'Contratistas');

insert into public.permisos_rol (rol_id, modulo_id, nivel, ve_datos_sensibles)
select r.id, 'contratistas', 'trabajar', false
from public.roles r
where r.nombre = 'Contratistas'
on conflict (rol_id, modulo_id) do nothing;

-- ============================================================ 2) tablas
create table if not exists public.contratistas (
  id uuid primary key default gen_random_uuid(),
  -- Su usuario del ERP (uno a uno). Puede faltar mientras se le crea.
  perfil_id uuid unique references public.perfiles (id),
  tipo_persona text not null default 'natural' check (tipo_persona in ('natural', 'juridica')),
  nombre text not null check (length(trim(nombre)) > 0),          -- nombre o razón social
  tipo_documento text not null default 'CC' check (tipo_documento in ('CC', 'CE', 'PA', 'PPT', 'NIT')),
  numero_documento text not null check (length(trim(numero_documento)) > 0),
  correo text,
  telefono text,
  activo boolean not null default true,
  notas text,
  creado_por uuid default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_documento, numero_documento)
);
drop trigger if exists trg_contratistas_updated_at on public.contratistas;
create trigger trg_contratistas_updated_at before update on public.contratistas
  for each row execute function extensions.moddatetime(updated_at);

-- Tarifa pactada: por día trabajado o por obra/labor. No se edita: se pacta otra desde una fecha.
-- La vigente de una modalidad (y obra) es la de vigente_desde más reciente que no pase de hoy.
create table if not exists public.contratista_tarifas (
  id uuid primary key default gen_random_uuid(),
  contratista_id uuid not null references public.contratistas (id) on delete restrict,
  modalidad text not null check (modalidad in ('dia', 'obra_labor')),
  valor numeric(14,2) not null check (valor > 0),
  -- Obra/labor: qué se pactó (y, si aplica, el proyecto). Por día: opcional.
  descripcion text,
  proyecto_id uuid references public.proyectos (id),
  vigente_desde date not null,
  pactada_por uuid default auth.uid() references public.perfiles (id),
  pactada_en timestamptz not null default now(),
  constraint contratista_tarifas_obra_describe check (modalidad <> 'obra_labor' or length(trim(coalesce(descripcion, ''))) > 0)
);
create index if not exists idx_contratista_tarifas on public.contratista_tarifas (contratista_id, modalidad, vigente_desde desc);

-- Planilla de parafiscales (PILA) subida por el contratista o por Administrativo.
create table if not exists public.contratista_planillas (
  id uuid primary key default gen_random_uuid(),
  contratista_id uuid not null references public.contratistas (id) on delete restrict,
  archivo_path text not null,
  archivo_sha256 text,
  subida_por uuid default auth.uid() references public.perfiles (id),
  subida_en timestamptz not null default now(),
  -- Lectura automática: INFERIDO. Nunca se usa como dato sin confirmar.
  lectura_estado text not null default 'sin_leer' check (lectura_estado in ('sin_leer', 'leida', 'fallo')),
  lectura_en timestamptz,
  lectura_modelo text,
  lectura_cruda jsonb,
  periodo_inferido text,                 -- p. ej. "2026-10" (periodo de cotización)
  numero_planilla_inferido text,
  operador_inferido text,
  vigencia_desde_inferida date,
  vigencia_hasta_inferida date,
  -- Revisión humana.
  estado text not null default 'inferida' check (estado in ('inferida', 'confirmada', 'rechazada')),
  vigencia_desde date,                    -- CONFIRMADA (null mientras sea inferida)
  vigencia_hasta date,
  revisada_por uuid references public.perfiles (id),
  revisada_en timestamptz,
  motivo_rechazo text,
  constraint contratista_planillas_confirmada check (
    (estado = 'confirmada') = (vigencia_desde is not null and vigencia_hasta is not null)
    and (vigencia_hasta is null or vigencia_hasta >= vigencia_desde)
    and (estado = 'inferida') = (revisada_por is null)
    and (estado <> 'rechazada' or length(trim(coalesce(motivo_rechazo, ''))) > 0)
  )
);
create index if not exists idx_contratista_planillas on public.contratista_planillas (contratista_id, estado, vigencia_desde);

-- Personal asegurado de la planilla. 'lectura' = inferido; 'manual' = lo agregó quien revisa.
-- Se corrige (o se descarta) mientras la planilla sea inferida; al confirmar queda sellado.
create table if not exists public.contratista_planilla_personas (
  id uuid primary key default gen_random_uuid(),
  planilla_id uuid not null references public.contratista_planillas (id) on delete restrict,
  fuente text not null default 'manual' check (fuente in ('lectura', 'manual')),
  nombre text not null check (length(trim(nombre)) > 0),
  tipo_documento text,
  numero_documento text not null check (length(trim(numero_documento)) > 0),
  dias_cotizados int check (dias_cotizados is null or dias_cotizados between 0 and 31),
  clase_riesgo_arl text,
  descartada boolean not null default false,
  agregada_por uuid default auth.uid() references public.perfiles (id),
  agregada_en timestamptz not null default now()
);
create index if not exists idx_contratista_planilla_personas on public.contratista_planilla_personas (planilla_id);

-- Cuentas de cobro: creadas en el sistema o subidas (el PDF que ya tiene el contratista).
create table if not exists public.contratista_cuentas_cobro (
  id uuid primary key default gen_random_uuid(),
  contratista_id uuid not null references public.contratistas (id) on delete restrict,
  numero int,                              -- consecutivo por contratista, se asigna al radicar
  origen text not null default 'creada' check (origen in ('creada', 'subida')),
  periodo_desde date not null,
  periodo_hasta date not null,
  concepto text not null check (length(trim(concepto)) > 0),
  tarifa_id uuid references public.contratista_tarifas (id),
  cantidad numeric(10,2) check (cantidad is null or cantidad > 0),          -- días u obras
  valor_unitario numeric(14,2) check (valor_unitario is null or valor_unitario > 0),
  valor_total numeric(14,2) not null check (valor_total > 0),
  proyecto_id uuid references public.proyectos (id),
  archivo_path text,                        -- la cuenta subida (o el PDF generado)
  estado text not null default 'borrador'
    check (estado in ('borrador', 'radicada', 'aprobada', 'rechazada', 'pagada', 'anulada')),
  radicada_en timestamptz,
  revisada_por uuid references public.perfiles (id),
  revisada_en timestamptz,
  motivo text,                              -- de rechazo o de anulación
  pagada_en date,
  soporte_pago_path text,
  creada_por uuid default auth.uid() references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contratista_cuentas_periodo check (periodo_hasta >= periodo_desde),
  constraint contratista_cuentas_numero unique (contratista_id, numero)
);
create index if not exists idx_contratista_cuentas on public.contratista_cuentas_cobro (contratista_id, estado, periodo_desde);
drop trigger if exists trg_contratista_cuentas_updated_at on public.contratista_cuentas_cobro;
create trigger trg_contratista_cuentas_updated_at before update on public.contratista_cuentas_cobro
  for each row execute function extensions.moddatetime(updated_at);

-- Historial: solo suma filas, lo escriben los triggers.
create table if not exists public.contratista_eventos (
  id uuid primary key default gen_random_uuid(),
  contratista_id uuid not null references public.contratistas (id) on delete restrict,
  tipo text not null,          -- tarifa_pactada | planilla_subida | planilla_confirmada | planilla_rechazada | cuenta_<estado>
  referencia_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  actor_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_contratista_eventos on public.contratista_eventos (contratista_id, creado_en);

-- ============================================================ 3) funciones de acceso
-- ¿Es el propio contratista (y todavía tiene su rol)?
create or replace function public.fn_es_contratista(p_contratista_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_tiene_permiso('contratistas', 'consultar')
     and exists (select 1 from contratistas c where c.id = p_contratista_id and c.perfil_id = auth.uid() and c.activo);
$$;

create or replace function public.fn_contratista_de_planilla(p_planilla_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select contratista_id from contratista_planillas where id = p_planilla_id;
$$;

-- Tarifa y cuentas de cobro: el propio contratista o Administrativo "responsable". Nadie más.
create or replace function public.fn_contratista_ve_valores(p_contratista_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_tiene_permiso('administrativo', 'responsable') or fn_es_contratista(p_contratista_id);
$$;

-- Planillas (sin valores pactados): el propio, Administrativo "consultar" y SG-SST "consultar"
-- (lo necesita para dejar entrar a obra al personal asegurado).
create or replace function public.fn_contratista_ve_planillas(p_contratista_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_tiene_permiso('administrativo', 'consultar') or fn_tiene_permiso('sgsst', 'consultar')
      or fn_es_contratista(p_contratista_id);
$$;

-- Personal asegurado CONFIRMADO de un contratista en una fecha. Lo inferido no cuenta.
create or replace function public.fn_contratista_cobertura(p_contratista_id uuid, p_fecha date)
returns table (planilla_id uuid, nombre text, tipo_documento text, numero_documento text,
               vigencia_desde date, vigencia_hasta date)
language sql stable security definer set search_path = public as $$
  select p.id, x.nombre, x.tipo_documento, x.numero_documento, p.vigencia_desde, p.vigencia_hasta
  from contratista_planillas p
  join contratista_planilla_personas x on x.planilla_id = p.id and not x.descartada
  where p.contratista_id = p_contratista_id
    and p.estado = 'confirmada'
    and p_fecha between p.vigencia_desde and p.vigencia_hasta
    and fn_contratista_ve_planillas(p_contratista_id)
  order by x.nombre;
$$;

-- Días del periodo sin planilla confirmada que los cubra (vacío = cubierto). A propósito SIN
-- filtro de permiso: la llama el trigger de aprobación, y un filtro por permiso dentro de una
-- función que usa un trigger hace que la regla se salte en silencio si quien escribe no lo tiene
-- (lo encontrado en la 83). Solo devuelve fechas.
create or replace function public.fn_contratista_dias_sin_cobertura(p_contratista_id uuid, p_desde date, p_hasta date)
returns date[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d::date order by d), '{}')
  from generate_series(p_desde, p_hasta, interval '1 day') d
  where not exists (
    select 1 from contratista_planillas p
    where p.contratista_id = p_contratista_id and p.estado = 'confirmada'
      and d::date between p.vigencia_desde and p.vigencia_hasta);
$$;

-- ============================================================ 4) reglas (NO definer: current_user tiene que ser quien llama)
create or replace function public.fn_contratista_tarifas_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Una tarifa pactada no se cambia: se pacta una nueva desde otra fecha.';
  end if;
  new.pactada_por := auth.uid();
  new.pactada_en := now();
  return new;
end;
$$;
drop trigger if exists trg_contratista_tarifas_reglas on public.contratista_tarifas;
create trigger trg_contratista_tarifas_reglas before insert or update or delete on public.contratista_tarifas
  for each row execute function public.fn_contratista_tarifas_reglas();

create or replace function public.fn_contratista_planillas_reglas()
returns trigger language plpgsql set search_path = public as $$
declare
  v_perfil uuid;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Una planilla no se borra: si está mal, se rechaza con motivo y se sube otra.';
  end if;

  if tg_op = 'INSERT' then
    -- Nace inferida, sin nada confirmado, la sube quien está conectado.
    new.estado := 'inferida';
    new.vigencia_desde := null;
    new.vigencia_hasta := null;
    new.revisada_por := null;
    new.revisada_en := null;
    new.motivo_rechazo := null;
    new.subida_por := auth.uid();
    new.subida_en := now();
    return new;
  end if;

  -- UPDATE
  if old.estado <> 'inferida' then
    raise exception 'Esta planilla ya fue revisada (%): no se cambia. Si hace falta, sube otra.', old.estado;
  end if;
  if (new.contratista_id, new.archivo_path, new.archivo_sha256, new.subida_por, new.subida_en)
     is distinct from (old.contratista_id, old.archivo_path, old.archivo_sha256, old.subida_por, old.subida_en) then
    raise exception 'El archivo de la planilla no se cambia: sube otra.';
  end if;

  if new.estado = 'inferida' then
    -- Solo la lectura (columnas inferidas) puede cambiar; lo confirmado sigue vacío.
    if new.vigencia_desde is not null or new.vigencia_hasta is not null or new.revisada_por is not null then
      raise exception 'La vigencia se confirma al revisar la planilla, no antes.';
    end if;
    return new;
  end if;

  -- Revisión: Administrativo "trabajar", y nunca el propio contratista.
  if not fn_tiene_permiso('administrativo', 'trabajar') then
    raise exception 'Confirmar o rechazar una planilla requiere Administrativo.';
  end if;
  select perfil_id into v_perfil from contratistas where id = old.contratista_id;
  if v_perfil is not distinct from auth.uid() then
    raise exception 'El contratista no puede confirmar su propia planilla.';
  end if;
  if new.estado = 'confirmada' then
    if new.vigencia_desde is null or new.vigencia_hasta is null then
      raise exception 'Para confirmar, escribe la vigencia (desde y hasta) revisada contra el archivo.';
    end if;
    if not exists (select 1 from contratista_planilla_personas x where x.planilla_id = old.id and not x.descartada) then
      raise exception 'Para confirmar, la planilla tiene que tener al menos una persona asegurada.';
    end if;
  end if;
  new.revisada_por := auth.uid();
  new.revisada_en := now();
  return new;
end;
$$;
drop trigger if exists trg_contratista_planillas_reglas on public.contratista_planillas;
create trigger trg_contratista_planillas_reglas before insert or update or delete on public.contratista_planillas
  for each row execute function public.fn_contratista_planillas_reglas();

create or replace function public.fn_contratista_personas_reglas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Una persona de la planilla no se borra: se descarta.';
  end if;
  if exists (select 1 from contratista_planillas p
             where p.id = coalesce(new.planilla_id, old.planilla_id) and p.estado <> 'inferida') then
    raise exception 'La planilla ya fue revisada: su personal quedó sellado.';
  end if;
  if tg_op = 'UPDATE' and new.planilla_id is distinct from old.planilla_id then
    raise exception 'Una persona no se pasa a otra planilla.';
  end if;
  if tg_op = 'INSERT' then
    new.agregada_por := auth.uid();
    new.agregada_en := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_contratista_personas_reglas on public.contratista_planilla_personas;
create trigger trg_contratista_personas_reglas before insert or update or delete on public.contratista_planilla_personas
  for each row execute function public.fn_contratista_personas_reglas();

create or replace function public.fn_contratista_cuentas_reglas()
returns trigger language plpgsql set search_path = public as $$
declare
  v_admin boolean := fn_tiene_permiso('administrativo', 'responsable');
  v_tarifa contratista_tarifas%rowtype;
  v_faltan date[];
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Una cuenta de cobro no se borra: se anula con motivo.';
  end if;
  -- Tarifa: si se usa, tiene que ser de este contratista y el valor unitario es el pactado.
  if new.tarifa_id is not null then
    select * into v_tarifa from contratista_tarifas where id = new.tarifa_id;
    if v_tarifa.contratista_id is distinct from new.contratista_id then
      raise exception 'Esa tarifa no es de este contratista.';
    end if;
    new.valor_unitario := v_tarifa.valor;
  end if;
  if new.cantidad is not null and new.valor_unitario is not null then
    new.valor_total := round(new.cantidad * new.valor_unitario, 2);
  end if;

  if tg_op = 'INSERT' then
    new.estado := 'borrador';
    new.numero := null;
    new.radicada_en := null;
    new.revisada_por := null;
    new.revisada_en := null;
    new.pagada_en := null;
    new.soporte_pago_path := null;
    new.creada_por := auth.uid();
    return new;
  end if;

  -- UPDATE
  if new.contratista_id is distinct from old.contratista_id then
    raise exception 'Una cuenta de cobro no se pasa a otro contratista.';
  end if;

  if old.estado = 'borrador' and new.estado in ('borrador', 'radicada', 'anulada') then
    if new.estado = 'radicada' then
      if new.origen = 'subida' and new.archivo_path is null then
        raise exception 'Para radicar una cuenta subida, adjunta el archivo.';
      end if;
      select coalesce(max(numero), 0) + 1 into new.numero
      from contratista_cuentas_cobro where contratista_id = new.contratista_id;
      new.radicada_en := now();
    end if;
    if new.estado = 'anulada' and length(trim(coalesce(new.motivo, ''))) = 0 then
      raise exception 'Escribe el motivo de la anulación.';
    end if;
    return new;
  end if;

  -- De aquí en adelante, solo cambia el estado y los campos de esa revisión.
  if (new.origen, new.periodo_desde, new.periodo_hasta, new.concepto, new.tarifa_id, new.cantidad,
      new.valor_unitario, new.valor_total, new.proyecto_id, new.archivo_path, new.numero, new.radicada_en)
     is distinct from
     (old.origen, old.periodo_desde, old.periodo_hasta, old.concepto, old.tarifa_id, old.cantidad,
      old.valor_unitario, old.valor_total, old.proyecto_id, old.archivo_path, old.numero, old.radicada_en) then
    raise exception 'Una cuenta radicada no se edita: si está mal, se rechaza y se radica otra.';
  end if;
  if not v_admin then
    raise exception 'Aprobar, rechazar o registrar el pago es de Administrativo (responsable).';
  end if;

  if old.estado = 'radicada' and new.estado = 'aprobada' then
    v_faltan := fn_contratista_dias_sin_cobertura(old.contratista_id, old.periodo_desde, old.periodo_hasta);
    if array_length(v_faltan, 1) > 0 then
      raise exception 'No se aprueba: % día(s) del periodo sin planilla de parafiscales CONFIRMADA (desde el %). Confirma la planilla primero.',
        array_length(v_faltan, 1), v_faltan[1];
    end if;
  elsif old.estado = 'radicada' and new.estado = 'rechazada' then
    if length(trim(coalesce(new.motivo, ''))) = 0 then
      raise exception 'Escribe el motivo del rechazo: el contratista lo ve.';
    end if;
  elsif old.estado = 'aprobada' and new.estado = 'pagada' then
    if new.pagada_en is null then
      raise exception 'Escribe la fecha del pago.';
    end if;
    return new;
  elsif new.estado is distinct from old.estado then
    raise exception 'No se pasa una cuenta de % a %.', old.estado, new.estado;
  else
    raise exception 'Esta cuenta ya está %: no se cambia.', old.estado;
  end if;
  new.revisada_por := auth.uid();
  new.revisada_en := now();
  return new;
end;
$$;
drop trigger if exists trg_contratista_cuentas_reglas on public.contratista_cuentas_cobro;
create trigger trg_contratista_cuentas_reglas before insert or update or delete on public.contratista_cuentas_cobro
  for each row execute function public.fn_contratista_cuentas_reglas();

-- Historial (definer: escribe en una tabla que nadie más escribe).
create or replace function public.fn_contratista_historial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'contratista_tarifas' then
    insert into contratista_eventos (contratista_id, tipo, referencia_id, detalle, actor, actor_nombre)
    values (new.contratista_id, 'tarifa_pactada', new.id,
            jsonb_build_object('modalidad', new.modalidad, 'valor', new.valor, 'vigente_desde', new.vigente_desde, 'descripcion', new.descripcion),
            auth.uid(), fn_nombre_actor());
  elsif tg_table_name = 'contratista_planillas' then
    if tg_op = 'INSERT' then
      insert into contratista_eventos (contratista_id, tipo, referencia_id, actor, actor_nombre)
      values (new.contratista_id, 'planilla_subida', new.id, auth.uid(), fn_nombre_actor());
    elsif new.estado is distinct from old.estado then
      insert into contratista_eventos (contratista_id, tipo, referencia_id, detalle, actor, actor_nombre)
      values (new.contratista_id, 'planilla_' || new.estado, new.id,
              jsonb_build_object('vigencia_desde', new.vigencia_desde, 'vigencia_hasta', new.vigencia_hasta,
                                 'vigencia_desde_inferida', new.vigencia_desde_inferida, 'vigencia_hasta_inferida', new.vigencia_hasta_inferida,
                                 'motivo', new.motivo_rechazo),
              auth.uid(), fn_nombre_actor());
    end if;
  elsif tg_table_name = 'contratista_cuentas_cobro' then
    if tg_op = 'INSERT' or new.estado is distinct from old.estado then
      insert into contratista_eventos (contratista_id, tipo, referencia_id, detalle, actor, actor_nombre)
      values (new.contratista_id, 'cuenta_' || new.estado, new.id,
              jsonb_build_object('numero', new.numero, 'valor_total', new.valor_total, 'motivo', new.motivo, 'pagada_en', new.pagada_en),
              auth.uid(), fn_nombre_actor());
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_contratista_tarifas_historial on public.contratista_tarifas;
create trigger trg_contratista_tarifas_historial after insert on public.contratista_tarifas
  for each row execute function public.fn_contratista_historial();
drop trigger if exists trg_contratista_planillas_historial on public.contratista_planillas;
create trigger trg_contratista_planillas_historial after insert or update on public.contratista_planillas
  for each row execute function public.fn_contratista_historial();
drop trigger if exists trg_contratista_cuentas_historial on public.contratista_cuentas_cobro;
create trigger trg_contratista_cuentas_historial after insert or update on public.contratista_cuentas_cobro
  for each row execute function public.fn_contratista_historial();

-- ============================================================ 5) privilegios y RLS
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['contratistas', 'contratista_tarifas', 'contratista_planillas',
                           'contratista_planilla_personas', 'contratista_cuentas_cobro', 'contratista_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, trigger, references on table public.%I from authenticated', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- Nada se borra (sin políticas de delete) y el historial no se escribe a mano.
revoke delete on table public.contratistas, public.contratista_tarifas, public.contratista_planillas,
  public.contratista_planilla_personas, public.contratista_cuentas_cobro from authenticated;
revoke insert, update, delete on table public.contratista_eventos from authenticated;

-- contratistas (sin valores): Administrativo "consultar" o el propio. Lo administra "trabajar".
create policy contratistas_select on public.contratistas for select to authenticated
  using (fn_tiene_permiso('administrativo', 'consultar') or fn_es_contratista(id));
create policy contratistas_insert on public.contratistas for insert to authenticated
  with check (fn_tiene_permiso('administrativo', 'trabajar'));
create policy contratistas_update on public.contratistas for update to authenticated
  using (fn_tiene_permiso('administrativo', 'trabajar'))
  with check (fn_tiene_permiso('administrativo', 'trabajar'));

-- tarifas: SOLO Administrativo "responsable" y el propio (que la ve, no la pacta).
create policy contratista_tarifas_select on public.contratista_tarifas for select to authenticated
  using (fn_contratista_ve_valores(contratista_id));
create policy contratista_tarifas_insert on public.contratista_tarifas for insert to authenticated
  with check (fn_tiene_permiso('administrativo', 'responsable'));

-- planillas: las sube el propio o Administrativo "trabajar"; las ven ellos, Administrativo y SG-SST.
create policy contratista_planillas_select on public.contratista_planillas for select to authenticated
  using (fn_contratista_ve_planillas(contratista_id));
create policy contratista_planillas_insert on public.contratista_planillas for insert to authenticated
  with check (fn_es_contratista(contratista_id) or fn_tiene_permiso('administrativo', 'trabajar'));
create policy contratista_planillas_update on public.contratista_planillas for update to authenticated
  using (fn_es_contratista(contratista_id) or fn_tiene_permiso('administrativo', 'trabajar'))
  with check (fn_es_contratista(contratista_id) or fn_tiene_permiso('administrativo', 'trabajar'));

create policy contratista_planilla_personas_select on public.contratista_planilla_personas for select to authenticated
  using (fn_contratista_ve_planillas(fn_contratista_de_planilla(planilla_id)));
create policy contratista_planilla_personas_insert on public.contratista_planilla_personas for insert to authenticated
  with check (fn_es_contratista(fn_contratista_de_planilla(planilla_id)) or fn_tiene_permiso('administrativo', 'trabajar'));
create policy contratista_planilla_personas_update on public.contratista_planilla_personas for update to authenticated
  using (fn_es_contratista(fn_contratista_de_planilla(planilla_id)) or fn_tiene_permiso('administrativo', 'trabajar'))
  with check (fn_es_contratista(fn_contratista_de_planilla(planilla_id)) or fn_tiene_permiso('administrativo', 'trabajar'));

-- cuentas de cobro (dicen la tarifa): el propio y Administrativo "responsable".
create policy contratista_cuentas_select on public.contratista_cuentas_cobro for select to authenticated
  using (fn_contratista_ve_valores(contratista_id));
create policy contratista_cuentas_insert on public.contratista_cuentas_cobro for insert to authenticated
  with check (fn_contratista_ve_valores(contratista_id));
create policy contratista_cuentas_update on public.contratista_cuentas_cobro for update to authenticated
  using (fn_contratista_ve_valores(contratista_id))
  with check (fn_contratista_ve_valores(contratista_id));

-- historial (trae valores): el propio y Administrativo "responsable".
create policy contratista_eventos_select on public.contratista_eventos for select to authenticated
  using (fn_contratista_ve_valores(contratista_id));

-- ============================================================ 6) archivos (bucket privado contratistas)
-- {contratista_id}/planillas/...  → lo ven quienes ven planillas.
-- {contratista_id}/cuentas/...    → lo ven quienes ven valores (dice la tarifa).
-- {contratista_id}/pagos/...      → soporte de pago: solo Administrativo "responsable" sube.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contratistas', 'contratistas', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fn_contratista_archivo(p_nombre text, p_accion text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when c.id is null then false
    when (storage.foldername(p_nombre))[2] = 'planillas' then
      case p_accion when 'ver' then fn_contratista_ve_planillas(c.id)
                    else fn_es_contratista(c.id) or fn_tiene_permiso('administrativo', 'trabajar') end
    when (storage.foldername(p_nombre))[2] = 'cuentas' then fn_contratista_ve_valores(c.id)
    when (storage.foldername(p_nombre))[2] = 'pagos' then
      case p_accion when 'ver' then fn_contratista_ve_valores(c.id)
                    else fn_tiene_permiso('administrativo', 'responsable') end
    else false
  end
  from (select (select id from contratistas where id::text = (storage.foldername(p_nombre))[1]) as id) c;
$$;

drop policy if exists contratistas_archivos_insert on storage.objects;
create policy contratistas_archivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contratistas' and fn_contratista_archivo(name, 'subir'));
drop policy if exists contratistas_archivos_select on storage.objects;
create policy contratistas_archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'contratistas' and fn_contratista_archivo(name, 'ver'));
-- Sin update ni delete: lo subido no se reemplaza ni se borra.

-- ============================================================ 7) privilegios de las funciones
revoke all on function public.fn_es_contratista(uuid) from public, anon;
revoke all on function public.fn_contratista_de_planilla(uuid) from public, anon;
revoke all on function public.fn_contratista_ve_valores(uuid) from public, anon;
revoke all on function public.fn_contratista_ve_planillas(uuid) from public, anon;
revoke all on function public.fn_contratista_cobertura(uuid, date) from public, anon;
revoke all on function public.fn_contratista_dias_sin_cobertura(uuid, date, date) from public, anon;
revoke all on function public.fn_contratista_archivo(text, text) from public, anon;
grant execute on function public.fn_es_contratista(uuid) to authenticated, service_role;
grant execute on function public.fn_contratista_de_planilla(uuid) to authenticated, service_role;
grant execute on function public.fn_contratista_ve_valores(uuid) to authenticated, service_role;
grant execute on function public.fn_contratista_ve_planillas(uuid) to authenticated, service_role;
grant execute on function public.fn_contratista_cobertura(uuid, date) to authenticated;
grant execute on function public.fn_contratista_dias_sin_cobertura(uuid, date, date) to authenticated, service_role;
grant execute on function public.fn_contratista_archivo(text, text) to authenticated;
-- de trigger: nadie
revoke all on function public.fn_contratista_tarifas_reglas() from public, anon, authenticated;
revoke all on function public.fn_contratista_planillas_reglas() from public, anon, authenticated;
revoke all on function public.fn_contratista_personas_reglas() from public, anon, authenticated;
revoke all on function public.fn_contratista_cuentas_reglas() from public, anon, authenticated;
revoke all on function public.fn_contratista_historial() from public, anon, authenticated;

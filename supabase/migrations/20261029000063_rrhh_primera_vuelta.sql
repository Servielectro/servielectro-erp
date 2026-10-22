-- RRHH, primera vuelta (2026-10-29): gastos en sitio y transportes, permisos, abonos de nómina
-- y el registro de certificados emitidos.
--
-- El para qué: que Alejandra trabaje con la plataforma sin depender de Jhojan. El técnico
-- registra desde /tecnico; Jhojan aprueba permisos y abonos; Alejandra lo ve todo.
-- El sistema NO calcula nómina, liquidación ni descuentos.
--
-- Decisiones (aprobadas por el orquestador):
--   - Ver lo ajeno exige RRHH "trabajar" (fn_rrhh_ve_todo), no "cualquier nivel": un chuleo
--     de "consultar" en RRHH para el rol Técnico no le abre los abonos de todos.
--   - Aprobar depende de estar en rrhh_aprobadores (una fila: Jhojan), no de un rol. Nadie
--     aprueba lo suyo. Tope por monto opcional (nulo = sin tope).
--   - El técnico solo ve proyectos donde tiene una visita o una tarea asignada
--     (fn_proyectos_del_tecnico). Nada de Comercial. "Sin proyecto" es un caso normal (hoy
--     hay 0 proyectos): Alejandra lo asigna después, y queda quién y cuándo.
--   - visitas.proyecto_id nuevo. Es clasificación, no evidencia: Operativo lo puede poner
--     también en una visita firmada (excepción en fn_candado_visita).
--   - El pantallazo del abono es evidencia: con el abono desembolsado, la fila no cambia y
--     el archivo no se reemplaza ni se borra (el bucket no tiene update ni delete).
--   - Abono con dos fechas: solicitud y desembolso. La quincena del descuento sale del
--     desembolso (columna generada). Es una etiqueta de período, no un cálculo.
--   - Permiso: solicitado → aprobado/rechazado → gozado. Gozado lo marca RRHH. La
--     compensación del técnico es una PROPUESTA; la confirma el aprobador al aprobar.
--   - Para el mismo día, solo calamidad doméstica (lo exige la base, no solo la pantalla).
--
-- Pendientes de Jhojan, que se activan SIN migrar:
--   - Calamidad ya pasada: rrhh_reglas.calamidad_dias_atras (hoy 0 = solo desde hoy).
--   - Reembolso del gasto pagado de bolsillo: columnas reembolso_* en gastos, que RRHH ya
--     puede marcar; la pantalla no lo muestra hasta que él decida.
--   - Desprendibles: segunda vuelta, con su propio caso "el técnico A abre el de B".
--
-- Verificación: supabase/verificaciones/20261029000063_verificar.sql
-- Rollback:     supabase/rollbacks/20261029000063_rrhh_primera_vuelta_down.sql
-- Idempotente.

-- ============================================================ 1) quién ve todo y quién aprueba
create or replace function public.fn_rrhh_ve_todo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_tiene_permiso('rrhh', 'trabajar');
$$;

create table if not exists public.rrhh_aprobadores (
  perfil_id uuid primary key references public.perfiles (id),
  aprueba_permisos boolean not null default true,
  aprueba_abonos boolean not null default true,
  monto_maximo_abono numeric(14,2) check (monto_maximo_abono is null or monto_maximo_abono > 0),
  agregado_en timestamptz not null default now()
);

-- Jhojan, único aprobador. Si su perfil no existe en esta base, no se inserta nada.
insert into public.rrhh_aprobadores (perfil_id)
select id from public.perfiles where id = '696d9431-5c4d-4043-aee4-3e4597094f26'
on conflict (perfil_id) do nothing;

create or replace function public.fn_es_aprobador_rrhh(p_que text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from rrhh_aprobadores a
    where a.perfil_id = auth.uid()
      and case p_que when 'permisos' then a.aprueba_permisos when 'abonos' then a.aprueba_abonos else false end
  );
$$;

alter table public.rrhh_aprobadores enable row level security;
drop policy if exists rrhh_aprobadores_select on public.rrhh_aprobadores;
create policy rrhh_aprobadores_select on public.rrhh_aprobadores for select to authenticated
  using (perfil_id = auth.uid() or fn_rrhh_ve_todo());
-- Sin insert/update/delete: los aprobadores se cambian por SQL, a propósito.

-- Reglas que Jhojan todavía no decidió. Una sola fila. La lee cualquiera con sesión (el
-- formulario la necesita para explicar por qué bloquea una fecha); nadie la cambia desde la app.
create table if not exists public.rrhh_reglas (
  id boolean primary key default true check (id),
  calamidad_dias_atras int not null default 0 check (calamidad_dias_atras between 0 and 30)
);
insert into public.rrhh_reglas (id) values (true) on conflict (id) do nothing;

alter table public.rrhh_reglas enable row level security;
drop policy if exists rrhh_reglas_select on public.rrhh_reglas;
create policy rrhh_reglas_select on public.rrhh_reglas for select to authenticated using (true);

-- ============================================================ 2) proyectos: visitas y lista del técnico
alter table public.visitas add column if not exists proyecto_id uuid references public.proyectos (id);
create index if not exists idx_visitas_proyecto on public.visitas (proyecto_id);

-- Solo id, código y nombre, y solo donde el técnico trabaja. No abre Comercial.
create or replace function public.fn_proyectos_del_tecnico()
returns table (id uuid, codigo text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.codigo, p.nombre
  from proyectos p
  where p.estado = 'EN_EJECUCION'
    and (
      exists (select 1 from visitas v
              where v.proyecto_id = p.id and v.tecnico_id = auth.uid() and v.estado <> 'cancelada')
      or exists (select 1 from tareas t join tarea_asignados a on a.tarea_id = t.id
                 where t.proyecto_id = p.id and a.perfil_id = auth.uid() and not t.archivada)
    )
  order by p.nombre;
$$;

-- Para que Alejandra asigne el proyecto a un gasto: todos, con su estado. Solo RRHH "trabajar".
create or replace function public.fn_proyectos_para_rrhh()
returns table (id uuid, codigo text, nombre text, estado text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.codigo, p.nombre, p.estado::text
  from proyectos p
  where fn_rrhh_ve_todo()
  order by p.nombre;
$$;

-- Para el filtro "por técnico" de Alejandra: solo id y nombre.
create or replace function public.fn_personas_rrhh()
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.nombre), ''), '(sin nombre)')
  from perfiles p
  where fn_rrhh_ve_todo()
  order by 2;
$$;

-- El candado de la visita firmada (migración 60) deja pasar proyecto_id: es clasificación
-- para Financiero, no evidencia. Lo demás, igual que en la 60.
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

  if tg_table_name = 'visitas' then
    -- Nada fuera del estado cambia, y el estado solo avanza: firmada → cerrada, con
    -- Operativo. Quedarse igual (un update sin cambios) no es error. Migración 60: el cierre
    -- escribe cerrada_en/cerrada_por/cierre_nota, que controla fn_visita_cierre.
    -- Migración 63: proyecto_id tampoco es evidencia (lo cambia solo Operativo, ver
    -- fn_visitas_solo_estado_tecnico).
    if (to_jsonb(new) - array['estado', 'updated_at', 'cerrada_en', 'cerrada_por', 'cierre_nota', 'proyecto_id'])
       is distinct from (to_jsonb(old) - array['estado', 'updated_at', 'cerrada_en', 'cerrada_por', 'cierre_nota', 'proyecto_id']) then
      raise exception 'La visita ya está firmada por el cliente: no se edita. Agrega una nota posterior.';
    end if;
    if new.estado is distinct from old.estado then
      if not (old.estado = 'firmada' and new.estado = 'cerrada') then
        raise exception 'Una visita firmada no vuelve atrás: de "%" no puede pasar a "%".', old.estado, new.estado;
      end if;
      if not fn_tiene_permiso('operativo', 'trabajar') then
        raise exception 'Cerrar una visita firmada requiere permiso de Operativo.';
      end if;
    end if;
    return new;
  end if;

  -- Jornadas, fotos y sugerencias: el contenido de evidencia no cambia. Un update que deja
  -- el contenido igual (reintento) pasa; lo demás de cada tabla (traslado a Drive de la
  -- foto, recorrido de la sugerencia) sí puede cambiar.
  if fn_contenido_evidencia(tg_table_name, to_jsonb(new)) is distinct from fn_contenido_evidencia(tg_table_name, to_jsonb(old)) then
    -- Migración 58: la única excepción, marcar la salida una vez con la visita "firmada".
    if tg_table_name = 'visita_jornadas'
       and (select estado from visitas where id = v_visita) = 'firmada'
       and fn_es_salida_tras_firma(to_jsonb(old), to_jsonb(new)) then
      return new;
    end if;
    raise exception 'La visita ya está firmada por el cliente: ese registro no se puede cambiar. Agrega una nota posterior.';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_candado_visita() from public, anon, authenticated;

-- ============================================================ 3) gastos (compras en sitio y transportes)
-- Entrada del módulo Financiero: proyecto, monto, fecha, quién, factura y categoría de costo.
-- MATERIAL y EQUIPO coinciden con categoria_item de la cotización, para comparar sin traducir.
-- No reemplaza proyecto_ejecucion_items (líneas con unidad y cantidad): Financiero une ambas.
create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null default auth.uid() references public.perfiles (id),
  tipo text not null check (tipo in ('compra', 'transporte')),
  categoria_costo text not null check (categoria_costo in ('MATERIAL', 'EQUIPO', 'HERRAMIENTA', 'TRANSPORTE', 'OTRO')),
  fecha date not null default ((now() at time zone 'America/Bogota')::date),
  monto numeric(14,2) not null check (monto > 0),
  descripcion text not null check (length(trim(descripcion)) > 0),
  proveedor text,
  numero_factura text,
  origen text,                 -- transportes
  destino text,
  pagado_con text not null check (pagado_con in ('propio', 'empresa')),
  -- A qué se carga. Nulo = "sin proyecto": legítimo, lo asigna RRHH después.
  proyecto_id uuid references public.proyectos (id),
  visita_id uuid references public.visitas (id),
  proyecto_asignado_por uuid references public.perfiles (id),
  proyecto_asignado_en timestamptz,
  -- Revisión de RRHH: "observado" = devuelto al técnico para corregir, con el motivo.
  estado text not null default 'registrado' check (estado in ('registrado', 'observado', 'anulado')),
  observacion text,
  observado_por uuid references public.perfiles (id),
  observado_en timestamptz,
  -- Reembolso (pendiente de Jhojan): RRHH ya puede marcarlo; la pantalla aún no lo muestra.
  reembolsado_quincena date,
  reembolsado_por uuid references public.perfiles (id),
  reembolsado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gastos_tipo_y_categoria check (
    (tipo = 'transporte' and categoria_costo = 'TRANSPORTE')
    or (tipo = 'compra' and categoria_costo <> 'TRANSPORTE')
  ),
  constraint gastos_reembolso_solo_propio check (reembolsado_en is null or pagado_con = 'propio')
);
create index if not exists idx_gastos_persona on public.gastos (persona_id, fecha desc);
create index if not exists idx_gastos_proyecto on public.gastos (proyecto_id, fecha);

drop trigger if exists trg_gastos_updated_at on public.gastos;
create trigger trg_gastos_updated_at
  before update on public.gastos
  for each row execute function extensions.moddatetime(updated_at);

-- Quién cambia qué:
--   - el dueño: los datos del gasto y su proyecto (de SU lista), mientras esté registrado u
--     observado y sin reembolsar. Si estaba observado y lo corrige, vuelve a registrado.
--     Puede anularlo (no se borra nada).
--   - RRHH "trabajar": asignar o cambiar el proyecto (cualquiera), observar con motivo,
--     marcar el reembolso. No toca monto, fecha ni factura.
create or replace function public.fn_gastos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_rrhh boolean := fn_rrhh_ve_todo();
  v_duenio boolean;
  v_datos text[] := array['tipo', 'categoria_costo', 'fecha', 'monto', 'descripcion', 'proveedor',
                          'numero_factura', 'origen', 'destino', 'pagado_con', 'visita_id'];
  v_cambian_datos boolean;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.persona_id is distinct from auth.uid() then
      raise exception 'Un gasto se registra a nombre propio.';
    end if;
    new.estado := 'registrado';
    new.observacion := null; new.observado_por := null; new.observado_en := null;
    new.reembolsado_quincena := null; new.reembolsado_por := null; new.reembolsado_en := null;
    new.proyecto_asignado_por := null; new.proyecto_asignado_en := null;
    new.created_at := now();
    if new.fecha > v_hoy then
      raise exception 'La fecha del gasto no puede ser futura.';
    end if;
    if new.proyecto_id is not null and not v_rrhh
       and not exists (select 1 from fn_proyectos_del_tecnico() p where p.id = new.proyecto_id) then
      raise exception 'Ese proyecto no está entre los tuyos. Guárdalo sin proyecto y RRHH lo asigna.';
    end if;
    if new.visita_id is not null and not v_rrhh
       and not exists (select 1 from visitas v where v.id = new.visita_id and v.tecnico_id = auth.uid()) then
      raise exception 'Esa visita no es tuya.';
    end if;
    return new;
  end if;

  -- UPDATE
  v_duenio := old.persona_id = auth.uid();
  if new.persona_id is distinct from old.persona_id or new.created_at is distinct from old.created_at then
    raise exception 'El gasto no cambia de dueño ni de fecha de registro.';
  end if;
  v_cambian_datos := (select bool_or((to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c)) from unnest(v_datos) c);

  if v_cambian_datos then
    if not v_duenio then
      raise exception 'Solo quien registró el gasto cambia sus datos. RRHH puede observarlo para que lo corrija.';
    end if;
    if old.estado = 'anulado' or old.reembolsado_en is not null then
      raise exception 'Ese gasto ya no se edita (anulado o reembolsado).';
    end if;
    if new.fecha > v_hoy then
      raise exception 'La fecha del gasto no puede ser futura.';
    end if;
    if new.visita_id is distinct from old.visita_id and new.visita_id is not null
       and not exists (select 1 from visitas v where v.id = new.visita_id and v.tecnico_id = auth.uid()) then
      raise exception 'Esa visita no es tuya.';
    end if;
    -- Corregido por el dueño: vuelve a registrado (la observación queda como historia).
    if old.estado = 'observado' and new.estado = 'observado' then
      new.estado := 'registrado';
    end if;
  end if;

  -- Proyecto
  if new.proyecto_id is distinct from old.proyecto_id then
    if old.estado = 'anulado' then
      raise exception 'Un gasto anulado no se carga a ningún proyecto.';
    end if;
    if v_rrhh then
      new.proyecto_asignado_por := auth.uid();
      new.proyecto_asignado_en := now();
    elsif v_duenio and old.reembolsado_en is null then
      if new.proyecto_id is not null
         and not exists (select 1 from fn_proyectos_del_tecnico() p where p.id = new.proyecto_id) then
        raise exception 'Ese proyecto no está entre los tuyos. Déjalo sin proyecto y RRHH lo asigna.';
      end if;
    else
      raise exception 'No puedes cambiar el proyecto de ese gasto.';
    end if;
  end if;
  if (new.proyecto_asignado_por, new.proyecto_asignado_en) is distinct from (old.proyecto_asignado_por, old.proyecto_asignado_en)
     and new.proyecto_id is not distinct from old.proyecto_id then
    raise exception 'Quién asignó el proyecto lo registra la base.';
  end if;

  -- Estado
  if new.estado is distinct from old.estado then
    if new.estado = 'anulado' then
      if not v_duenio or old.reembolsado_en is not null then
        raise exception 'Solo quien lo registró anula un gasto, y antes del reembolso.';
      end if;
    elsif new.estado = 'observado' then
      if not v_rrhh or old.estado <> 'registrado' then
        raise exception 'Observar un gasto lo hace RRHH, sobre un gasto registrado.';
      end if;
      if length(trim(coalesce(new.observacion, ''))) = 0 then
        raise exception 'Escribe qué hay que corregir.';
      end if;
      new.observado_por := auth.uid();
      new.observado_en := now();
    elsif not (new.estado = 'registrado' and old.estado = 'observado' and v_duenio and v_cambian_datos) then
      raise exception 'Ese cambio de estado no está permitido.';
    end if;
  end if;
  -- La observación se escribe solo al observar, y después no se borra (queda como historia).
  if (new.observacion, new.observado_por, new.observado_en) is distinct from (old.observacion, old.observado_por, old.observado_en)
     and not (old.estado = 'registrado' and new.estado = 'observado') then
    raise exception 'La observación la escribe RRHH al observar el gasto, y no se borra.';
  end if;

  -- Reembolso: solo RRHH, una vez, sobre lo pagado de bolsillo.
  if (new.reembolsado_quincena, new.reembolsado_por, new.reembolsado_en)
     is distinct from (old.reembolsado_quincena, old.reembolsado_por, old.reembolsado_en) then
    if not v_rrhh then
      raise exception 'El reembolso lo marca RRHH.';
    end if;
    if old.reembolsado_en is not null then
      raise exception 'Ese gasto ya está marcado como reembolsado.';
    end if;
    if old.estado = 'anulado' or new.reembolsado_quincena is null then
      raise exception 'Indica en qué quincena se reembolsó (y el gasto no puede estar anulado).';
    end if;
    new.reembolsado_por := auth.uid();
    new.reembolsado_en := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_gastos_reglas on public.gastos;
create trigger trg_gastos_reglas
  before insert or update on public.gastos
  for each row execute function public.fn_gastos_reglas();

-- Factura: foto o PDF. Solo se agregan; ninguno se cambia ni se borra.
create table if not exists public.gasto_soportes (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references public.gastos (id) on delete restrict,
  storage_path text not null unique check (storage_path like 'gastos/%'),
  nombre_archivo text,
  mime text,
  bytes bigint,
  subido_por uuid not null default auth.uid() references public.perfiles (id),
  subido_en timestamptz not null default now()
);
create index if not exists idx_gasto_soportes_gasto on public.gasto_soportes (gasto_id);

-- ============================================================ 4) permisos laborales
create table if not exists public.permisos_laborales (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null default auth.uid() references public.perfiles (id),
  tipo text not null check (tipo in ('asunto_personal', 'remunerado', 'no_remunerado', 'cita_medica',
                                     'calamidad_domestica', 'medio_dia', 'por_horas', 'otro')),
  fecha_solicitud date not null default ((now() at time zone 'America/Bogota')::date),
  solicitado_en timestamptz not null default now(),
  desde date not null,
  hasta date not null,
  hora_inicio time,
  hora_fin time,
  motivo text not null check (length(trim(motivo)) > 0),
  -- Lo que propone el técnico, y lo que confirma el aprobador (es lo que vale).
  compensacion_propuesta text check (compensacion_propuesta in ('con_goce', 'sin_goce', 'reposicion', 'descuento_nomina')),
  compensacion text check (compensacion in ('con_goce', 'sin_goce', 'reposicion', 'descuento_nomina')),
  estado text not null default 'solicitado'
    check (estado in ('solicitado', 'aprobado', 'rechazado', 'gozado', 'anulado')),
  decidido_por uuid references public.perfiles (id),
  decidido_en timestamptz,
  motivo_rechazo text,
  gozado_marcado_por uuid references public.perfiles (id),
  gozado_marcado_en timestamptz,
  observaciones text,
  updated_at timestamptz not null default now(),
  constraint permisos_fechas check (hasta >= desde),
  constraint permisos_horas check (
    (tipo not in ('medio_dia', 'por_horas'))
    or (hora_inicio is not null and hora_fin is not null and hora_fin > hora_inicio and hasta = desde)
  )
);
create index if not exists idx_permisos_persona on public.permisos_laborales (persona_id, desde desc);
create index if not exists idx_permisos_estado on public.permisos_laborales (estado, desde);

drop trigger if exists trg_permisos_updated_at on public.permisos_laborales;
create trigger trg_permisos_updated_at
  before update on public.permisos_laborales
  for each row execute function extensions.moddatetime(updated_at);

-- La regla del mismo día, con la frase que también muestra la pantalla. Devuelve null si la
-- fecha sirve. La usa el trigger y la puede usar el formulario.
create or replace function public.fn_permiso_fecha_bloqueada(p_tipo text, p_desde date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_dias int := coalesce((select calamidad_dias_atras from rrhh_reglas where id), 0);
begin
  if p_tipo = 'calamidad_domestica' then
    if p_desde < v_hoy - v_dias then
      return case when v_dias = 0
        then 'La calamidad doméstica se puede pedir para hoy, no para días pasados.'
        else format('La calamidad doméstica se puede pedir con hasta %s día(s) hacia atrás.', v_dias) end;
    end if;
    return null;
  end if;
  if p_desde <= v_hoy then
    return 'Para hoy solo se puede pedir calamidad doméstica (accidente propio o de un familiar). Los demás permisos, desde mañana.';
  end if;
  return null;
end;
$$;

create or replace function public.fn_permisos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bloqueo text;
  v_duenio boolean;
  v_datos text[] := array['tipo', 'desde', 'hasta', 'hora_inicio', 'hora_fin', 'motivo', 'compensacion_propuesta'];
  v_cambian_datos boolean;
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.persona_id is distinct from auth.uid() then
      raise exception 'Un permiso se solicita a nombre propio.';
    end if;
    new.estado := 'solicitado';
    new.fecha_solicitud := (now() at time zone 'America/Bogota')::date;
    new.solicitado_en := now();
    new.compensacion := null;
    new.decidido_por := null; new.decidido_en := null; new.motivo_rechazo := null;
    new.gozado_marcado_por := null; new.gozado_marcado_en := null;
    v_bloqueo := fn_permiso_fecha_bloqueada(new.tipo, new.desde);
    if v_bloqueo is not null then
      raise exception '%', v_bloqueo;
    end if;
    return new;
  end if;

  -- UPDATE
  v_duenio := old.persona_id = auth.uid();
  if (new.persona_id, new.fecha_solicitud, new.solicitado_en)
     is distinct from (old.persona_id, old.fecha_solicitud, old.solicitado_en) then
    raise exception 'El permiso no cambia de dueño ni de fecha de solicitud.';
  end if;
  v_cambian_datos := (select bool_or((to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c)) from unnest(v_datos) c);

  if v_cambian_datos then
    if not v_duenio or old.estado <> 'solicitado' then
      raise exception 'Solo quien lo pidió cambia el permiso, y mientras no esté decidido.';
    end if;
    v_bloqueo := fn_permiso_fecha_bloqueada(new.tipo, new.desde);
    if v_bloqueo is not null then
      raise exception '%', v_bloqueo;
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if old.estado = 'solicitado' and new.estado = 'anulado' then
      if not v_duenio then
        raise exception 'Solo quien lo pidió anula el permiso.';
      end if;
    elsif old.estado = 'solicitado' and new.estado in ('aprobado', 'rechazado') then
      if not fn_es_aprobador_rrhh('permisos') then
        raise exception 'Solo el aprobador decide los permisos.';
      end if;
      if v_duenio then
        raise exception 'Nadie aprueba su propio permiso.';
      end if;
      if new.estado = 'aprobado' then
        new.compensacion := coalesce(new.compensacion, new.compensacion_propuesta);
        if new.compensacion is null then
          raise exception 'Confirma la compensación (con goce, sin goce, reposición o descuento) para aprobar.';
        end if;
        new.motivo_rechazo := null;
      else
        if length(trim(coalesce(new.motivo_rechazo, ''))) = 0 then
          raise exception 'Escribe por qué se rechaza.';
        end if;
        new.compensacion := null;
      end if;
      new.decidido_por := auth.uid();
      new.decidido_en := now();
    elsif old.estado = 'aprobado' and new.estado = 'gozado' then
      if not fn_rrhh_ve_todo() then
        raise exception 'El permiso como gozado lo marca RRHH.';
      end if;
      if old.desde > (now() at time zone 'America/Bogota')::date then
        raise exception 'Todavía no empieza: no se puede marcar como gozado.';
      end if;
      new.gozado_marcado_por := auth.uid();
      new.gozado_marcado_en := now();
    else
      raise exception 'Un permiso no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;

  -- Lo que escribe cada paso solo cambia en ese paso.
  if (new.compensacion, new.decidido_por, new.decidido_en, new.motivo_rechazo)
     is distinct from (old.compensacion, old.decidido_por, old.decidido_en, old.motivo_rechazo)
     and not (old.estado = 'solicitado' and new.estado in ('aprobado', 'rechazado')) then
    raise exception 'La decisión del permiso no se edita.';
  end if;
  if (new.gozado_marcado_por, new.gozado_marcado_en) is distinct from (old.gozado_marcado_por, old.gozado_marcado_en)
     and not (old.estado = 'aprobado' and new.estado = 'gozado') then
    raise exception 'Quién marcó el permiso como gozado lo registra la base.';
  end if;
  if new.observaciones is distinct from old.observaciones and not (fn_rrhh_ve_todo() or fn_es_aprobador_rrhh('permisos')) then
    raise exception 'Las observaciones las escribe RRHH o el aprobador.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_permisos_reglas on public.permisos_laborales;
create trigger trg_permisos_reglas
  before insert or update on public.permisos_laborales
  for each row execute function public.fn_permisos_reglas();

-- ============================================================ 5) abonos de nómina
create table if not exists public.abonos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null default auth.uid() references public.perfiles (id),
  monto numeric(14,2) not null check (monto > 0),
  motivo text not null check (length(trim(motivo)) > 0),
  fecha_solicitud date not null default ((now() at time zone 'America/Bogota')::date),
  solicitado_en timestamptz not null default now(),
  estado text not null default 'solicitado'
    check (estado in ('solicitado', 'aprobado', 'rechazado', 'desembolsado', 'anulado')),
  decidido_por uuid references public.perfiles (id),
  decidido_en timestamptz,
  motivo_rechazo text,
  -- Desembolso: la fecha decide la quincena del descuento.
  fecha_desembolso date,
  pantallazo_path text unique check (pantallazo_path is null or pantallazo_path like 'abonos/%'),
  desembolso_registrado_por uuid references public.perfiles (id),
  desembolso_registrado_en timestamptz,
  -- Primer día de la quincena (1 o 16) en que se descuenta. Etiqueta, no cálculo.
  quincena_descuento date generated always as (
    case when fecha_desembolso is null then null
         else make_date(extract(year from fecha_desembolso)::int, extract(month from fecha_desembolso)::int,
                        case when extract(day from fecha_desembolso) <= 15 then 1 else 16 end)
    end
  ) stored,
  updated_at timestamptz not null default now(),
  constraint abonos_desembolso_completo check (
    estado <> 'desembolsado' or (fecha_desembolso is not null and pantallazo_path is not null)
  )
);
create index if not exists idx_abonos_persona on public.abonos (persona_id, fecha_solicitud desc);
create index if not exists idx_abonos_quincena on public.abonos (quincena_descuento);

drop trigger if exists trg_abonos_updated_at on public.abonos;
create trigger trg_abonos_updated_at
  before update on public.abonos
  for each row execute function extensions.moddatetime(updated_at);

create or replace function public.fn_abonos_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_duenio boolean;
  v_tope numeric;
begin
  -- Evidencia: desembolsado, no cambia nada, para nadie (ni el administrador por SQL sin
  -- desactivar el trigger a propósito).
  if tg_op = 'UPDATE' and old.estado = 'desembolsado' then
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'El abono ya se desembolsó: el registro y el pantallazo no se cambian.';
    end if;
    return new;
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.persona_id is distinct from auth.uid() then
      raise exception 'Un abono se solicita a nombre propio.';
    end if;
    new.estado := 'solicitado';
    new.fecha_solicitud := (now() at time zone 'America/Bogota')::date;
    new.solicitado_en := now();
    new.decidido_por := null; new.decidido_en := null; new.motivo_rechazo := null;
    new.fecha_desembolso := null; new.pantallazo_path := null;
    new.desembolso_registrado_por := null; new.desembolso_registrado_en := null;
    return new;
  end if;

  -- UPDATE
  v_duenio := old.persona_id = auth.uid();
  if (new.persona_id, new.fecha_solicitud, new.solicitado_en)
     is distinct from (old.persona_id, old.fecha_solicitud, old.solicitado_en) then
    raise exception 'El abono no cambia de dueño ni de fecha de solicitud.';
  end if;
  if (new.monto, new.motivo) is distinct from (old.monto, old.motivo) then
    if not v_duenio or old.estado <> 'solicitado' then
      raise exception 'Solo quien lo pidió cambia el abono, y mientras no esté decidido.';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if old.estado = 'solicitado' and new.estado = 'anulado' then
      if not v_duenio then
        raise exception 'Solo quien lo pidió anula el abono.';
      end if;
    elsif (old.estado = 'solicitado' and new.estado in ('aprobado', 'rechazado', 'desembolsado'))
       or (old.estado = 'aprobado' and new.estado = 'desembolsado') then
      if not fn_es_aprobador_rrhh('abonos') then
        raise exception 'Solo el aprobador decide los abonos.';
      end if;
      if v_duenio then
        raise exception 'Nadie aprueba su propio abono.';
      end if;
      select monto_maximo_abono into v_tope from rrhh_aprobadores where perfil_id = auth.uid();
      if v_tope is not null and new.monto > v_tope and new.estado <> 'rechazado' then
        raise exception 'El abono supera tu tope de aprobación.';
      end if;
      if old.estado = 'solicitado' then
        if new.estado = 'rechazado' and length(trim(coalesce(new.motivo_rechazo, ''))) = 0 then
          raise exception 'Escribe por qué se rechaza.';
        end if;
        if new.estado <> 'rechazado' then
          new.motivo_rechazo := null;
        end if;
        new.decidido_por := auth.uid();
        new.decidido_en := now();
      end if;
      if new.estado = 'desembolsado' then
        if new.fecha_desembolso is null or new.pantallazo_path is null then
          raise exception 'Para registrar el desembolso sube el pantallazo y pon la fecha de la transferencia.';
        end if;
        if new.fecha_desembolso > (now() at time zone 'America/Bogota')::date then
          raise exception 'La fecha del desembolso no puede ser futura.';
        end if;
        if new.fecha_desembolso < old.fecha_solicitud then
          raise exception 'La fecha del desembolso no puede ser anterior a la solicitud.';
        end if;
        if new.pantallazo_path not like 'abonos/' || old.id || '/%' then
          raise exception 'El pantallazo no corresponde a este abono.';
        end if;
        new.desembolso_registrado_por := auth.uid();
        new.desembolso_registrado_en := now();
      end if;
    else
      raise exception 'Un abono no pasa de "%" a "%".', old.estado, new.estado;
    end if;
  end if;

  -- Lo que escribe cada paso solo cambia en ese paso.
  if (new.decidido_por, new.decidido_en, new.motivo_rechazo)
     is distinct from (old.decidido_por, old.decidido_en, old.motivo_rechazo)
     and not (old.estado = 'solicitado' and new.estado in ('aprobado', 'rechazado', 'desembolsado')) then
    raise exception 'La decisión del abono no se edita.';
  end if;
  if (new.fecha_desembolso, new.pantallazo_path, new.desembolso_registrado_por, new.desembolso_registrado_en)
     is distinct from (old.fecha_desembolso, old.pantallazo_path, old.desembolso_registrado_por, old.desembolso_registrado_en)
     and not (old.estado in ('solicitado', 'aprobado') and new.estado = 'desembolsado') then
    raise exception 'El desembolso se registra una sola vez, con el pantallazo.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_abonos_reglas on public.abonos;
create trigger trg_abonos_reglas
  before update or insert on public.abonos
  for each row execute function public.fn_abonos_reglas();

-- ============================================================ 6) certificados laborales emitidos
-- Solo el registro. Sin pantalla ni función expuesta todavía.
create table if not exists public.certificados_emitidos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.perfiles (id),   -- a quién se le emitió
  solicitado_por uuid references public.perfiles (id),
  solicitado_en timestamptz,
  dirigido_a text,                                             -- "A quien interese", un banco…
  datos jsonb not null default '{}'::jsonb,                    -- con qué datos salió
  storage_path text unique,
  emitido_por uuid not null default auth.uid() references public.perfiles (id),
  emitido_en timestamptz not null default now()
);
create index if not exists idx_certificados_persona on public.certificados_emitidos (persona_id, emitido_en desc);

create or replace function public.fn_certificados_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- El administrador por SQL sí (limpieza de la verificación); desde la app, nadie.
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Un certificado emitido es un registro: no se modifica ni se borra.';
end;
$$;
drop trigger if exists trg_certificados_inmutable on public.certificados_emitidos;
create trigger trg_certificados_inmutable
  before update or delete on public.certificados_emitidos
  for each row execute function public.fn_certificados_inmutable();

-- ============================================================ 7) RLS
-- Cada uno ve lo suyo; ver lo ajeno exige RRHH "trabajar" (o ser aprobador, para lo que
-- aprueba). No hay políticas de delete: nada de esto se borra desde la app.
alter table public.gastos enable row level security;
drop policy if exists gastos_select on public.gastos;
create policy gastos_select on public.gastos for select to authenticated
  using (persona_id = auth.uid() or fn_rrhh_ve_todo());
drop policy if exists gastos_insert on public.gastos;
create policy gastos_insert on public.gastos for insert to authenticated
  with check (persona_id = auth.uid());
drop policy if exists gastos_update on public.gastos;
create policy gastos_update on public.gastos for update to authenticated
  using (persona_id = auth.uid() or fn_rrhh_ve_todo())
  with check (persona_id = auth.uid() or fn_rrhh_ve_todo());

alter table public.gasto_soportes enable row level security;
drop policy if exists gasto_soportes_select on public.gasto_soportes;
create policy gasto_soportes_select on public.gasto_soportes for select to authenticated
  using (exists (select 1 from gastos g where g.id = gasto_id and (g.persona_id = auth.uid() or fn_rrhh_ve_todo())));
drop policy if exists gasto_soportes_insert on public.gasto_soportes;
create policy gasto_soportes_insert on public.gasto_soportes for insert to authenticated
  with check (
    subido_por = auth.uid()
    and storage_path like 'gastos/' || gasto_id || '/%'
    and exists (select 1 from gastos g where g.id = gasto_id and g.persona_id = auth.uid()
                and g.estado <> 'anulado' and g.reembolsado_en is null)
  );

alter table public.permisos_laborales enable row level security;
drop policy if exists permisos_laborales_select on public.permisos_laborales;
create policy permisos_laborales_select on public.permisos_laborales for select to authenticated
  using (persona_id = auth.uid() or fn_rrhh_ve_todo() or fn_es_aprobador_rrhh('permisos'));
drop policy if exists permisos_laborales_insert on public.permisos_laborales;
create policy permisos_laborales_insert on public.permisos_laborales for insert to authenticated
  with check (persona_id = auth.uid());
drop policy if exists permisos_laborales_update on public.permisos_laborales;
create policy permisos_laborales_update on public.permisos_laborales for update to authenticated
  using (persona_id = auth.uid() or fn_rrhh_ve_todo() or fn_es_aprobador_rrhh('permisos'))
  with check (persona_id = auth.uid() or fn_rrhh_ve_todo() or fn_es_aprobador_rrhh('permisos'));

alter table public.abonos enable row level security;
drop policy if exists abonos_select on public.abonos;
create policy abonos_select on public.abonos for select to authenticated
  using (persona_id = auth.uid() or fn_rrhh_ve_todo() or fn_es_aprobador_rrhh('abonos'));
drop policy if exists abonos_insert on public.abonos;
create policy abonos_insert on public.abonos for insert to authenticated
  with check (persona_id = auth.uid());
-- RRHH ve los abonos pero no los modifica: solo el dueño y el aprobador.
drop policy if exists abonos_update on public.abonos;
create policy abonos_update on public.abonos for update to authenticated
  using (persona_id = auth.uid() or fn_es_aprobador_rrhh('abonos'))
  with check (persona_id = auth.uid() or fn_es_aprobador_rrhh('abonos'));

alter table public.certificados_emitidos enable row level security;
drop policy if exists certificados_emitidos_select on public.certificados_emitidos;
create policy certificados_emitidos_select on public.certificados_emitidos for select to authenticated
  using (fn_rrhh_ve_todo());
drop policy if exists certificados_emitidos_insert on public.certificados_emitidos;
create policy certificados_emitidos_insert on public.certificados_emitidos for insert to authenticated
  with check (fn_rrhh_ve_todo() and emitido_por = auth.uid());

-- ============================================================ 8) Storage: soportes de RRHH
-- Bucket privado. Rutas: gastos/{gasto_id}/archivo y abonos/{abono_id}/archivo.
-- Sin update ni delete: lo subido no se reemplaza ni se borra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rrhh-soportes', 'rrhh-soportes', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fn_rrhh_id_de_ruta(p_nombre text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (string_to_array(p_nombre, '/'))[2]::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.fn_rrhh_soporte_visible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case split_part(p_nombre, '/', 1)
    when 'gastos' then exists (select 1 from gastos g where g.id = fn_rrhh_id_de_ruta(p_nombre)
                               and (g.persona_id = auth.uid() or fn_rrhh_ve_todo()))
    when 'abonos' then exists (select 1 from abonos a where a.id = fn_rrhh_id_de_ruta(p_nombre)
                               and (a.persona_id = auth.uid() or fn_rrhh_ve_todo() or fn_es_aprobador_rrhh('abonos')))
    else false
  end;
$$;

-- Gasto: su dueño, mientras se pueda editar. Abono: el aprobador, antes del desembolso y
-- nunca sobre el suyo.
create or replace function public.fn_rrhh_soporte_subible(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case split_part(p_nombre, '/', 1)
    when 'gastos' then exists (select 1 from gastos g where g.id = fn_rrhh_id_de_ruta(p_nombre)
                               and g.persona_id = auth.uid() and g.estado <> 'anulado' and g.reembolsado_en is null)
    when 'abonos' then exists (select 1 from abonos a where a.id = fn_rrhh_id_de_ruta(p_nombre)
                               and a.estado in ('solicitado', 'aprobado') and a.persona_id <> auth.uid()
                               and fn_es_aprobador_rrhh('abonos'))
    else false
  end;
$$;

drop policy if exists rrhh_soportes_select on storage.objects;
create policy rrhh_soportes_select on storage.objects for select to authenticated
  using (bucket_id = 'rrhh-soportes' and fn_rrhh_soporte_visible(name));
drop policy if exists rrhh_soportes_insert on storage.objects;
create policy rrhh_soportes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rrhh-soportes' and fn_rrhh_soporte_subible(name));

-- ============================================================ 9) privilegios de funciones
do $$
declare
  f text;
  usuario text[] := array[
    'fn_rrhh_ve_todo()', 'fn_es_aprobador_rrhh(text)', 'fn_proyectos_del_tecnico()',
    'fn_proyectos_para_rrhh()', 'fn_personas_rrhh()', 'fn_permiso_fecha_bloqueada(text, date)',
    'fn_rrhh_id_de_ruta(text)', 'fn_rrhh_soporte_visible(text)', 'fn_rrhh_soporte_subible(text)'
  ];
  disparadores text[] := array[
    'fn_gastos_reglas()', 'fn_permisos_reglas()', 'fn_abonos_reglas()', 'fn_certificados_inmutable()'
  ];
begin
  foreach f in array usuario loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array disparadores loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- CRM — pipeline de oportunidades, parte 1: ESQUEMA. Aprobado por Jhojan 2026-09-29.
--
-- La oportunidad (el negocio) es la tarjeta del pipeline; la cotización es un documento
-- que cuelga de ella. Los estados de `cotizaciones` (BORRADOR/ENVIADA/APROBADA/RECHAZADA)
-- NO se tocan: la etapa del pipeline es una capa encima, no un duplicado.
--
-- Dos pipelines en una sola tabla (`tipo_pipeline`):
--   proyecto_nuevo: Solicitud → Visita técnica → Go/No-Go → Cotización en elaboración →
--     Cotización enviada → Sustentación y negociación → En instancia de decisión →
--     Aprobada-legalización → Ganada | Perdida
--   renovacion: Renovación próxima → Propuesta enviada → En aprobación →
--     Renovada | No renovada
-- (La creación automática de renovaciones 90 días antes del vencimiento va en una
-- migración aparte: necesita la fecha de vencimiento del contrato de mantenimiento.)
--
-- "Aplazada" NO es etapa: es el `estado` paralelo (activa / aplazada / cerrada), que
-- conserva la etapa y exige fecha de reactivación. "Ejecución" tampoco: es otro módulo.
--
-- El historial (fecha de entrada y salida de cada etapa, con el estado y el valor del
-- negocio en ese momento) lo escriben los triggers, nunca la app: es la base de todo el
-- análisis futuro (dónde se mueren los negocios, tiempo de cierre, conversión), así que
-- nadie lo puede editar a mano.
--
-- Idempotente: se puede correr más de una vez.

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type tipo_pipeline as enum ('proyecto_nuevo', 'renovacion');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type estado_oportunidad as enum ('activa', 'aplazada', 'cerrada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type via_aprobacion as enum ('administrador', 'consejo', 'asamblea');
exception when duplicate_object then null;
end $$;

-- Los 11 motivos aprobados por Jhojan. Lista cerrada a propósito (no texto libre):
-- sin categorías fijas no se puede contar "cuántas perdimos por precio".
do $$ begin
  create type motivo_perdida as enum (
    'precio_oferta_mas_economica',   -- Precio: perdimos contra oferta más económica
    'precio_sin_presupuesto',        -- Precio: el cliente no tenía presupuesto
    'competidor_alcance_tecnico',    -- Competidor ganó por alcance o especificación técnica
    'competidor_relacion_previa',    -- Competidor ganó por relación previa o recomendación interna
    'sin_decision_organo',           -- No hubo decisión: el órgano no se reunió o no llegó a acuerdo
    'aplazado_cancelado_cliente',    -- Proyecto aplazado o cancelado por el cliente
    'expensa_no_aprobada',           -- No se aprobó la expensa extraordinaria
    'fuera_de_capacidad',            -- Alcance fuera de nuestra capacidad o especialidad
    'no_go_decision_propia',         -- No cotizamos: decisión propia (No-Go)
    'cliente_no_responde',           -- Cliente dejó de responder
    'otro'                           -- Otro (texto obligatorio)
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type tipo_contacto as enum ('llamada', 'whatsapp', 'correo', 'visita', 'reunion');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- etapas_config
-- Las etapas son datos, no código: nombres, orden y umbrales de alerta se ajustan acá.
--   dias_alerta:    días en la etapa a partir de los cuales el sistema avisa (amarillo)
--   dias_estancada: días a partir de los cuales el negocio se considera estancado (rojo)
--   resultado:      solo en las etapas de cierre ('ganada' / 'perdida')
create table if not exists etapas_config (
  id text primary key,
  tipo_pipeline tipo_pipeline not null,
  nombre text not null,
  orden int not null,
  dias_alerta int check (dias_alerta is null or dias_alerta > 0),
  dias_estancada int check (dias_estancada is null or dias_estancada > 0),
  resultado text check (resultado in ('ganada', 'perdida')),
  unique (tipo_pipeline, id),
  check (dias_alerta is null or dias_estancada is null or dias_estancada >= dias_alerta),
  check (resultado is null or (dias_alerta is null and dias_estancada is null))
);

-- Umbrales iniciales: propuesta para que Jhojan los ajuste con el uso. Los de
-- "En instancia de decisión" son largos a propósito: consejo y asamblea se reúnen poco.
-- Al volver a correr la migración se actualizan nombre/orden, pero NO se pisan los
-- días que Jhojan ya haya ajustado.
insert into etapas_config (id, tipo_pipeline, nombre, orden, dias_alerta, dias_estancada, resultado) values
  ('solicitud',                   'proyecto_nuevo', 'Solicitud',                   1,  2,  5, null),
  ('visita_tecnica',              'proyecto_nuevo', 'Visita técnica',              2,  5, 10, null),
  ('go_no_go',                    'proyecto_nuevo', 'Go / No-Go',                  3,  2,  5, null),
  ('cotizacion_elaboracion',      'proyecto_nuevo', 'Cotización en elaboración',   4,  5, 10, null),
  ('cotizacion_enviada',          'proyecto_nuevo', 'Cotización enviada',          5,  7, 21, null),
  ('sustentacion_negociacion',    'proyecto_nuevo', 'Sustentación y negociación',  6, 10, 21, null),
  ('instancia_decision',          'proyecto_nuevo', 'En instancia de decisión',    7, 30, 60, null),
  ('aprobada_legalizacion',       'proyecto_nuevo', 'Aprobada — legalización',     8, 10, 20, null),
  ('ganada',                      'proyecto_nuevo', 'Ganada',                      9, null, null, 'ganada'),
  ('perdida',                     'proyecto_nuevo', 'Perdida',                    10, null, null, 'perdida'),
  ('renovacion_proxima',          'renovacion',     'Renovación próxima',          1, 15, 30, null),
  ('renovacion_propuesta_enviada','renovacion',     'Propuesta enviada',           2,  7, 21, null),
  ('renovacion_en_aprobacion',    'renovacion',     'En aprobación',               3, 20, 45, null),
  ('renovada',                    'renovacion',     'Renovada',                    4, null, null, 'ganada'),
  ('no_renovada',                 'renovacion',     'No renovada',                 5, null, null, 'perdida')
on conflict (id) do update set
  tipo_pipeline = excluded.tipo_pipeline,
  nombre = excluded.nombre,
  orden = excluded.orden,
  resultado = excluded.resultado;

-- ---------------------------------------------------------------- oportunidades
create table if not exists oportunidades (
  id uuid primary key default gen_random_uuid(),
  tipo_pipeline tipo_pipeline not null default 'proyecto_nuevo',
  nombre text not null,                                   -- ej. "CCTV perimetral Tintal II"
  cliente_id uuid not null references clientes (id),
  etapa_id text not null,
  estado estado_oportunidad not null default 'activa',
  fecha_reactivacion date,                                -- obligatoria si está aplazada

  -- Valor antes de que exista cotización. Con cotización, manda el total de la cotización
  -- (el historial guarda el que corresponda en cada momento).
  valor_estimado numeric(14,2) check (valor_estimado is null or valor_estimado >= 0),
  cotizacion_id uuid references cotizaciones (id) on delete set null,   -- versión vigente
  proyecto_id uuid references proyectos (id) on delete set null,        -- ganada → proyecto; renovación → proyecto que se renueva

  -- Pronóstico real en propiedad horizontal: quién decide y cuándo. Si requiere expensa
  -- extraordinaria, normalmente pasa por asamblea y la decisión se corre de fecha.
  via_aprobacion via_aprobacion,
  requiere_expensa_extraordinaria boolean,                -- null = todavía no se sabe
  fecha_estimada_decision date,

  responsable_id uuid references auth.users (id) default auth.uid(),  -- quién la trabaja

  -- Cierre. `etapa_al_perder` y `fecha_cierre` los pone el trigger, no la app.
  motivo_perdida motivo_perdida,
  motivo_perdida_detalle text,
  competidor_ganador text,                                -- quién ganó, cuando se sepa
  etapa_al_perder text references etapas_config (id),
  fecha_cierre timestamptz,

  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- La etapa tiene que ser de SU pipeline (una renovación no puede estar en "Go/No-Go").
  foreign key (tipo_pipeline, etapa_id) references etapas_config (tipo_pipeline, id),
  check (estado <> 'aplazada' or fecha_reactivacion is not null),
  check (etapa_id not in ('perdida', 'no_renovada') or motivo_perdida is not null),
  check (motivo_perdida is distinct from 'otro' or nullif(trim(motivo_perdida_detalle), '') is not null)
);

create index if not exists idx_oportunidades_estado_etapa on oportunidades (estado, etapa_id);
create index if not exists idx_oportunidades_cliente on oportunidades (cliente_id);
create index if not exists idx_oportunidades_decision on oportunidades (fecha_estimada_decision)
  where estado = 'activa';
create index if not exists idx_oportunidades_reactivacion on oportunidades (fecha_reactivacion)
  where estado = 'aplazada';

drop trigger if exists trg_oportunidades_updated_at on oportunidades;
create trigger trg_oportunidades_updated_at
  before update on oportunidades
  for each row execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------- historial
-- Una fila por período: cada vez que cambia la etapa O el estado (activa/aplazada/
-- cerrada) se cierra la fila abierta (fecha_salida) y se abre otra. Así el análisis
-- puede medir tiempo por etapa descontando los períodos en que el negocio estuvo aplazado.
create table if not exists oportunidad_etapas_historial (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidades (id) on delete cascade,
  etapa_id text not null references etapas_config (id),
  estado estado_oportunidad not null,
  fecha_entrada timestamptz not null default now(),
  fecha_salida timestamptz,                               -- null = período actual
  valor numeric(14,2),                                    -- valor del negocio al entrar
  usuario_id uuid references auth.users (id),             -- quién lo movió
  check (fecha_salida is null or fecha_salida >= fecha_entrada)
);

create index if not exists idx_historial_oportunidad on oportunidad_etapas_historial (oportunidad_id, fecha_entrada);
create unique index if not exists uq_historial_un_periodo_abierto
  on oportunidad_etapas_historial (oportunidad_id) where fecha_salida is null;

-- ---------------------------------------------------------------- contactos
-- Seguimientos del negocio: los hechos (fecha_realizada) y los programados
-- (fecha_programada sin realizar = tarea pendiente). Un negocio activo sin ningún
-- contacto programado es exactamente el que se cae por olvido: eso se alerta.
create table if not exists oportunidad_contactos (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidades (id) on delete cascade,
  tipo tipo_contacto not null default 'llamada',
  con_quien text,                                         -- ej. "Administradora", "Presidente del consejo"
  nota text,
  fecha_programada date,
  fecha_realizada timestamptz,
  usuario_id uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (fecha_programada is not null or fecha_realizada is not null)
);

create index if not exists idx_contactos_oportunidad on oportunidad_contactos (oportunidad_id, created_at);
create index if not exists idx_contactos_pendientes on oportunidad_contactos (fecha_programada)
  where fecha_realizada is null;

-- ---------------------------------------------------------------- triggers
-- ANTES de guardar: coherencia entre etapa y estado, y datos del cierre.
create or replace function fn_oportunidad_antes_guardar()
returns trigger
language plpgsql
as $$
declare
  v_resultado text;
begin
  select resultado into v_resultado from etapas_config where id = new.etapa_id;

  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
    if v_resultado is not null then
      -- Entró a Ganada/Perdida (o Renovada/No renovada): se cierra.
      new.estado := 'cerrada';
      new.fecha_cierre := now();
      if v_resultado = 'perdida' and tg_op = 'UPDATE' then
        new.etapa_al_perder := old.etapa_id;             -- dónde se murió el negocio
      end if;
    elsif tg_op = 'UPDATE' and old.estado = 'cerrada' then
      -- Reabierta (se equivocaron al cerrarla): vuelve a activa sin rastros del cierre.
      -- El cierre anterior queda igual en el historial.
      new.estado := 'activa';
      new.fecha_cierre := null;
      new.etapa_al_perder := null;
      new.motivo_perdida := null;
      new.motivo_perdida_detalle := null;
      new.competidor_ganador := null;
    end if;
  end if;

  if v_resultado is not null and new.estado <> 'cerrada' then
    raise exception 'Una oportunidad en etapa de cierre no puede estar activa ni aplazada';
  end if;
  if v_resultado is null and new.estado = 'cerrada' then
    raise exception 'Una oportunidad solo se cierra moviéndola a una etapa de cierre (Ganada o Perdida)';
  end if;
  if new.estado <> 'aplazada' then
    new.fecha_reactivacion := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_oportunidades_antes_guardar on oportunidades;
create trigger trg_oportunidades_antes_guardar
  before insert or update on oportunidades
  for each row execute function fn_oportunidad_antes_guardar();

-- DESPUÉS de guardar: historial. security definer porque la app no tiene permiso de
-- escritura sobre el historial (ver RLS abajo): solo este trigger lo escribe.
create or replace function fn_oportunidad_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric;
begin
  if tg_op = 'UPDATE'
     and new.etapa_id is not distinct from old.etapa_id
     and new.estado is not distinct from old.estado then
    return null;
  end if;

  select coalesce(
    (select t.total_cotizacion from v_cotizacion_totales_iva t where t.cotizacion_id = new.cotizacion_id),
    new.valor_estimado
  ) into v_valor;

  update oportunidad_etapas_historial
     set fecha_salida = now()
   where oportunidad_id = new.id and fecha_salida is null;

  insert into oportunidad_etapas_historial (oportunidad_id, etapa_id, estado, fecha_entrada, valor, usuario_id)
  values (new.id, new.etapa_id, new.estado, now(), v_valor, auth.uid());

  return null;
end;
$$;

drop trigger if exists trg_oportunidades_historial on oportunidades;
create trigger trg_oportunidades_historial
  after insert or update on oportunidades
  for each row execute function fn_oportunidad_historial();

-- ---------------------------------------------------------------- RLS
-- Mismo criterio que el resto de Comercial mientras la Fase 2b (RLS por rol) sigue
-- pendiente por decisión de Jhojan: cualquier usuario autenticado. Excepciones:
--   - historial: solo lectura para la app (lo escribe el trigger).
--   - etapas_config: leer cualquiera; cambiar umbrales, solo responsables de Comercial.
alter table etapas_config enable row level security;
drop policy if exists etapas_config_select on etapas_config;
create policy etapas_config_select on etapas_config for select to authenticated using (true);
drop policy if exists etapas_config_write on etapas_config;
create policy etapas_config_write on etapas_config for all to authenticated
  using (fn_tiene_permiso('comercial', 'responsable'))
  with check (fn_tiene_permiso('comercial', 'responsable'));

alter table oportunidades enable row level security;
drop policy if exists oportunidades_authenticated_all on oportunidades;
create policy oportunidades_authenticated_all on oportunidades for all to authenticated
  using (true) with check (true);

alter table oportunidad_contactos enable row level security;
drop policy if exists oportunidad_contactos_authenticated_all on oportunidad_contactos;
create policy oportunidad_contactos_authenticated_all on oportunidad_contactos for all to authenticated
  using (true) with check (true);

alter table oportunidad_etapas_historial enable row level security;
drop policy if exists oportunidad_etapas_historial_select on oportunidad_etapas_historial;
create policy oportunidad_etapas_historial_select on oportunidad_etapas_historial for select to authenticated
  using (true);

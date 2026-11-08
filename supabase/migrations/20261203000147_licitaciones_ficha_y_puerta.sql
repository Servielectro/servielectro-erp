-- Licitaciones: la ficha, las etapas de Jhojan y la puerta GO/NO-GO (2026-11-07).
--
-- Pedido de Jhojan: «cuando dé click en una licitación, entre a la ficha y veamos resumen, qué
-- piden, los pliegos, cuantía, ciudad, resumen operativo, fechas... y de ahí miramos si aprobamos
-- para que el motor empiece a hacer la gestión documental».
-- Fuente: Plan_Maestro_Licitaciones_SECOP_II_Servielectro.xlsx, hoja 00_Proceso_Estandar (las 11
-- etapas con su puerta de control) y T10_Historicos, punto T10-09 (guardar la razón del GO/NO-GO
-- para calibrar después).
--
-- ------------------------------------------------------------------ etapas ↔ licitaciones.estado
-- licitaciones.estado es de Jhojan (drift). Su CHECK ya traía 9 de las 11 etapas; se AGREGAN las dos
-- que faltaban y no se quita ni se renombra nada:
--    1 Planeada                 planeada            ← nuevo
--    2 Detectada                detectada           (el radar: calzó la actividad)
--    3 Prefiltrada              prefiltrada         (el radar: además es relevante; ver abajo)
--    4 Comité GO/NO-GO          comite_go_nogo      ← la puerta de esta migración
--    5 En preparación           en_preparacion      (a donde lleva el GO)
--    6 En análisis              en_analisis
--    7 Preparación de oferta    preparacion_oferta  ← nuevo
--    8 Lista para revisión      lista_revision
--    9 Presentada               presentada
--   10 En evaluación            en_evaluacion
--   11 Adjudicada / No adjud.   adjudicada / no_adjudicada
-- Valores que ya existían fuera de las 11 y se conservan: descartada (a donde lleva el NO-GO; su
-- CHECK exige motivo_descarte), pendiente_info, aprobada_participar, cancelada, cerrada.
-- (v_licitaciones_nuevas de Jhojan filtra estado = 'nueva', que su propio CHECK no admite: se deja.)
--
-- ------------------------------------------------------------------ la puerta (etapa 4)
-- Aprobar (GO) o descartar (NO-GO) es una DECISIÓN registrada: quién, cuándo y por qué (razón
-- obligatoria en los dos sentidos), con la foto de lo que se sabía al decidir (criterios, línea,
-- palabras que calzaron, RUP…). Ese registro es lo que después enseña qué descartar.
-- Solo quien es responsable de licitaciones/oportunidades decide. Ver no es aprobar.
-- La base impide saltarse la puerta: un proceso no sale de las etapas 1-4 (ni vuelve de
-- descartada) sin una decisión registrada en la misma transacción. Ni la app ni un UPDATE a mano.
-- LÍMITE: el GO NO presenta ni firma nada. Pasa a «En preparación» y dispara la preparación
-- documental. «Presentación final siempre humana.» «No saltar puertas de control.»
--
-- ------------------------------------------------------------------ documentos (dmgg-8hin)
-- Datos Abiertos «SECOP II - Archivos Descarga Historico 2026» (dmgg-8hin), verificado el
-- 2026-11-07: una fila por archivo, ligada por `proceso` = id_del_portafolio de p6dx (CO1.BDOS…,
-- NO el id_del_proceso CO1.REQ…). Trae nombre, extensión, tamaño, fecha de carga, número de
-- contrato si es del contrato, y url_descarga_documento. NO trae el tipo de documento: pliego,
-- anexo o formulario se deducen del NOMBRE del archivo (tipo_deducido = true) y una persona puede
-- corregirlo. La descarga automática del archivo la rechaza el portal de SECOP (403 de su
-- firewall): por ahora se guarda la referencia y el enlace, sin el archivo (path null).

-- ============================================================ 0) guardas
do $$
declare v text;
begin
  if to_regprocedure('public.fn_licitacion_es_relevante(text[],numeric)') is null
     or to_regclass('public.licitacion_documentos') is null then
    raise exception 'Primero la migración 143.';
  end if;
  select pg_get_constraintdef(oid) into v from pg_constraint
   where conrelid = 'public.licitaciones'::regclass and conname = 'licitaciones_estado_check';
  if v is null or v !~ 'comite_go_nogo' or v !~ 'en_preparacion' or v !~ 'descartada' or v !~ 'prefiltrada' or v !~ 'detectada' then
    raise exception 'licitaciones_estado_check no es el que se esperaba: %', coalesce(v, '(no existe)');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.licitaciones'::regclass and conname = 'licitaciones_descarte') then
    raise exception 'Falta licitaciones_descarte (descartada exige motivo): la puerta cuenta con él.';
  end if;
  -- Estados que hay hoy y que el CHECK nuevo tiene que seguir admitiendo.
  select string_agg(distinct estado, ', ') into v from public.licitaciones
   where estado not in ('planeada', 'detectada', 'prefiltrada', 'comite_go_nogo', 'en_preparacion', 'en_analisis',
                        'preparacion_oferta', 'lista_revision', 'presentada', 'en_evaluacion', 'adjudicada',
                        'no_adjudicada', 'descartada', 'pendiente_info', 'aprobada_participar', 'cancelada', 'cerrada');
  if v is not null then
    raise exception 'Hay estados que el CHECK nuevo no admitiría: %.', v;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perfiles' and column_name = 'id')
     is not true then
    raise exception 'Falta perfiles.id.';
  end if;
end $$;

-- ============================================================ 1) etapas
alter table public.licitaciones drop constraint licitaciones_estado_check;
alter table public.licitaciones add constraint licitaciones_estado_check check (estado in (
  'planeada', 'detectada', 'prefiltrada', 'comite_go_nogo', 'en_preparacion', 'en_analisis', 'preparacion_oferta',
  'lista_revision', 'presentada', 'en_evaluacion', 'adjudicada', 'no_adjudicada',
  -- los que ya existían fuera de las 11 etapas
  'descartada', 'pendiente_info', 'aprobada_participar', 'cancelada', 'cerrada'));
comment on column public.licitaciones.estado is
  'Etapa (Plan Maestro, 00_Proceso_Estandar): planeada 1, detectada 2, prefiltrada 3, comite_go_nogo 4, en_preparacion 5, en_analisis 6, preparacion_oferta 7, lista_revision 8, presentada 9, en_evaluacion 10, adjudicada/no_adjudicada 11. Además: descartada (NO-GO; exige motivo_descarte), pendiente_info, aprobada_participar, cancelada, cerrada. Salir de 1-4 exige decisión GO/NO-GO registrada (licitacion_decisiones).';

-- Etapa 3, la marca el radar: lo relevante pasa a prefiltrada, y vuelve a detectada si deja de serlo
-- (al cambiar los criterios). Solo mueve entre esas dos: desde el comité en adelante decide una persona.
create or replace function public.fn_licitaciones_prefiltro()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.secop is not null and new.estado in ('detectada', 'prefiltrada') then
    new.estado := case when fn_licitacion_es_relevante(new.criterios_que_coinciden, new.afinidad)
                       then 'prefiltrada' else 'detectada' end;
  end if;
  return new;
end $$;
drop trigger if exists trg_licitaciones_prefiltro on public.licitaciones;
create trigger trg_licitaciones_prefiltro
  before insert or update of afinidad, criterios_que_coinciden on public.licitaciones
  for each row execute function public.fn_licitaciones_prefiltro();

-- Relleno: lo que ya trajo el radar.
update public.licitaciones
   set estado = 'prefiltrada'
 where secop is not null and estado = 'detectada'
   and public.fn_licitacion_es_relevante(criterios_que_coinciden, afinidad);

-- ============================================================ 2) qué hizo calzar la actividad
-- Las palabras o códigos que calzaron, para poder desconfiar de un calce por palabra. Mismo
-- cálculo de fn_licitacion_relevancia (143). Con la RLS de quien consulta.
create or replace function public.fn_licitacion_calces(p_licitacion uuid)
returns table (tipo text, valor text, nombre text, linea text)
language sql stable set search_path = public as $$
  with l as (
    select secop,
           coalesce(secop ->> 'codigo_principal_de_categoria', '') || ' ' || coalesce(secop ->> 'categorias_adicionales', '') as codigos,
           coalesce(secop ->> 'nombre_del_procedimiento', '') || ' ' || coalesce(secop ->> 'descripci_n_del_procedimiento', '') as texto
    from licitaciones where id = p_licitacion and secop is not null
  ), clases as (
    select array(select distinct left(m[1], 6) from l, regexp_matches(l.codigos, '(\d{8})', 'g') m where left(m[1], 6) <> '801116') c
  )
  select c.tipo, c.valor, c.nombre, c.linea
  from licitacion_criterios c, l, clases
  where c.activo and (
        (l.codigos ~ '\d{8}' and c.tipo = 'categoria' and left(regexp_replace(c.valor, '\D', '', 'g'), 6) = any (clases.c))
     or (l.codigos !~ '\d{8}' and c.tipo = 'palabra' and fn_licitacion_palabra_calza(l.texto, c.valor)))
  order by c.linea nulls last, c.valor;
$$;
revoke all on function public.fn_licitacion_calces(uuid) from public, anon;
grant execute on function public.fn_licitacion_calces(uuid) to authenticated, service_role;

-- ============================================================ 3) el registro de decisiones (T10-09)
create table if not exists public.licitacion_decisiones (
  id             uuid primary key default gen_random_uuid(),
  licitacion_id  uuid not null references public.licitaciones (id) on delete restrict,
  decision       text not null check (decision in ('go', 'no_go')),
  razon          text not null check (length(trim(razon)) >= 15),
  decidida_por   uuid not null references public.perfiles (id),
  decidida_en    timestamptz not null default now(),
  estado_antes   text not null,
  estado_despues text not null,
  -- Lo que se sabía al decidir (para calibrar: qué criterios, qué línea, qué palabra, RUP…).
  contexto       jsonb not null check (jsonb_typeof(contexto) = 'object')
);
create index if not exists idx_licitacion_decisiones on public.licitacion_decisiones (licitacion_id, decidida_en desc);
comment on table public.licitacion_decisiones is
  'Puerta GO/NO-GO (etapa 4): cada decisión con quién, cuándo, por qué y lo que se sabía. Solo se escribe con fn_licitacion_decidir y no se edita ni se borra: es lo que después enseña qué descartar (Plan Maestro T10-09).';

-- No se edita ni se borra: es el histórico.
create or replace function public.fn_licitacion_decisiones_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Las decisiones GO/NO-GO no se editan ni se borran: son el histórico. Para cambiar, se registra otra decisión.';
end $$;
drop trigger if exists trg_licitacion_decisiones_inmutable on public.licitacion_decisiones;
create trigger trg_licitacion_decisiones_inmutable
  before update or delete on public.licitacion_decisiones
  for each row execute function public.fn_licitacion_decisiones_inmutable();

alter table public.licitacion_decisiones enable row level security;
drop policy if exists licitacion_decisiones_ver on public.licitacion_decisiones;
create policy licitacion_decisiones_ver on public.licitacion_decisiones for select to authenticated
  using (public.fn_permiso_seccion('licitaciones', 'oportunidades') is not null);
-- Sin políticas de escritura: solo fn_licitacion_decidir (security definer) escribe.
revoke all on public.licitacion_decisiones from anon, authenticated;
grant select on public.licitacion_decisiones to authenticated;

-- ============================================================ 4) la puerta en la base
-- Salir de las etapas 1-4 (o volver de descartada) exige una decisión registrada en ESTA
-- transacción que lleve justo a ese estado. now() es la hora de inicio de la transacción: solo
-- fn_licitacion_decidir la cumple. Volver de descartada al comité no la exige (se vuelve a decidir).
create or replace function public.fn_licitaciones_puerta()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado is distinct from old.estado
     and (old.estado in ('planeada', 'detectada', 'prefiltrada', 'comite_go_nogo', 'descartada'))
     and new.estado not in ('planeada', 'detectada', 'prefiltrada', 'comite_go_nogo')
     and not exists (select 1 from licitacion_decisiones d
                     where d.licitacion_id = new.id and d.decidida_en = now() and d.estado_despues = new.estado) then
    raise exception 'Para pasar de «%» a «%» hay que decidir en el comité GO/NO-GO (con la razón). No se saltan puertas de control.',
      old.estado, new.estado using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_licitaciones_puerta on public.licitaciones;
create trigger trg_licitaciones_puerta
  before update of estado on public.licitaciones
  for each row execute function public.fn_licitaciones_puerta();

-- La decisión. GO → en_preparacion (etapa 5). NO-GO → descartada, con la razón como motivo.
-- Desde: detectada, prefiltrada o comite_go_nogo. Un GO también puede rescatar una descartada.
create or replace function public.fn_licitacion_decidir(p_licitacion uuid, p_decision text, p_razon text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  l record; r record;
  v_nuevo text; v_razon text := trim(coalesce(p_razon, ''));
  v_calces jsonb;
begin
  if v_uid is null then
    raise exception 'La decisión la toma una persona con sesión.';
  end if;
  if not coalesce(fn_tiene_permiso_seccion('licitaciones', 'oportunidades', 'responsable'), false) then
    raise exception 'Aprobar o descartar es de quien es responsable de Oportunidades. Ver no es aprobar.';
  end if;
  if p_decision not in ('go', 'no_go') then
    raise exception 'La decisión es go o no_go.';
  end if;
  if length(v_razon) < 15 then
    raise exception 'Escriba por qué (al menos 15 letras): esa razón es lo que después enseña qué descartar.';
  end if;

  select * into l from licitaciones where id = p_licitacion for update;
  if not found then
    raise exception 'Esa licitación no existe.';
  end if;
  if not (l.estado in ('detectada', 'prefiltrada', 'comite_go_nogo') or (p_decision = 'go' and l.estado = 'descartada')) then
    raise exception 'La licitación está en «%»: la puerta GO/NO-GO ya quedó atrás.', l.estado;
  end if;
  v_nuevo := case p_decision when 'go' then 'en_preparacion' else 'descartada' end;

  select coalesce(jsonb_agg(jsonb_build_object('tipo', c.tipo, 'valor', c.valor, 'linea', c.linea)), '[]') into v_calces
    from fn_licitacion_calces(p_licitacion) c;
  select * into r from v_licitaciones_radar where id = p_licitacion;

  insert into licitacion_decisiones (licitacion_id, decision, razon, decidida_por, estado_antes, estado_despues, contexto)
  values (p_licitacion, p_decision, v_razon, v_uid, l.estado, v_nuevo, jsonb_build_object(
    'afinidad', l.afinidad, 'criterios', l.criterios_que_coinciden, 'faltantes', r.criterios_faltantes,
    'lineas', l.lineas_que_calzaron, 'actividad_por', l.actividad_por, 'calces', v_calces,
    'requiere_rup', l.requiere_rup, 'modalidad', l.modalidad, 'tipo_contrato', l.tipo_contrato,
    'ciudad', l.ciudad, 'departamento', l.departamento, 'presupuesto', l.precio_base,
    'cierra_en', r.cierra_en, 'dias_publicado_al_traer', l.dias_publicado_al_traer,
    'documentos', (select count(*) from licitacion_documentos where licitacion_id = p_licitacion)));

  update licitaciones
     set estado = v_nuevo,
         motivo_descarte = case when p_decision = 'no_go' then v_razon else motivo_descarte end,
         revisado_por = v_uid, revisado_en = now()
   where id = p_licitacion;
  return v_nuevo;
end $$;
revoke all on function public.fn_licitacion_decidir(uuid, text, text) from public, anon;
grant execute on function public.fn_licitacion_decidir(uuid, text, text) to authenticated;

-- ============================================================ 5) documentos de SECOP (dmgg-8hin)
alter table public.licitacion_documentos
  add column if not exists secop_id_documento bigint,
  add column if not exists secop_contrato     text,
  add column if not exists extension          text,
  add column if not exists tamano_secop       bigint,
  add column if not exists cargado_en_secop   date,
  add column if not exists tipo_deducido      boolean not null default false;
comment on column public.licitacion_documentos.secop_id_documento is 'id_documento de dmgg-8hin. Con él, traer la lista otra vez no duplica.';
comment on column public.licitacion_documentos.secop_contrato is 'n_mero_de_contrato de dmgg-8hin: si viene, el documento es del CONTRATO (el proceso ya se contrató).';
comment on column public.licitacion_documentos.tipo_deducido is 'true = el tipo se dedujo del nombre del archivo (SECOP no lo dice). Una persona lo corrige y queda false.';

do $$
declare r record;
begin
  -- El CHECK de tipo se amplía (formulario, ejecucion); se busca por definición, no por nombre.
  for r in select conname from pg_constraint
           where conrelid = 'public.licitacion_documentos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ '\mtipo\M'
  loop
    execute format('alter table public.licitacion_documentos drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.licitacion_documentos'::regclass and conname = 'licitacion_documentos_secop_uk') then
    alter table public.licitacion_documentos add constraint licitacion_documentos_secop_uk unique (licitacion_id, secop_id_documento);
  end if;
end $$;
alter table public.licitacion_documentos add constraint licitacion_documentos_tipo_check
  check (tipo in ('pliego', 'invitacion', 'estudios_previos', 'anexo_tecnico', 'matriz_riesgos', 'adenda',
                  'aviso_convocatoria', 'formulario', 'ejecucion', 'otro'));
-- 'ejecucion' = contrato, acta de inicio, aceptación de la oferta, orden de compra, designación de
-- supervisor: si aparecen, el proceso probablemente ya se contrató (pasa en régimen especial: SECOP
-- lo publica «Abierto» y con los documentos del contrato ya cargados).

-- ============================================================ 6) la lista del radar: + estado
create or replace view public.v_licitaciones_radar
with (security_invoker = true) as
-- Las columnas descriptivas son las de Jhojan (el barrido las llena desde SECOP; una fila cargada a
-- mano, como la de la Policía, trae las suyas).
select l.id, l.id_del_proceso,
       l.entidad, l.departamento, l.ciudad,
       coalesce(l.descripcion, l.nombre)                 as objeto,
       l.modalidad, l.tipo_contrato,
       l.precio_base                                     as presupuesto,
       case when l.secop ->> 'fecha_de_recepcion_de' ~ '^\d{4}-\d{2}-\d{2}'
            then (l.secop ->> 'fecha_de_recepcion_de')::timestamp end as cierra_en,   -- hora de Colombia
       l.url                                             as url_secop,
       l.publicado_en, l.traida_en, l.dias_publicado_al_traer,
       l.requiere_rup, l.afinidad,
       l.criterios_que_coinciden,
       case when l.secop is null or l.criterios_que_coinciden is null then null else
         array(select c from unnest(array['actividad', 'modalidad', 'tipo_contrato', 'presupuesto', 'ubicacion']) with ordinality u(c, o)
               where c <> all (l.criterios_que_coinciden) order by o) end as criterios_faltantes,
       l.actividad_por,
       l.lineas_que_calzaron,
       l.semaforo,
       case when l.secop is not null then public.fn_licitacion_es_relevante(l.criterios_que_coinciden, l.afinidad) end as relevante,
       case when l.secop is null then 'manual' else 'secop_ii_datos_abiertos' end as origen,
       l.estado
from public.licitaciones l;

-- Plan anual de trabajo del SG-SST sobre los 60 estándares mínimos de la Resolución 0312 de 2019.
-- Escrita y aplicada por el orquestador (2026-10-29). Idempotente.
--
-- De dónde sale la estructura: de la propia carpeta de Drive de Servielectro. Está organizada por
-- ciclo PHVA con una carpeta por estándar, nombrada con su número — 22 en PLANEAR, 30 en HACER,
-- 4 en VERIFICAR, 4 en ACTUAR. Son 60, que es exactamente el juego del artículo 16 de la
-- resolución. No se inventó la estructura: se está leyendo la que ya usan.
--
-- Pedido de Jhojan (2026-10-29): "monta la estructura del plan de trabajo... que cada estándar se
-- le pueda asociar un formato que se suba después para darle cumplimiento a ese item."
--   - El formato que da cumplimiento ESPERADO va en sst_estandar_plantillas (abajo).
--   - La evidencia REAL ya tiene dónde ir: sst_plan_evidencias trae path (archivo subido) y
--     formato_id (un formato diligenciado en el ERP). No se duplica nada.
--
-- ------------------------------------------------------------------ sobre la columna valor
-- El artículo 27 fija el peso de cada ítem; la suma da 100. Los pesos aquí vienen así:
--   * Derivados del texto oficial citado por la fuente verificada: RECURSOS vale 10% y el grupo
--     1.1 vale 4% repartido en 8 ítems iguales (0,5 cada uno, con 1.1.5/1.1.6/1.1.7 confirmados
--     uno por uno); por diferencia 1.2 vale 6% en 3 ítems (2 cada uno, con 1.2.3 confirmado).
--     El grupo 4.2 vale 15% en 6 ítems iguales (2,5 cada uno, con 4.2.4 confirmado).
--     Mismo razonamiento, grupo con ítems iguales: 3.1, 3.3, 5.1, 6.1 y 7.1.
--   * De memoria, reparto desigual dentro del grupo y NO verificado contra el texto oficial:
--     todo el estándar 2 (gestión integral), el grupo 3.2 y el grupo 4.1.
-- Esos quedan con valor_verificado = false. La fuente para cerrarlos está en la casa:
-- "Estándares mínimos SG-SST 2025.pdf" en OneDrive\BACKUP\SIG 2026 trae la tabla oficial.
-- Hasta que alguien la confronte, la app debe mostrar el total como provisional. Un porcentaje
-- de autoevaluación con un peso mal puesto es un documento firmado con una cifra falsa.
--
-- ------------------------------------------------------------------ la regla que se implementa mal
-- Artículo 27: a un ítem que NO APLICA se le otorga el porcentaje MÁXIMO, no cero. Casi toda
-- implementación casera le pone cero y castiga a la empresa por algo que la norma no le exige.
-- Aquí va en la vista. Y como "no aplica" suma puntos, exigimos motivo escrito: sin eso es la
-- forma más fácil de inflar la calificación.
--
-- Verificación: supabase/verificaciones/20261130000108_verificar.sql

-- ============================================================ 1) los estándares en sst_plan_items
alter table public.sst_plan_items
  add column if not exists anio             int,
  add column if not exists codigo           text,
  add column if not exists ciclo            text,
  add column if not exists grupo            text,
  add column if not exists valor            numeric(4,2),
  add column if not exists valor_verificado boolean not null default false,
  add column if not exists aplica_7         boolean not null default false,
  add column if not exists calificacion     text not null default 'pendiente',
  add column if not exists motivo_no_aplica text,
  add column if not exists calificado_por   uuid references auth.users(id),
  add column if not exists calificado_en    timestamptz;

do $$ begin
  -- Un ítem puede ser de la Resolución (trae código, ciclo, grupo y valor) o una tarea libre del
  -- plan (no trae nada de eso). Lo que no se permite es media cosa.
  if not exists (select 1 from pg_constraint where conname = 'sst_plan_items_estandar_completo') then
    alter table public.sst_plan_items add constraint sst_plan_items_estandar_completo check (
      (codigo is null and ciclo is null and grupo is null and valor is null and anio is null)
      or (codigo is not null and ciclo is not null and grupo is not null and valor is not null and anio is not null)
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sst_plan_items_ciclo_check') then
    alter table public.sst_plan_items add constraint sst_plan_items_ciclo_check
      check (ciclo is null or ciclo in ('PLANEAR', 'HACER', 'VERIFICAR', 'ACTUAR'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sst_plan_items_calificacion_check') then
    alter table public.sst_plan_items add constraint sst_plan_items_calificacion_check
      check (calificacion in ('pendiente', 'cumple', 'no_cumple', 'no_aplica'));
  end if;

  -- "No aplica" otorga el puntaje máximo: sin motivo escrito no se acepta.
  if not exists (select 1 from pg_constraint where conname = 'sst_plan_items_no_aplica_con_motivo') then
    alter table public.sst_plan_items add constraint sst_plan_items_no_aplica_con_motivo
      check (calificacion <> 'no_aplica' or nullif(trim(motivo_no_aplica), '') is not null);
  end if;

  -- Solo un ítem de la Resolución puede calificarse; una tarea libre se mide con avance.
  if not exists (select 1 from pg_constraint where conname = 'sst_plan_items_solo_estandar_califica') then
    alter table public.sst_plan_items add constraint sst_plan_items_solo_estandar_califica
      check (calificacion = 'pendiente' or codigo is not null);
  end if;
end $$;

create unique index if not exists sst_plan_items_anio_codigo_uk
  on public.sst_plan_items (anio, codigo) where codigo is not null;

create index if not exists sst_plan_items_anio_ciclo_ix
  on public.sst_plan_items (anio, ciclo) where codigo is not null;

comment on column public.sst_plan_items.valor is
  'Peso del ítem en la tabla del artículo 27 de la Resolución 0312/2019. La suma de los 60 da 100.';
comment on column public.sst_plan_items.valor_verificado is
  'false = peso tomado de memoria, sin confrontar contra el texto oficial. La app debe advertirlo.';
comment on column public.sst_plan_items.motivo_no_aplica is
  'Obligatorio cuando calificacion = no_aplica, porque esa calificación otorga el puntaje máximo.';

-- ============================================================ 2) qué formato cumple qué estándar
-- Se apunta al CÓDIGO de la plantilla (FOR-14), no a su id, para que la asociación sobreviva a las
-- versiones: publicar el FOR-14 v2 no rompe el vínculo.
create table if not exists public.sst_estandar_plantillas (
  id               uuid primary key default gen_random_uuid(),
  codigo_estandar  text not null,
  codigo_plantilla text not null,
  nota             text,
  creado_por       uuid default auth.uid() references auth.users(id),
  creado_en        timestamptz not null default now(),
  constraint sst_estandar_plantillas_uk unique (codigo_estandar, codigo_plantilla)
);

comment on table public.sst_estandar_plantillas is
  'Qué formato del ERP sirve de evidencia para qué estándar mínimo. Es la expectativa; la evidencia real vive en sst_plan_evidencias.';

alter table public.sst_estandar_plantillas enable row level security;

do $$ begin
  if not exists (select 1 from pg_policy where polname = 'sst_estandar_plantillas_select') then
    create policy sst_estandar_plantillas_select on public.sst_estandar_plantillas
      for select using (fn_tiene_permiso('sgsst', 'consultar'));
  end if;
  if not exists (select 1 from pg_policy where polname = 'sst_estandar_plantillas_todo') then
    create policy sst_estandar_plantillas_todo on public.sst_estandar_plantillas
      for all using (fn_tiene_permiso('sgsst', 'responsable'))
      with check (fn_tiene_permiso('sgsst', 'responsable'));
  end if;
end $$;

revoke all on table public.sst_estandar_plantillas from public, anon;
grant select on table public.sst_estandar_plantillas to authenticated;
grant insert, update, delete on table public.sst_estandar_plantillas to authenticated;

-- ============================================================ 3) la autoevaluación, ítem por ítem
create or replace view public.v_sst_autoevaluacion
with (security_invoker = true) as
select
  i.id,
  i.anio,
  i.codigo,
  i.ciclo,
  i.grupo,
  i.estandar,
  i.valor,
  i.valor_verificado,
  i.aplica_7,
  i.calificacion,
  i.motivo_no_aplica,
  i.responsable_id,
  i.fecha_limite,
  -- Artículo 27: cumple = máximo, no aplica = máximo, no cumple y pendiente = 0.
  case i.calificacion when 'cumple' then i.valor when 'no_aplica' then i.valor else 0 end as puntaje,
  (select count(*) from public.sst_plan_evidencias ev
    where ev.item_id = i.id and ev.anulada_en is null)                                    as evidencias,
  (select coalesce(array_agg(ep.codigo_plantilla order by ep.codigo_plantilla), '{}')
     from public.sst_estandar_plantillas ep where ep.codigo_estandar = i.codigo)          as formatos_esperados
from public.sst_plan_items i
where i.codigo is not null and i.archivado_en is null;

comment on view public.v_sst_autoevaluacion is
  'Un renglón por estándar mínimo calificado. puntaje aplica la regla del artículo 27: no aplica otorga el máximo.';

-- ============================================================ 4) el total y la valoración
create or replace view public.v_sst_autoevaluacion_total
with (security_invoker = true) as
select
  anio,
  count(*)                                                        as estandares,
  count(*) filter (where calificacion = 'pendiente')              as pendientes,
  count(*) filter (where calificacion = 'cumple')                 as cumple,
  count(*) filter (where calificacion = 'no_cumple')              as no_cumple,
  count(*) filter (where calificacion = 'no_aplica')              as no_aplica,
  sum(valor)                                                      as valor_posible,
  sum(puntaje)                                                    as puntaje,
  -- Artículo 28: < 60 crítico, 60,1 a 85 moderadamente aceptable, > 85 aceptable.
  case when sum(puntaje) <= 60  then 'critico'
       when sum(puntaje) <= 85  then 'moderadamente_aceptable'
       else 'aceptable' end                                       as valoracion,
  bool_and(valor_verificado)                                      as pesos_verificados
from public.v_sst_autoevaluacion
group by anio;

comment on view public.v_sst_autoevaluacion_total is
  'Calificación del artículo 27 con su valoración. pesos_verificados = false significa que el total es provisional.';

revoke all on public.v_sst_autoevaluacion from public, anon;
revoke all on public.v_sst_autoevaluacion_total from public, anon;
grant select on public.v_sst_autoevaluacion to authenticated;
grant select on public.v_sst_autoevaluacion_total to authenticated;

-- ============================================================ 5) siembra de los 60 estándares
-- Año 2026. Todos arrancan en 'pendiente': la carpeta de Drive tiene 60 estándares y 3 evidencias,
-- así que el estado de verdad hoy es "sin calificar", no "cumple".
with semilla(codigo, ciclo, grupo, nombre, valor, verificado, aplica_7) as (values
  -- ---------- I. PLANEAR · RECURSOS (10%) · 1.1 recursos (4%)
  ('1.1.1','PLANEAR','1.1 Recursos financieros, técnicos, humanos y de otra índole (4%)','Responsable del Sistema de Gestión de Seguridad y Salud en el Trabajo SG-SST',0.5,true,true),
  ('1.1.2','PLANEAR','1.1 Recursos financieros, técnicos, humanos y de otra índole (4%)','Responsabilidades en el Sistema de Gestión de Seguridad y Salud en el Trabajo SG-SST',0.5,true,false),
  ('1.1.3','PLANEAR','1.1 Recursos financieros, técnicos, humanos y de otra índole (4%)','Asignación de recursos para el Sistema de Gestión en Seguridad y Salud en el Trabajo SG-SST',0.5,true,false),
  ('1.1.4','PLANEAR','1.1 Recursos financieros, técnicos, humanos y de otra índole (4%)','Afiliación al Sistema General de Riesgos Laborales',0.5,true,true),
  ('1.1.5','PLANEAR','1.1 Recursos financieros, técnicos, humanos y de otra índole (4%)','Identificación de trabajadores de alto riesgo y cotización de pensión especial',0.5,true,false),
  ('1.1.6','PLANEAR','1.1 Recursos financieros, técnicos, humanos y de otra índole (4%)','Conformación COPASST',0.5,true,false),
  ('1.1.7','PLANEAR','1.1 Recursos financieros, técnicos, humanos y de otra índole (4%)','Capacitación COPASST',0.5,true,false),
  ('1.1.8','PLANEAR','1.1 Recursos financieros, técnicos, humanos y de otra índole (4%)','Conformación Comité de Convivencia Laboral',0.5,true,false),
  -- 1.2 capacitación (6%)
  ('1.2.1','PLANEAR','1.2 Capacitación en el Sistema de Gestión de Seguridad y Salud en el Trabajo (6%)','Programa de capacitación, promoción y prevención PyP',2,true,true),
  ('1.2.2','PLANEAR','1.2 Capacitación en el Sistema de Gestión de Seguridad y Salud en el Trabajo (6%)','Inducción y reinducción en el SG-SST, actividades de promoción y prevención PyP',2,true,false),
  ('1.2.3','PLANEAR','1.2 Capacitación en el Sistema de Gestión de Seguridad y Salud en el Trabajo (6%)','Responsables del SG-SST con curso virtual de 50 horas',2,true,false),
  -- ---------- I. PLANEAR · GESTIÓN INTEGRAL DEL SG-SST (15%) — reparto interno sin verificar
  ('2.1.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Política del SG-SST firmada, fechada y comunicada al COPASST',1,false,false),
  ('2.2.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Objetivos definidos, claros, medibles, cuantificables, con metas, documentados y revisados del SG-SST',1,false,false),
  ('2.3.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Evaluación e identificación de prioridades',1,false,false),
  ('2.4.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Plan anual de trabajo que identifica objetivos, metas, responsabilidad, recursos, cronograma y firmado',2,false,true),
  ('2.5.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Archivo o retención documental del SG-SST',2,false,false),
  ('2.6.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Rendición de cuentas sobre el desempeño',1,false,false),
  ('2.7.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Matriz legal',2,false,false),
  ('2.8.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Mecanismos de comunicación, autorreporte en el SG-SST',1,false,false),
  ('2.9.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Identificación y evaluación para la adquisición de productos y servicios en el SG-SST',1,false,false),
  ('2.10.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Evaluación y selección de proveedores y contratistas',2,false,false),
  ('2.11.1','PLANEAR','2.1 Gestión integral del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (15%)','Evaluación del impacto de cambios internos y externos en el SG-SST',1,false,false),
  -- ---------- II. HACER · GESTIÓN DE LA SALUD (20%) · 3.1 condiciones de salud (9%)
  ('3.1.1','HACER','3.1 Condiciones de salud en el trabajo (9%)','Descripción sociodemográfica y diagnóstico de condiciones de salud',1,true,false),
  ('3.1.2','HACER','3.1 Condiciones de salud en el trabajo (9%)','Actividades de promoción y prevención en salud',1,true,false),
  ('3.1.3','HACER','3.1 Condiciones de salud en el trabajo (9%)','Información al médico de los perfiles de cargo',1,true,false),
  ('3.1.4','HACER','3.1 Condiciones de salud en el trabajo (9%)','Realización de las evaluaciones médicas ocupacionales: peligros, periodicidad y comunicación al trabajador',1,true,true),
  ('3.1.5','HACER','3.1 Condiciones de salud en el trabajo (9%)','Custodia de historias clínicas',1,true,false),
  ('3.1.6','HACER','3.1 Condiciones de salud en el trabajo (9%)','Restricciones y recomendaciones médico laborales',1,true,false),
  ('3.1.7','HACER','3.1 Condiciones de salud en el trabajo (9%)','Estilos de vida y entornos saludables (control del tabaquismo, alcoholismo, farmacodependencia y otros)',1,true,false),
  ('3.1.8','HACER','3.1 Condiciones de salud en el trabajo (9%)','Agua potable, servicios sanitarios y disposición de basuras',1,true,false),
  ('3.1.9','HACER','3.1 Condiciones de salud en el trabajo (9%)','Eliminación adecuada de residuos sólidos, líquidos o gaseosos',1,true,false),
  -- 3.2 registro, reporte e investigación (5%) — reparto interno sin verificar
  ('3.2.1','HACER','3.2 Registro, reporte e investigación de enfermedades laborales, incidentes y accidentes de trabajo (5%)','Reporte de los accidentes de trabajo y enfermedad laboral a la ARL, EPS y Dirección Territorial del Ministerio de Trabajo',2,false,false),
  ('3.2.2','HACER','3.2 Registro, reporte e investigación de enfermedades laborales, incidentes y accidentes de trabajo (5%)','Investigación de incidentes, accidentes de trabajo y enfermedades laborales',2,false,false),
  ('3.2.3','HACER','3.2 Registro, reporte e investigación de enfermedades laborales, incidentes y accidentes de trabajo (5%)','Registro y análisis estadístico de accidentes de trabajo y enfermedades laborales',1,false,false),
  -- 3.3 mecanismos de vigilancia (6%)
  ('3.3.1','HACER','3.3 Mecanismos de vigilancia de las condiciones de salud de los trabajadores (6%)','Medición de la frecuencia de la accidentalidad',1,true,false),
  ('3.3.2','HACER','3.3 Mecanismos de vigilancia de las condiciones de salud de los trabajadores (6%)','Medición de la severidad de la accidentalidad',1,true,false),
  ('3.3.3','HACER','3.3 Mecanismos de vigilancia de las condiciones de salud de los trabajadores (6%)','Medición de la mortalidad por accidentes de trabajo',1,true,false),
  ('3.3.4','HACER','3.3 Mecanismos de vigilancia de las condiciones de salud de los trabajadores (6%)','Medición de la prevalencia de la enfermedad laboral',1,true,false),
  ('3.3.5','HACER','3.3 Mecanismos de vigilancia de las condiciones de salud de los trabajadores (6%)','Medición de la incidencia de la enfermedad laboral',1,true,false),
  ('3.3.6','HACER','3.3 Mecanismos de vigilancia de las condiciones de salud de los trabajadores (6%)','Medición del ausentismo por causa médica',1,true,false),
  -- ---------- II. HACER · GESTIÓN DE PELIGROS Y RIESGOS (30%) · 4.1 identificación (15%) sin verificar
  ('4.1.1','HACER','4.1 Identificación de peligros, evaluación y valoración de riesgos (15%)','Metodología para la identificación de peligros, evaluación y valoración de los riesgos',4,false,false),
  ('4.1.2','HACER','4.1 Identificación de peligros, evaluación y valoración de riesgos (15%)','Identificación de peligros con participación de todos los niveles de la empresa',4,false,true),
  ('4.1.3','HACER','4.1 Identificación de peligros, evaluación y valoración de riesgos (15%)','Identificación de sustancias catalogadas como carcinógenas o con toxicidad aguda',3,false,false),
  ('4.1.4','HACER','4.1 Identificación de peligros, evaluación y valoración de riesgos (15%)','Realización de mediciones ambientales químicas, físicas y biológicas',4,false,false),
  -- 4.2 medidas de prevención y control (15%)
  ('4.2.1','HACER','4.2 Medidas de prevención y control para intervenir los peligros y riesgos (15%)','Implementación de medidas de prevención y control frente a peligros y riesgos identificados',2.5,true,true),
  ('4.2.2','HACER','4.2 Medidas de prevención y control para intervenir los peligros y riesgos (15%)','Verificación de la aplicación de las medidas de prevención y control por parte de los trabajadores',2.5,true,false),
  ('4.2.3','HACER','4.2 Medidas de prevención y control para intervenir los peligros y riesgos (15%)','Elaboración de procedimientos, instructivos, fichas y protocolos',2.5,true,false),
  ('4.2.4','HACER','4.2 Medidas de prevención y control para intervenir los peligros y riesgos (15%)','Realización de inspecciones sistemáticas a instalaciones, maquinaria o equipos con participación del COPASST',2.5,true,false),
  ('4.2.5','HACER','4.2 Medidas de prevención y control para intervenir los peligros y riesgos (15%)','Mantenimiento periódico de instalaciones, equipos, máquinas y herramientas',2.5,true,false),
  ('4.2.6','HACER','4.2 Medidas de prevención y control para intervenir los peligros y riesgos (15%)','Entrega de elementos de protección personal EPP, se verifica con contratistas y subcontratistas',2.5,true,false),
  -- ---------- II. HACER · GESTIÓN DE AMENAZAS (10%)
  ('5.1.1','HACER','5.1 Plan de prevención, preparación y respuesta ante emergencias (10%)','Se cuenta con el plan de prevención, preparación y respuesta ante emergencias',5,true,false),
  ('5.1.2','HACER','5.1 Plan de prevención, preparación y respuesta ante emergencias (10%)','Brigada de prevención conformada, capacitada y dotada',5,true,false),
  -- ---------- III. VERIFICAR · VERIFICACIÓN DEL SG-SST (5%)
  ('6.1.1','VERIFICAR','6.1 Gestión y resultados del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (5%)','Definición de indicadores del SG-SST de acuerdo con las condiciones de la empresa',1.25,true,false),
  ('6.1.2','VERIFICAR','6.1 Gestión y resultados del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (5%)','La empresa adelanta auditoría por lo menos una vez al año',1.25,true,false),
  ('6.1.3','VERIFICAR','6.1 Gestión y resultados del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (5%)','Revisión anual por la alta dirección y resultados de la auditoría',1.25,true,false),
  ('6.1.4','VERIFICAR','6.1 Gestión y resultados del Sistema de Gestión de la Seguridad y la Salud en el Trabajo (5%)','Planificación de las auditorías con el COPASST',1.25,true,false),
  -- ---------- IV. ACTUAR · MEJORAMIENTO (10%)
  ('7.1.1','ACTUAR','7.1 Acciones preventivas y correctivas con base en los resultados del SG-SST (10%)','Definición de acciones preventivas y correctivas con base en los resultados del SG-SST',2.5,true,false),
  ('7.1.2','ACTUAR','7.1 Acciones preventivas y correctivas con base en los resultados del SG-SST (10%)','Acciones de mejora conforme a la revisión por la alta dirección',2.5,true,false),
  ('7.1.3','ACTUAR','7.1 Acciones preventivas y correctivas con base en los resultados del SG-SST (10%)','Acciones de mejora con base en investigaciones de accidentes de trabajo y enfermedades laborales',2.5,true,false),
  ('7.1.4','ACTUAR','7.1 Acciones preventivas y correctivas con base en los resultados del SG-SST (10%)','Elaboración del plan de mejoramiento e implementación de las medidas y acciones correctivas solicitadas por autoridades y ARL',2.5,true,false)
)
insert into public.sst_plan_items (anio, codigo, ciclo, grupo, estandar, valor, valor_verificado, aplica_7, orden, creado_por)
select 2026, s.codigo, s.ciclo, s.grupo, s.nombre, s.valor, s.verificado, s.aplica_7,
       row_number() over (order by string_to_array(s.codigo, '.')::int[]),
       null
from semilla s
on conflict do nothing;

-- ============================================================ 6) asociaciones que ya se conocen
-- Solo las que se sostienen con lo que hay en la carpeta. El resto las ata Victoria desde la app.
insert into public.sst_estandar_plantillas (codigo_estandar, codigo_plantilla, nota, creado_por)
values
  ('1.2.2','FOR-02','Asistencia a capacitaciones e inducción: es la evidencia natural de la inducción y reinducción.',null),
  ('4.2.4','FOR-09','Inspección de escaleras.',null),
  ('4.2.4','FOR-23','Inspección de herramientas manuales.',null),
  ('4.2.4','FOR-39','Lista de chequeo de equipos contra caídas.',null),
  ('4.2.4','FOR-40','Inspección preoperacional de plataformas elevadoras.',null),
  ('4.2.4','FOR-17','Preoperacional de perforación.',null),
  ('4.2.3','FOR-14','ATS: el procedimiento de trabajo seguro por tarea.',null),
  ('4.2.1','FOR-15','Permiso de trabajo en alturas: la medida de control antes de exponer a alguien.',null),
  ('4.2.6','FOR-27','Inventario de equipos de protección contra caídas.',null)
on conflict do nothing;

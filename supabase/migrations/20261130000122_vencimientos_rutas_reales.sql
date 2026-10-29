-- v_vencimientos (119) con las rutas de verdad (2026-10-30). El orquestador dejó las rutas como su
-- mejor suposición y pidió corregirlas contra las pantallas que existen; un aviso que lleva a una
-- página rota enseña a no tocar los avisos.
--   * Documentos de personas y EPP: a la ficha de la persona en SG-SST (/sgsst/personal/e-… o c-…),
--     no a la lista.
--   * Inspección de equipos: /sgsst/equipos (la pantalla se crea con esta migración, en el código).
--   * Planillas de contratistas: no hay pantalla de contratistas todavía; van a /administrativo.
--   * Amparos de póliza: al proyecto de la póliza (por su documento), no a la lista de proyectos.
--   * Contratos laborales: al contrato (/rrhh/contratos/{id}).
--   * Tareas: las de equipo a /operativo/tareas; las internas o compartidas, a /planificacion.
-- Nada más cambia: mismas columnas, mismo orden, mismas fuentes y reglas.
-- Verificación: supabase/verificaciones/20261130000122_verificar.sql
-- Rollback:     volver a correr la sección 2 de la 119.

create or replace view public.v_vencimientos with (security_invoker = true) as
with fuentes as (
  -- Documentos de personas: alturas, aptitud médica, afiliaciones, capacitaciones.
  select 'persona_documentos'::text as origen_tabla, d.id as origen_id,
         case d.tipo when 'certificado_alturas' then 'Certificado de alturas'
                     when 'aptitud_ocupacional' then 'Examen médico ocupacional'
                     when 'certificado_afiliacion' then 'Afiliación a seguridad social'
                     when 'capacitacion' then 'Capacitación'
                     else 'Documento de la persona' end as categoria,
         coalesce(nullif(trim(d.nombre), ''), fn_venc_persona(d.empleado_id, d.contratista_trabajador_id),
                  'Documento') as titulo,
         concat_ws(' · ', fn_venc_persona(d.empleado_id, d.contratista_trabajador_id),
                   nullif(d.entidad, ''), nullif(d.nivel, '')) as detalle,
         d.vence_en as vence,
         case d.tipo when 'certificado_afiliacion' then 15 when 'capacitacion' then 30 else 60 end as aviso_dias,
         'sgsst'::text as modulo,
         ('/sgsst/personal/' || case when d.empleado_id is not null then 'e-' || d.empleado_id::text
                                      else 'c-' || d.contratista_trabajador_id::text end)::text as ruta,
         null::uuid as responsable_id
  from public.persona_documentos d
  where d.vence_en is not null and not d.archivado

  union all
  -- EPP que hay que reponer.
  select 'epp_seguimiento', s.entrega_id, 'Reposición de EPP',
         coalesce(e.nombre, 'Elemento de protección'),
         concat_ws(' · ', fn_venc_persona(e.empleado_id, null), nullif(e.talla, '')),
         s.reponer_en, 30, 'sgsst', '/sgsst/personal/e-' || e.empleado_id::text, null
  from public.epp_seguimiento s
  join public.dotacion_entregas e on e.id = s.entrega_id
  where s.reponer_en is not null and e.devuelta_en is null

  union all
  -- Próxima inspección de un equipo de protección contra caídas.
  select 'sst_equipos', q.id, 'Inspección de equipo',
         q.codigo || ' · ' || q.clase || coalesce(' ' || q.referencia, ''),
         concat_ws(' · ', 'Última inspección ' || to_char(u.fecha, 'DD/MM/YYYY'),
                   'cada ' || q.periodicidad_inspeccion_meses || ' meses'),
         (u.fecha + (q.periodicidad_inspeccion_meses || ' months')::interval)::date,
         30, 'sgsst', '/sgsst/equipos', null
  from public.sst_equipos q
  join lateral (select i.fecha from public.sst_equipo_inspecciones i
                where i.equipo_id = q.id order by i.fecha desc limit 1) u on true
  where q.estado = 'activo'

  union all
  -- Planilla de parafiscales confirmada que se vence: sin ella no se aprueban cuentas de cobro.
  select 'contratista_planillas', p.id, 'Planilla de parafiscales',
         coalesce(c.nombre, 'Contratista'),
         'Cobertura hasta ' || to_char(p.vigencia_hasta, 'DD/MM/YYYY'),
         p.vigencia_hasta, 15, 'administrativo', '/administrativo', null
  from public.contratista_planillas p
  join public.contratistas c on c.id = p.contratista_id
  where p.estado = 'confirmada' and p.vigencia_hasta is not null

  union all
  -- Amparos de pólizas.
  select 'proyecto_poliza_amparos', a.id, 'Amparo de póliza',
         a.amparo,
         concat_ws(' · ', pz.aseguradora, nullif(pz.numero, ''), nullif(pz.ramo, '')),
         a.vigencia_hasta, 45, 'proyectos', coalesce('/proyectos/' || pd.proyecto_id::text, '/proyectos'), null
  from public.proyecto_poliza_amparos a
  left join public.proyecto_polizas pz on pz.id = a.poliza_id
  left join public.proyecto_documentos pd on pd.id = pz.documento_id
  where a.vigencia_hasta is not null

  union all
  -- Contratos laborales a término fijo: la no prórroga se avisa con 30 días por ley.
  select 'contratos_laborales', c.id, 'Fin de contrato laboral',
         coalesce(c.trabajador, 'Trabajador'),
         'Avisar la no prórroga por escrito con 30 días de anticipación',
         c.fecha_fin, 45, 'rrhh', '/rrhh/contratos/' || c.id::text, null
  from public.contratos_laborales c
  where c.fecha_fin is not null and c.estado is distinct from 'anulado'

  union all
  -- Proyectos.
  select 'proyectos', p.id, 'Vencimiento del contrato de obra', p.codigo || ' · ' || p.nombre,
         null, p.fecha_vencimiento_contrato, 30, 'proyectos', '/proyectos/' || p.id::text, null
  from public.proyectos p
  where p.fecha_vencimiento_contrato is not null and p.estado = 'EN_EJECUCION'

  union all
  -- Plan anual del SG-SST: lo que tiene fecha y todavía no cumple.
  select 'sst_plan_items', i.id, 'Plan de trabajo SG-SST',
         coalesce(i.codigo || ' · ', '') || i.estandar, i.descripcion,
         i.fecha_limite, 15, 'sgsst', '/sgsst/plan', i.responsable_id
  from public.sst_plan_items i
  where i.fecha_limite is not null and i.archivado_en is null and i.calificacion <> 'cumple'

  union all
  -- Tareas del tablero.
  select 'tareas', t.id, 'Tarea', t.titulo, t.descripcion,
         t.fecha_limite, 3, 'operativo',
         case when t.visibilidad = 'equipo' then '/operativo/tareas' else '/planificacion' end, null
  from public.tareas t
  where t.fecha_limite is not null and not t.archivada and t.cerrada_en is null
)
select f.*,
       (f.vence - (now() at time zone 'America/Bogota')::date) as dias,
       case
         when f.vence <  (now() at time zone 'America/Bogota')::date then 'vencido'
         when f.vence =  (now() at time zone 'America/Bogota')::date then 'hoy'
         when f.vence <= (now() at time zone 'America/Bogota')::date + f.aviso_dias then 'por_vencer'
         else 'vigente'
       end as estado
from fuentes f
where f.vence is not null;

-- Motor de vencimientos: una sola lista de todo lo que se vence (2026-10-29).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- Es el número que la 106 tenía reservado y que quedó esperando. Se construye ahora porque hoy hay
-- mucho más de qué avisar que hace una semana (personal, EPP, equipos, planillas, el plan anual) y
-- porque Jhojan está conectando las notificaciones en este momento: él pone el tubo, esto produce
-- lo que viaja por él.
--
-- UNA FUENTE, MUCHAS VISTAS — el patrón de siempre. No hay tabla de vencimientos: cada fecha sigue
-- viviendo donde vive, y `v_vencimientos` las lee todas. Nada que sincronizar, nada que se desfase.
--
-- La vista es `security_invoker`: cada quien ve los vencimientos de lo que ya podía ver. Un técnico
-- no se entera de que se vence una póliza.
--
-- ------------------------------------------------------------------ días calendario, a propósito
-- `dias` cuenta días CALENDARIO, no hábiles. Un certificado de alturas no se vence en día hábil:
-- se vence el día que dice el papel. (Los días hábiles son para los plazos de obra — eso es
-- fn_sumar_dias_habiles, migración 96, y es otra cosa.)
--
-- ------------------------------------------------------------------ cuánto antes avisar
-- Cada cosa tiene su propio `aviso_dias`, porque no todas se resuelven igual de rápido:
--   * Certificado de alturas y examen médico: 60 días. Conseguir cita y hacer el curso toma semanas.
--   * Pólizas: 45. Renovarlas pasa por la aseguradora.
--   * CONTRATO A TÉRMINO FIJO: 45 días. En Colombia hay que avisar la NO prórroga por escrito con
--     30 días de anticipación; si se pasa la fecha, el contrato se renueva solo. Avisar a 45 deja
--     margen para decidir antes de que la ley decida por uno. Este es el que más plata cuesta
--     olvidar.
--   * EPP y equipos: 30. Planillas de parafiscales y afiliaciones: 15. Tareas: 3.
--
-- ------------------------------------------------------------------ lo que NO entró todavía
-- Los abonos pendientes de decisión necesitan que Jhojan defina el plazo ("¿a los cuántos días sin
-- responder se vuelve urgente?"). No lo invento: cuando lo diga, es un bloque más en el UNION.
--
-- Verificación: supabase/verificaciones/20261130000119_verificar.sql

-- ============================================================ 1) nombre de la persona
-- Definer y acotada: devuelve SOLO el nombre, y solo a quien ya puede ver personal. Existe porque
-- la vista no puede unirse a `empleados` (su RLS es de RRHH) sin perder filas para SG-SST.
create or replace function public.fn_venc_persona(p_empleado uuid, p_trabajador uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when not fn_persona_sst_ve() then null
    when p_empleado is not null then
      (select trim(e.primer_nombre || ' ' || e.primer_apellido) from empleados e where e.id = p_empleado)
    when p_trabajador is not null then
      (select t.nombre || ' (contratista)' from contratista_trabajadores t where t.id = p_trabajador)
  end;
$$;
revoke all on function public.fn_venc_persona(uuid, uuid) from public, anon;
grant execute on function public.fn_venc_persona(uuid, uuid) to authenticated, service_role;

-- ============================================================ 2) la lista
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
         'sgsst'::text as modulo, '/sgsst/personal'::text as ruta, null::uuid as responsable_id
  from public.persona_documentos d
  where d.vence_en is not null and not d.archivado

  union all
  -- EPP que hay que reponer.
  select 'epp_seguimiento', s.entrega_id, 'Reposición de EPP',
         coalesce(e.nombre, 'Elemento de protección'),
         concat_ws(' · ', fn_venc_persona(e.empleado_id, null), nullif(e.talla, '')),
         s.reponer_en, 30, 'sgsst', '/sgsst/personal', null
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
         p.vigencia_hasta, 15, 'administrativo', '/administrativo/contratistas', null
  from public.contratista_planillas p
  join public.contratistas c on c.id = p.contratista_id
  where p.estado = 'confirmada' and p.vigencia_hasta is not null

  union all
  -- Amparos de pólizas.
  select 'proyecto_poliza_amparos', a.id, 'Amparo de póliza',
         a.amparo,
         concat_ws(' · ', pz.aseguradora, nullif(pz.numero, ''), nullif(pz.ramo, '')),
         a.vigencia_hasta, 45, 'proyectos', '/proyectos', null
  from public.proyecto_poliza_amparos a
  left join public.proyecto_polizas pz on pz.id = a.poliza_id
  where a.vigencia_hasta is not null

  union all
  -- Contratos laborales a término fijo: la no prórroga se avisa con 30 días por ley.
  select 'contratos_laborales', c.id, 'Fin de contrato laboral',
         coalesce(c.trabajador, 'Trabajador'),
         'Avisar la no prórroga por escrito con 30 días de anticipación',
         c.fecha_fin, 45, 'rrhh', '/rrhh/contratos', null
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
         t.fecha_limite, 3, 'operativo', '/operativo', null
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

comment on view public.v_vencimientos is
  'Todo lo que se vence, leido de donde vive. security_invoker: cada quien ve lo suyo. dias = calendario.';

revoke all on public.v_vencimientos from public, anon;
grant select on public.v_vencimientos to authenticated;

-- ============================================================ 3) los tipos de aviso
-- `para` solo admite tecnico | aprobador | rrhh | sst, y un vencimiento no le interesa a todos por
-- igual: que se venza un certificado de alturas es de SG-SST, que se venza un contrato a término
-- fijo es de RRHH, y que se venza una póliza es de quien aprueba. Por eso van tres tipos y no uno:
-- así cada quien apaga el que no le sirve sin perder el que sí.
insert into public.notificacion_tipos (id, nombre, descripcion, para, por_defecto, orden)
values
  ('vencimiento_sst', 'Algo del SG-SST se va a vencer',
   'Certificados de alturas, exámenes médicos, afiliaciones, EPP, inspección de equipos y el plan de trabajo.',
   'sst', true, 100),
  ('vencimiento_rrhh', 'Un contrato laboral se va a vencer',
   'Contratos a término fijo. La no prórroga se avisa por escrito con 30 días de anticipación.',
   'rrhh', true, 101),
  ('vencimiento_admin', 'Algo de la operación se va a vencer',
   'Pólizas, planillas de parafiscales de contratistas, contratos de obra y tareas con fecha.',
   'aprobador', true, 102)
on conflict (id) do nothing;

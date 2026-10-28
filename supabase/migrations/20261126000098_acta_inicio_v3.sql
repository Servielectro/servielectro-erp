-- Acta de inicio, versión 3 (2026-10-27). YA APLICADA en producción por el orquestador mientras
-- Jhojan armaba el acta de Tintalá; este archivo la deja en el repo. Idempotente: correrla otra vez
-- no cambia ni duplica nada.
--
-- Dos pedidos de Jhojan:
--   1. El valor del anticipo viene del contrato. fn_actas_prellenado devuelve "anticipo_valor": el
--      valor del literal "anticipo" de la forma de pago del contrato confirmado; si ese literal no
--      trae valor, su porcentaje por el valor total. Para Tintalá: $8.485.267. El campo
--      req_anticipo_valor queda con "prellenar": "anticipo_valor", así que si se recibió otra
--      cantidad y se corrige, el acta queda marcada como apartada del contrato (la diferencia entre
--      lo pactado y lo recibido es justo lo que hay que ver).
--   2. Firman solo contratante y contratista: "El tema de los técnicos en sitio no es importante,
--      porque eso va para actas de capacitaciones para personal, para cuando reciben los técnicos
--      materiales y equipos y así... en acta de inicio solo contratante y contratista." Sin la firma
--      obligatoria de 'tecnico', fn_sst_pide_tecnicos da falso y esta plantilla no exige la lista
--      de técnicos en obra (la lista sigue para las actas donde sí aplica).
--
-- La plantilla publicada no se edita: sale la VERSIÓN 3 (00000000-0000-4000-8000-0000000098a1) y
-- la versión 2 se archiva. Va después de la 96 (y de la 93: lee la forma de pago).
-- Verificación: supabase/verificaciones/20261126000098_verificar.sql
-- Rollback:     supabase/rollbacks/20261126000098_acta_inicio_v3_down.sql

-- ============================================================ 1) prellenado con el anticipo
create or replace function public.fn_actas_prellenado()
returns table (proyecto_id uuid, datos jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
    jsonb_strip_nulls(jsonb_build_object(
      'ciudad', coalesce(nullif(trim(s.municipio), ''), 'Bogotá'),
      'contratante_razon_social', cl.nombre,
      'contratante_nit', cl.nit,
      'contratante_nombre', nullif(trim(cl.contacto), ''),
      'contratista_nombre', e.representante_legal_nombre,
      'contratista_cedula', e.representante_legal_cedula,
      'contratista_expedida_en', e.representante_legal_cedula_expedida_en,
      'lugar_nombre', coalesce(s.nombre, cl.nombre),
      'lugar_direccion', coalesce(s.direccion, cl.direccion),
      'referencia', nullif(concat_ws(' · ',
                      case when c.numero is not null then 'Contrato ' || c.numero end,
                      case when q.codigo is not null then 'Cotización ' || q.codigo end,
                      case when c.numero is null and q.codigo is null then 'Proyecto ' || p.codigo end), ''),
      'alcance', c.alcance,
      'plazo_dias_habiles', case when c.plazo_unidad = 'dias_habiles' then c.plazo_cantidad::text end,
      'anticipo_valor', a.valor::text,
      '_contrato_id', c.contrato_id
    ))
  from proyectos p
  left join clientes cl on cl.id = p.cliente_id
  left join lateral (
    select s2.nombre, s2.direccion, s2.municipio from cliente_sedes s2
    where s2.cliente_id = p.cliente_id and s2.activa
    order by (s2.nombre ilike '%principal%') desc, s2.created_at
    limit 1
  ) s on true
  left join v_proyecto_contrato_vigente c on c.proyecto_id = p.id
  -- El literal del anticipo: su valor; si no lo trae, su porcentaje por el total. En pesos enteros.
  left join lateral (
    select round(coalesce(nullif(x ->> 'valor', '')::numeric,
                          nullif(x ->> 'porcentaje', '')::numeric * c.valor_total / 100))::bigint as valor
    from jsonb_array_elements(coalesce(c.forma_pago, '[]'::jsonb)) with ordinality f(x, o)
    where x ->> 'concepto' ilike 'anticipo%'
    order by o
    limit 1
  ) a on true
  left join cotizaciones q on q.id = p.cotizacion_aprobada_id
  left join lateral (select * from configuracion_empresa limit 1) e on true
  where fn_tiene_permiso('proyectos', 'trabajar');
$$;

-- ============================================================ 2) versión 3 del acta de inicio
-- Campos de la versión 2 con req_anticipo_valor prellenado; firmas: contratante y contratista.
insert into public.sst_plantillas (id, ambito, codigo, nombre, version, plantilla_anterior_id, descripcion, estado, publicada_en, campos, firmas)
select '00000000-0000-4000-8000-0000000098a1', v2.ambito, v2.codigo, v2.nombre, 3, v2.id, v2.descripcion, 'publicada', now(),
  (select jsonb_agg(case when x ->> 'id' = 'req_anticipo_valor'
                         then x || '{"prellenar": "anticipo_valor"}'::jsonb else x end order by o)
   from jsonb_array_elements(v2.campos) with ordinality e(x, o)),
  '[{"rol": "sst_cliente", "etiqueta": "Por el contratante", "obligatoria": true},
    {"rol": "responsable_sst", "etiqueta": "Por el contratista", "obligatoria": true}]'::jsonb
from public.sst_plantillas v2
where v2.id = '00000000-0000-4000-8000-0000000096a1'
on conflict do nothing;

-- La versión 2 se archiva.
update public.sst_plantillas
set estado = 'archivada', archivada_en = now(),
    motivo_archivo = 'Reemplazada por la versión 3: anticipo prellenado del contrato y firmas solo de contratante y contratista (Jhojan, 2026-10-27).'
where id = '00000000-0000-4000-8000-0000000096a1' and estado = 'publicada'
  and exists (select 1 from public.sst_plantillas where id = '00000000-0000-4000-8000-0000000098a1');

-- ============================================================ 3) privilegios (como en la 94)
revoke all on function public.fn_actas_prellenado() from public, anon;
grant execute on function public.fn_actas_prellenado() to authenticated;

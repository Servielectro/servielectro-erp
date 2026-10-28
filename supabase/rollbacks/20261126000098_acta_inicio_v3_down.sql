-- Deshace 20261126000098: vuelve la versión 2 del acta de inicio (con firma de técnicos y sin el
-- anticipo prellenado) y fn_actas_prellenado como la dejó la 94. OJO: la v3 es la que pidió Jhojan.
-- La versión 3 solo se borra si ninguna acta la usa; si alguna la usa, queda archivada.

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
  left join cotizaciones q on q.id = p.cotizacion_aprobada_id
  left join lateral (select * from configuracion_empresa limit 1) e on true
  where fn_tiene_permiso('proyectos', 'trabajar');
$$;
revoke all on function public.fn_actas_prellenado() from public, anon;
grant execute on function public.fn_actas_prellenado() to authenticated;

update public.sst_plantillas
set estado = 'archivada', archivada_en = now(), motivo_archivo = 'Rollback de la 98: vuelve la versión 2.'
where id = '00000000-0000-4000-8000-0000000098a1' and estado = 'publicada';
delete from public.sst_plantillas
where id = '00000000-0000-4000-8000-0000000098a1'
  and not exists (select 1 from public.sst_formatos where plantilla_id = '00000000-0000-4000-8000-0000000098a1');
update public.sst_plantillas
set estado = 'publicada', archivada_en = null, motivo_archivo = null
where id = '00000000-0000-4000-8000-0000000096a1';

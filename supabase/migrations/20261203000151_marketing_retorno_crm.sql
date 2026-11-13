-- Puente de Marketing al CRM: qué publicaciones trajeron negocio (2026-11-09).
-- SIN APLICAR hasta que se autorice nombrando esta migración. Idempotente.
--
-- La pregunta de Jhojan: de lo que publiqué, ¿qué trajo cotizaciones y qué solo likes? Las redes
-- dicen qué tuvo más guardados; cuál trajo un cliente solo lo puede decir el CRM.
--
-- 1) oportunidades.marketing_publicacion_id: opcional. Si se borra la publicación, la oportunidad
--    sigue viva y solo pierde el vínculo.
-- 2) CHECK: si está atada a una publicación, el origen es redes_sociales. Un lead no pudo venir de
--    un referido y a la vez de un post.
-- 3) v_marketing_retorno: una fila por publicación, también las que no trajeron nada (esas son las
--    de "solo likes"). Las cifras se pueden sumar por idea o por serie.
-- 4) fn_crm_publicaciones_recientes(): el selector del CRM. Quien tiene Comercial y no Marketing
--    no puede leer marketing_publicaciones (RLS); esta función le da solo id, título, canal y fecha.
--
-- NO confundir con v_marketing_oportunidades (125): esa son sugerencias de contenido, no el CRM.
--
-- Verificación: supabase/verificaciones/20261203000151_verificar.sql
-- Rollback:     supabase/rollbacks/20261203000151_marketing_retorno_crm_down.sql

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'origen_lead')
     or to_regclass('public.marketing_publicaciones') is null
     or to_regclass('public.marketing_metricas') is null
     or to_regclass('public.etapas_config') is null
     or to_regclass('public.v_cotizacion_totales_iva') is null then
    raise exception 'Faltan piezas de migraciones anteriores (origen_lead, marketing_*, etapas_config o v_cotizacion_totales_iva).';
  end if;
end $$;

-- ============================================================ 1) y 2) el vínculo
alter table public.oportunidades add column if not exists marketing_publicacion_id uuid;

alter table public.oportunidades drop constraint if exists oportunidades_marketing_publicacion_fk;
alter table public.oportunidades add constraint oportunidades_marketing_publicacion_fk
  foreign key (marketing_publicacion_id) references public.marketing_publicaciones (id) on delete set null;

alter table public.oportunidades drop constraint if exists oportunidades_publicacion_exige_redes;
alter table public.oportunidades add constraint oportunidades_publicacion_exige_redes check (
  marketing_publicacion_id is null or origen_lead = 'redes_sociales'
);

create index if not exists idx_oportunidades_marketing_publicacion
  on public.oportunidades (marketing_publicacion_id) where marketing_publicacion_id is not null;

-- ============================================================ 3) el retorno
-- El valor es el que manda en todo el CRM: el total de la cotización atada y, si no hay, el estimado.
-- Una oportunidad con cotización suele tener valor_estimado nulo: sumar solo ese daría cero.
create or replace view public.v_marketing_retorno
with (security_invoker = true) as
select
  p.id as publicacion_id,
  p.idea_id,
  i.titulo,
  trim(translate(substring(i.notas from 'Serie\s+[A-Z]\s*·\s*[^\n.;|]+'), '"«»“”', '')) as serie,
  c.canal,
  c.nombre as cuenta,
  p.publicado_en,
  p.url,
  m.medida_en as medida_en,
  m.guardados,
  m.comentarios,
  m.alcance,
  n.oportunidades,
  n.con_cotizacion,
  n.valor_estimado,
  n.ganadas,
  n.valor_ganado
from public.marketing_publicaciones p
join public.marketing_ideas i on i.id = p.idea_id
join public.marketing_cuentas c on c.id = p.cuenta_id
left join lateral (
  select x.medida_en, x.guardados, x.comentarios, x.alcance
  from public.marketing_metricas x
  where x.publicacion_id = p.id
  order by x.medida_en desc
  limit 1
) m on true
cross join lateral (
  select
    count(*)::int as oportunidades,
    (count(*) filter (where o.cotizacion_id is not null))::int as con_cotizacion,
    coalesce(sum(coalesce(t.total_cotizacion, o.valor_estimado)), 0) as valor_estimado,
    (count(*) filter (where e.resultado = 'ganada'))::int as ganadas,
    coalesce(sum(coalesce(t.total_cotizacion, o.valor_estimado)) filter (where e.resultado = 'ganada'), 0) as valor_ganado
  from public.oportunidades o
  join public.etapas_config e on e.id = o.etapa_id
  left join public.v_cotizacion_totales_iva t on t.cotizacion_id = o.cotizacion_id
  where o.marketing_publicacion_id = p.id
) n;

comment on view public.v_marketing_retorno is
  'Una fila por publicacion: guardados y comentarios de la ultima medicion, y los negocios del CRM atados a ella.';

revoke all on public.v_marketing_retorno from public, anon;
grant select on public.v_marketing_retorno to authenticated;

-- ============================================================ 4) el selector del CRM
create or replace function public.fn_crm_publicaciones_recientes()
returns table (id uuid, titulo text, canal text, publicado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, i.titulo, c.canal, p.publicado_en
  from marketing_publicaciones p
  join marketing_ideas i on i.id = p.idea_id
  join marketing_cuentas c on c.id = p.cuenta_id
  where fn_tiene_permiso('comercial', 'consultar')
  order by p.publicado_en desc
  limit 100;
$$;
revoke all on function public.fn_crm_publicaciones_recientes() from public, anon;
grant execute on function public.fn_crm_publicaciones_recientes() to authenticated, service_role;

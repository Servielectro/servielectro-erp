-- CRM: origen del lead y nombres de los responsables, para los filtros (2026-10-26).
--
-- 1) oportunidades.origen_lead: de dónde llegó el negocio. Lista fija (para que el filtro
--    agrupe bien y nadie escriba "Referido" y "referido" por separado). Opcional: los negocios
--    que ya existen quedan sin origen.
-- 2) fn_crm_responsables(): id y nombre de las personas que pueden ser responsables comerciales
--    (Comercial "trabajar" o más) o que ya lo son de algún negocio. Solo id y nombre, y solo
--    para quien tenga Comercial: la tabla perfiles sigue cerrada como estaba (cada quien lo suyo
--    y Configuración "responsable").
--
-- Verificación: supabase/verificaciones/20261104000074_verificar.sql
-- Rollback:     supabase/rollbacks/20261104000074_crm_origen_y_responsables_down.sql
-- Idempotente.

alter table public.oportunidades add column if not exists origen_lead text;
alter table public.oportunidades drop constraint if exists oportunidades_origen_lead;
alter table public.oportunidades add constraint oportunidades_origen_lead check (
  origen_lead is null or origen_lead in
    ('referido', 'cliente_actual', 'llamada_entrante', 'pagina_web', 'redes_sociales', 'whatsapp', 'visita_comercial', 'licitacion', 'aliado', 'otro')
);
create index if not exists idx_oportunidades_origen on public.oportunidades (origen_lead);

create or replace function public.fn_crm_responsables()
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.nombre), ''), 'Sin nombre') as nombre
  from perfiles p
  where fn_tiene_permiso('comercial', 'consultar')
    and (
      exists (select 1 from oportunidades o where o.responsable_id = p.id)
      or exists (
        select 1 from permisos_rol pr
        where pr.rol_id = p.rol_id and pr.modulo_id = 'comercial' and pr.nivel in ('trabajar', 'responsable')
      )
    )
  order by 2;
$$;
revoke all on function public.fn_crm_responsables() from public, anon;
grant execute on function public.fn_crm_responsables() to authenticated, service_role;

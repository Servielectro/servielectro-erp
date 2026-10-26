-- Rollback de la migración 74. OJO: borra el origen del lead de todos los negocios.
drop function if exists public.fn_crm_responsables();
drop index if exists public.idx_oportunidades_origen;
alter table public.oportunidades drop constraint if exists oportunidades_origen_lead;
alter table public.oportunidades drop column if exists origen_lead;

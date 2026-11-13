-- Deshace la migración 151. Borra los vínculos entre oportunidades y publicaciones; las
-- oportunidades y las publicaciones quedan intactas.
drop function if exists public.fn_crm_publicaciones_recientes();
drop view if exists public.v_marketing_retorno;
alter table public.oportunidades drop constraint if exists oportunidades_publicacion_exige_redes;
alter table public.oportunidades drop constraint if exists oportunidades_marketing_publicacion_fk;
drop index if exists public.idx_oportunidades_marketing_publicacion;
alter table public.oportunidades drop column if exists marketing_publicacion_id;

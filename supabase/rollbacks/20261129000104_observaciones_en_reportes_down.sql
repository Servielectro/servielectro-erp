-- Deshace 20261129000104. OJO: las observaciones que no son "problema" (hallazgos, sugerencias,
-- dudas) quedan como problemas sin tipo ni norma; las que no tienen gravedad toman "detalle". Lo
-- aceptado vuelve a en_revision y lo descartado a no_es_error.
alter table public.reportes_problema drop constraint if exists reportes_problema_estado_check;
alter table public.reportes_problema drop constraint if exists reportes_problema_cierre;
update public.reportes_problema set estado = 'en_revision' where estado = 'aceptado';
update public.reportes_problema set estado = 'no_es_error' where estado = 'descartado';
update public.reportes_problema set gravedad = 'detalle' where gravedad is null;
alter table public.reportes_problema add constraint reportes_problema_estado_check
  check (estado in ('nuevo', 'en_revision', 'resuelto', 'no_es_error'));
alter table public.reportes_problema add constraint reportes_problema_cierre
  check (estado not in ('resuelto', 'no_es_error') or length(trim(coalesce(nota_cierre, ''))) > 0);
alter table public.reportes_problema alter column gravedad set not null;
drop index if exists public.idx_reportes_problema_modulo;
alter table public.reportes_problema drop constraint if exists reportes_problema_tipo;
alter table public.reportes_problema drop constraint if exists reportes_problema_norma;
alter table public.reportes_problema drop constraint if exists reportes_problema_gravedad_requerida;
alter table public.reportes_problema drop constraint if exists reportes_problema_seccion;
alter table public.reportes_problema drop column if exists modulo;
alter table public.reportes_problema drop column if exists seccion;
alter table public.reportes_problema drop column if exists norma;
alter table public.reportes_problema drop column if exists tipo;
-- La función de reglas queda con las columnas nuevas en la comparación: vuelve a correr la
-- sección 2 de la migración 73 para dejarla como estaba.

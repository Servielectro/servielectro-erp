-- Deshace SOLO lo nuevo de 20261020000048. Las columnas momento y fotos_minimas_dia
-- las agregó el usuario a mano y se dejan.
alter table public.visita_jornadas drop column if exists motivo_fotos_incompletas;
alter table public.visita_jornadas drop column if exists fotos_al_salir;

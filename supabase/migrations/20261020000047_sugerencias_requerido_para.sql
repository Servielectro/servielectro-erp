-- YA APLICADA a mano por el usuario (2026-10-20). Este archivo la deja registrada en el
-- repo para que los archivos no se aparten de la base. Idempotente: correrla de nuevo
-- no cambia nada.
--
-- Para cuándo necesita el técnico el material que sugiere ("50 m de UTP para pasado
-- mañana"). Sin esa fecha la sugerencia no sirve para comprar a tiempo. La app la pide
-- en las visitas de tipo obra.

alter table public.visita_sugerencias add column if not exists requerido_para date;

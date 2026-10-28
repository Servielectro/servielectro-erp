-- Deshace 20261127000102 (lecturas de documentos). BORRA las lecturas guardadas (se pueden volver
-- a pedir; cuestan una llamada a la IA cada una).
drop table if exists public.documento_lecturas;
drop function if exists public.fn_documento_lecturas_reglas();

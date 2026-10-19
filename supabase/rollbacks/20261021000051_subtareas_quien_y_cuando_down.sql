-- Deshace 20261021000051: las columnas quedan, sin trigger que las llene.
drop trigger if exists trg_subtarea_quien_y_cuando on public.tarea_subtareas;
drop function if exists public.fn_subtarea_quien_y_cuando();

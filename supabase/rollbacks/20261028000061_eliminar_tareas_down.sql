-- Rollback de 20261028000061. OJO: borra tareas_eliminadas y con ella el rastro de las tareas
-- que ya se eliminaron (esas tareas no vuelven: ya no existen). Exportarla antes si importa.

drop function if exists public.fn_eliminar_tarea(uuid, text);
drop trigger if exists trg_tareas_eliminadas_intocable on public.tareas_eliminadas;
drop function if exists public.fn_tareas_eliminadas_intocable();
drop table if exists public.tareas_eliminadas;

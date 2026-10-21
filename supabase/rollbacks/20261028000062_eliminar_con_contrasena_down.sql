-- Rollback de 20261028000062. OJO: borra elementos_eliminados, con el rastro de todo lo que ya
-- se eliminó (eso no vuelve: ya no existe). Exportarla antes si importa. No recrea la tabla de
-- la 61 (tareas_eliminadas): si se quiere volver a ese esquema, correr la 61 después.

drop function if exists public.fn_eliminar_visita(uuid, text);
drop function if exists public.fn_eliminar_tarea(uuid, text);
drop function if exists public.fn_reautenticado_reciente();
drop function if exists public.fn_reautenticacion_registrar(uuid, boolean);
drop function if exists public.fn_reautenticacion_bloqueada_hasta(uuid);
drop function if exists public.fn_reautenticacion_consumir(uuid);
drop table if exists public.reautenticaciones;
drop trigger if exists trg_elementos_eliminados_intocable on public.elementos_eliminados;
drop function if exists public.fn_elementos_eliminados_intocable();
drop table if exists public.elementos_eliminados;

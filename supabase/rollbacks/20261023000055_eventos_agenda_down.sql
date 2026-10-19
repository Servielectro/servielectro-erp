-- Deshace 20261023000055 (eventos de la Agenda). BORRA los eventos con su historial:
-- correrlo solo si todavía no hay eventos reales. Las tareas no se tocan.
drop table if exists public.evento_historial;
drop table if exists public.evento_participantes;
drop table if exists public.eventos;
drop function if exists public.fn_eventos_historial();
drop function if exists public.fn_evento_participantes_reglas();
drop function if exists public.fn_eventos_reglas();
drop function if exists public.fn_grupos_para_compartir();
drop function if exists public.fn_evento_tiene_participantes(uuid);
drop function if exists public.fn_puede_ver_evento(uuid);
drop function if exists public.fn_es_participante_evento(uuid);

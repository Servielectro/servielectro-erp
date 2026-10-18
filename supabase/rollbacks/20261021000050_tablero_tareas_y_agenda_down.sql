-- Deshace 20261021000050 (tablero de tareas y agenda). BORRA las tablas del tablero con
-- sus datos (incluida la agenda personal): correrlo solo si todavía no hay tareas reales.
-- Quita el rol Coordinador solo si no tiene usuarios.

drop table if exists public.tarea_eventos;
drop table if exists public.tarea_dependencias;
drop table if exists public.tarea_subtareas;
drop table if exists public.tarea_asignados;
drop table if exists public.tareas;

drop function if exists public.fn_personas_asignables();
drop function if exists public.fn_proyectos_para_tareas();
drop function if exists public.fn_tarea_dependencias_sin_ciclos();
drop function if exists public.fn_tarea_asignados_reglas();
drop function if exists public.fn_nota_tarea(uuid, text);
drop function if exists public.fn_tarea_hijos_historial();
drop function if exists public.fn_tareas_historial();
drop function if exists public.fn_tareas_reglas();
drop function if exists public.fn_bloqueo_tarea(uuid, text);
drop function if exists public.fn_tarea_tiene_asignados(uuid);
drop function if exists public.fn_etiqueta_estado_tarea(text);
drop function if exists public.fn_nombre_actor();
drop function if exists public.fn_puede_editar_tarea(uuid);
drop function if exists public.fn_puede_ver_tarea(uuid);
drop function if exists public.fn_es_asignado_tarea(uuid);

delete from public.permisos_rol
where rol_id = (select id from public.roles where nombre = 'Coordinador')
  and not exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol_id where r.nombre = 'Coordinador');
delete from public.roles r
where r.nombre = 'Coordinador'
  and not exists (select 1 from public.perfiles p where p.rol_id = r.id);

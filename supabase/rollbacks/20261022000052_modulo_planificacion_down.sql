-- Deshace 20261022000052. Las tareas no se tocan (la agenda vive en tareas, migración 50).
drop trigger if exists trg_permisos_rol_no_para_todos on public.permisos_rol;
drop function if exists public.fn_permisos_rol_no_para_todos();
delete from public.modulos where id = 'planificacion';
alter table public.modulos drop column if exists para_todos;

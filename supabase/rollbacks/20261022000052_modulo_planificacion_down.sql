-- Deshace 20261022000052: la creación de tareas vuelve a la regla de la migración 50
-- (internas: cualquiera con sesión) y se quita el módulo con sus permisos. Las tareas no
-- se tocan.
drop policy if exists tareas_insert on public.tareas;
create policy tareas_insert on public.tareas for insert to authenticated
  with check (creada_por = auth.uid() and (visibilidad = 'interna' or fn_tiene_permiso('operativo', 'trabajar')));

delete from public.permisos_rol where modulo_id = 'planificacion';
delete from public.modulos where id = 'planificacion';

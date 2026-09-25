-- Rollback de 20260926000024_renombrar_modulo_usuarios_a_configuracion.sql
insert into modulos (id, nombre, orden)
values ('usuarios', 'Usuarios y permisos', 0)
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden;

update permisos_rol
set modulo_id = 'usuarios'
where modulo_id = 'configuracion';

delete from modulos where id = 'configuracion';

drop policy if exists roles_write on roles;
create policy roles_write on roles for all to authenticated
  using (fn_tiene_permiso('usuarios', 'responsable'))
  with check (fn_tiene_permiso('usuarios', 'responsable'));

drop policy if exists permisos_rol_write on permisos_rol;
create policy permisos_rol_write on permisos_rol for all to authenticated
  using (fn_tiene_permiso('usuarios', 'responsable'))
  with check (fn_tiene_permiso('usuarios', 'responsable'));

drop policy if exists perfiles_select on perfiles;
create policy perfiles_select on perfiles for select to authenticated
  using (id = auth.uid() or fn_tiene_permiso('usuarios', 'responsable'));

drop policy if exists perfiles_write on perfiles;
create policy perfiles_write on perfiles for all to authenticated
  using (fn_tiene_permiso('usuarios', 'responsable'))
  with check (fn_tiene_permiso('usuarios', 'responsable'));

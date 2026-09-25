-- Rollback de 20260926000023_permisos_esquema.sql
drop policy if exists perfiles_write on perfiles;
drop policy if exists perfiles_select on perfiles;
drop policy if exists permisos_rol_write on permisos_rol;
drop policy if exists permisos_rol_select on permisos_rol;
drop policy if exists roles_write on roles;
drop policy if exists roles_select on roles;
drop policy if exists modulos_select on modulos;

drop function if exists fn_mis_permisos();
drop function if exists fn_ve_datos_sensibles(text);
drop function if exists fn_tiene_permiso(text, nivel_permiso);

drop table if exists perfiles;
drop table if exists permisos_rol;
drop table if exists roles;
drop table if exists modulos;

drop type if exists nivel_permiso;

-- Jhojan pidió sacar "Usuarios y permisos" de la barra de navegación y convertirlo en un
-- módulo más de la grilla de inicio, activo, llamado "Configuración" — por ahora adentro
-- solo va Usuarios y gestión de usuarios; más adelante puede sumar otras pantallas de
-- configuración del sistema.
--
-- El id del módulo ('usuarios') es clave primaria referenciada por permisos_rol.modulo_id
-- y por el string literal 'usuarios' dentro de fn_tiene_permiso(...) en 4 políticas RLS
-- (roles_write, permisos_rol_write, perfiles_select, perfiles_write, de la migración
-- 20260926000023_permisos_esquema.sql). Todo se actualiza en la misma migración: si
-- alguna política se quedara apuntando a 'usuarios', fn_tiene_permiso('usuarios', ...)
-- pasaría a devolver false para todo el mundo (incluido Jhojan) porque ya no habría
-- ninguna fila en permisos_rol con ese modulo_id.
--
-- Idempotente: se puede correr más de una vez sin romper.

-- 1) Insertar el módulo nuevo (o actualizar nombre/orden si ya existe)
insert into modulos (id, nombre, orden)
values ('configuracion', 'Configuración', 0)
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden;

-- 2) Mover las filas de permisos_rol que apuntaban a 'usuarios'
update permisos_rol
set modulo_id = 'configuracion'
where modulo_id = 'usuarios';

-- 3) Borrar el módulo viejo (ya sin referencias, o ya borrado en una corrida anterior)
delete from modulos where id = 'usuarios';

-- 4) Recrear las 4 políticas que revisaban fn_tiene_permiso('usuarios', ...) para que
-- apunten a 'configuracion'.
drop policy if exists roles_write on roles;
create policy roles_write on roles for all to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable'))
  with check (fn_tiene_permiso('configuracion', 'responsable'));

drop policy if exists permisos_rol_write on permisos_rol;
create policy permisos_rol_write on permisos_rol for all to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable'))
  with check (fn_tiene_permiso('configuracion', 'responsable'));

drop policy if exists perfiles_select on perfiles;
create policy perfiles_select on perfiles for select to authenticated
  using (id = auth.uid() or fn_tiene_permiso('configuracion', 'responsable'));

drop policy if exists perfiles_write on perfiles;
create policy perfiles_write on perfiles for all to authenticated
  using (fn_tiene_permiso('configuracion', 'responsable'))
  with check (fn_tiene_permiso('configuracion', 'responsable'));

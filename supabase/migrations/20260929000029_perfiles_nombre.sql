-- Usuarios — nombre visible del usuario y listado con nombre.
--
-- `perfiles` no tenía nombre: la lista de Configuración → Usuarios solo podía mostrar
-- el correo (que sale de auth.users vía fn_listar_usuarios, migración 25). El nombre se
-- carga al crear el usuario desde la app.
--
-- fn_listar_usuarios cambia su tipo de retorno (suma `nombre`), y Postgres no permite
-- cambiar el tipo de retorno con `create or replace`: se dropea y se recrea con los
-- mismos permisos. Sigue exponiendo de auth.users SOLO id, email, created_at y
-- last_sign_in_at, y solo a responsables de Configuración.
--
-- Idempotente.

alter table perfiles add column if not exists nombre text;

drop function if exists fn_listar_usuarios();

create function fn_listar_usuarios()
returns table (
  id uuid,
  email text,
  nombre text,
  rol_id uuid,
  creado timestamptz,
  ultimo_ingreso timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email::text, p.nombre, p.rol_id, u.created_at, u.last_sign_in_at
  from auth.users u
  left join perfiles p on p.id = u.id
  where fn_tiene_permiso('configuracion', 'responsable')
  order by coalesce(p.nombre, u.email::text);
$$;

revoke all on function fn_listar_usuarios() from public, anon;
grant execute on function fn_listar_usuarios() to authenticated;

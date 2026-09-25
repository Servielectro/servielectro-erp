-- Módulo de usuarios — Fase 2a (interfaz): listado de usuarios para la pantalla de
-- Configuración → Usuarios y permisos.
--
-- El correo vive en auth.users, que la app (clave publicable) no puede leer. Esta
-- función lo expone SOLO a quien es responsable del módulo 'configuracion'; para
-- cualquier otro devuelve cero filas. security definer porque auth.users no es
-- accesible para el rol authenticated.
--
-- Los usuarios nuevos se crean desde el panel de Supabase (Authentication → Users →
-- Add user): crearlos desde la app exigiría la service key en el servidor. Un usuario
-- recién creado no tiene fila en perfiles; aparece acá con rol_id null (sin acceso a
-- nada) hasta que se le asigne un rol desde la app.
--
-- Idempotente.

create or replace function fn_listar_usuarios()
returns table (
  id uuid,
  email text,
  rol_id uuid,
  creado timestamptz,
  ultimo_ingreso timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email::text, p.rol_id, u.created_at, u.last_sign_in_at
  from auth.users u
  left join perfiles p on p.id = u.id
  where fn_tiene_permiso('configuracion', 'responsable')
  order by u.email;
$$;

revoke all on function fn_listar_usuarios() from public, anon;
grant execute on function fn_listar_usuarios() to authenticated;

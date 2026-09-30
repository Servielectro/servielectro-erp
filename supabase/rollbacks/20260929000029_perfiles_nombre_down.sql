-- Vuelve a la versión de la migración 25 (sin nombre) y quita la columna.
drop function if exists fn_listar_usuarios();
create function fn_listar_usuarios()
returns table (id uuid, email text, rol_id uuid, creado timestamptz, ultimo_ingreso timestamptz)
language sql security definer set search_path = public stable
as $$
  select u.id, u.email::text, p.rol_id, u.created_at, u.last_sign_in_at
  from auth.users u left join perfiles p on p.id = u.id
  where fn_tiene_permiso('configuracion', 'responsable')
  order by u.email;
$$;
revoke all on function fn_listar_usuarios() from public, anon;
grant execute on function fn_listar_usuarios() to authenticated;
alter table perfiles drop column if exists nombre;

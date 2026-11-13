-- Usuarios: dar de baja (y reactivar) y saber si una cuenta se puede borrar.
--
-- Por qué baja y no borrado: ~30 llaves foráneas apuntan a auth.users con ON DELETE NO ACTION
-- (eventos.creado_por, documentos.subido_por, visitas.cerrada_por, sst_*, licitaciones, CRM…).
-- Borrar a alguien que trabajó en el sistema falla en la base, y forzarlo borraría la trazabilidad
-- de quién firmó, inspeccionó o publicó. Así que quien ya trabajó se DESACTIVA; solo una cuenta
-- sin ningún rastro (creada por error) se borra de Auth.
--
-- Mismo patrón que cliente_usuarios (migración 134): activo + desactivado_en / desactivado_por /
-- motivo_desactivacion, con el check que exige motivo cuando activo = false.
--
-- Cómo queda afuera quien se da de baja (las tres cosas, no una sola):
--   1) Se le quita el rol (se guarda en rol_id_antes_baja para reactivarlo igual). fn_tiene_permiso
--      y toda la RLS salen de perfiles.rol_id, así que desde ese instante su sesión, aunque siga
--      viva, no lee ni escribe nada. Y como todos los selectores de responsable/asignación
--      (fn_personas_asignables, fn_tecnicos_asignables, fn_sst_usuarios_convocables,
--      fn_personas_planificacion, rama de rol de fn_crm_responsables) salen del rol, deja de
--      aparecer en ellos SIN tocar esas funciones (la base tiene drift: no se redefinen aquí).
--   2) Se le cierran las sesiones abiertas (auth.sessions; los refresh tokens se van en cascada).
--   3) La app lo bloquea en Auth (ban) con la clave secreta: no puede volver a iniciar sesión.
-- Su nombre sigue en perfiles: lo que firmó o creó lo sigue mostrando.
--
-- No redefine ninguna función ni política existente. Idempotente.

-- ============================================================ 0) lo que esta migración supone
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'perfiles' and column_name = 'rol_id') then
    raise exception 'perfiles.rol_id no existe: esta base no es la que supone la migración 153.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cliente_usuarios' and column_name = 'activo') then
    raise exception 'Falta cliente_usuarios.activo (migración 134). Córrela antes de la 153.';
  end if;
  if to_regclass('auth.sessions') is null then
    raise exception 'No existe auth.sessions: no se pueden cerrar sesiones desde la base.';
  end if;
end $$;

-- ============================================================ 1) columnas en perfiles
alter table public.perfiles add column if not exists activo boolean not null default true;
alter table public.perfiles add column if not exists desactivado_en timestamptz;
alter table public.perfiles add column if not exists desactivado_por uuid references auth.users(id);
alter table public.perfiles add column if not exists motivo_desactivacion text;
-- El rol que tenía al darse de baja, para reactivarlo igual. Si ese rol se borra mientras tanto,
-- queda null y se reactiva sin rol (no ve nada hasta que le asignen uno).
alter table public.perfiles add column if not exists rol_id_antes_baja uuid references public.roles(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_desactivado'
                  and conrelid = 'public.perfiles'::regclass) then
    alter table public.perfiles add constraint perfiles_desactivado
      check (activo or length(trim(coalesce(motivo_desactivacion, ''))) > 0);
  end if;
end $$;

-- ============================================================ 2) responsables de Configuración que quedan
-- Cuántas personas ACTIVAS, sin contar a p_excepto, siguen siendo responsables de Configuración.
-- Candado: ni la baja ni el borrado pueden dejar el sistema sin nadie que lo administre.
create or replace function public.fn_otros_responsables_config(p_excepto uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from perfiles p
  join permisos_rol pr on pr.rol_id = p.rol_id and pr.modulo_id = 'configuracion' and pr.nivel = 'responsable'
  where p.activo and p.id <> p_excepto
    and fn_tiene_permiso('configuracion', 'responsable');
$$;

-- ============================================================ 3) dar de baja
-- Devuelve cuántas sesiones se cerraron, o null si la base no dejó borrarlas (la baja igual
-- queda hecha: sin rol no ve nada, y el bloqueo en Auth lo pone la app).
create or replace function public.fn_dar_de_baja_usuario(p_usuario uuid, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
  v_sesiones integer;
begin
  if not fn_tiene_permiso('configuracion', 'responsable') then
    raise exception 'Dar de baja usuarios requiere Configuración en nivel «responsable».';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes darte de baja a ti mismo.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe el motivo de la baja.';
  end if;

  select * into v_perfil from perfiles where id = p_usuario for update;
  if not found then
    -- Cuenta de Auth sin perfil (creada en el panel y nunca configurada): se le crea el perfil
    -- ya dado de baja, para que el rastro quede igual que en las demás.
    insert into perfiles (id, activo, desactivado_en, desactivado_por, motivo_desactivacion)
    values (p_usuario, false, now(), auth.uid(), trim(p_motivo));
  else
    if not v_perfil.activo then
      raise exception 'Esa persona ya estaba dada de baja.';
    end if;
    if exists (select 1 from roles r where r.id = v_perfil.rol_id and r.nombre = 'Cliente')
       or exists (select 1 from cliente_usuarios cu where cu.perfil_id = p_usuario) then
      raise exception 'Las cuentas del portal del cliente se desactivan en Configuración → Usuarios del portal del cliente.';
    end if;
    if fn_otros_responsables_config(p_usuario) = 0 then
      raise exception 'No se puede: el sistema quedaría sin ningún responsable de Configuración activo.';
    end if;
    update perfiles
       set activo = false,
           desactivado_en = now(),
           desactivado_por = auth.uid(),
           motivo_desactivacion = trim(p_motivo),
           rol_id_antes_baja = v_perfil.rol_id,
           rol_id = null
     where id = p_usuario;
  end if;

  begin
    delete from auth.sessions where user_id = p_usuario;
    get diagnostics v_sesiones = row_count;
  exception when insufficient_privilege then
    v_sesiones := null;
  end;
  return v_sesiones;
end;
$$;

-- ============================================================ 4) reactivar
-- Devuelve el rol con el que vuelve (null = sin rol). Se conserva la última baja (fecha, quién
-- y motivo) como rastro, igual que en cliente_usuarios.
create or replace function public.fn_reactivar_usuario(p_usuario uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
begin
  if not fn_tiene_permiso('configuracion', 'responsable') then
    raise exception 'Reactivar usuarios requiere Configuración en nivel «responsable».';
  end if;
  select * into v_perfil from perfiles where id = p_usuario for update;
  if not found then
    raise exception 'No se encontró el usuario.';
  end if;
  if v_perfil.activo then
    raise exception 'Esa persona ya estaba activa.';
  end if;
  update perfiles
     set activo = true,
         rol_id = v_perfil.rol_id_antes_baja,
         rol_id_antes_baja = null
   where id = p_usuario;
  return v_perfil.rol_id_antes_baja;
end;
$$;

-- ============================================================ 5) ¿tiene historial?
-- Cuántas filas de cada tabla apuntan a esta persona por una llave foránea que NO es en cascada
-- (NO ACTION / RESTRICT harían fallar el borrado; SET NULL / SET DEFAULT borrarían en silencio
-- quién hizo qué). Las que son en cascada (su perfil, sus suscripciones de avisos, sus
-- preferencias) son de la cuenta y se van con ella: no cuentan como historial.
-- Mira llaves hacia auth.users y hacia perfiles. Lo que guarde un id sin llave foránea no se ve.
create or replace function public.fn_usuario_historial(p_usuario uuid)
returns table (tabla text, columna text, filas bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_n bigint;
begin
  if not fn_tiene_permiso('configuracion', 'responsable') then
    raise exception 'Requiere Configuración en nivel «responsable».';
  end if;
  for r in
    select c.conrelid::regclass as rel, n.nspname as esquema, t.relname as nombre_tabla, a.attname as col
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid in ('auth.users'::regclass, 'public.perfiles'::regclass)
      and array_length(c.conkey, 1) = 1
      and c.confdeltype <> 'c'
      and n.nspname <> 'auth'
  loop
    execute format('select count(*) from %s where %I = $1', r.rel, r.col) into v_n using p_usuario;
    if v_n > 0 then
      tabla := case when r.esquema = 'public' then r.nombre_tabla::text else r.esquema || '.' || r.nombre_tabla end;
      columna := r.col::text;
      filas := v_n;
      return next;
    end if;
  end loop;
end;
$$;

-- ============================================================ 6) privilegios
revoke all on function public.fn_otros_responsables_config(uuid) from public, anon;
revoke all on function public.fn_dar_de_baja_usuario(uuid, text) from public, anon;
revoke all on function public.fn_reactivar_usuario(uuid) from public, anon;
revoke all on function public.fn_usuario_historial(uuid) from public, anon;
grant execute on function public.fn_otros_responsables_config(uuid) to authenticated;
grant execute on function public.fn_dar_de_baja_usuario(uuid, text) to authenticated;
grant execute on function public.fn_reactivar_usuario(uuid) to authenticated;
grant execute on function public.fn_usuario_historial(uuid) to authenticated;

-- Para probar después de aplicar (desde la app, con un usuario de prueba):
--   1) Dar de baja → select activo, rol_id, rol_id_antes_baja from perfiles where id = <id>;
--      → false, null, el rol que tenía. select count(*) from auth.sessions where user_id = <id>; → 0
--   2) Reactivar → activo true y el rol de vuelta.
--   3) select * from fn_usuario_historial(<id de alguien que trabajó>); → lista de tablas.

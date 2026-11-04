-- Candado: una cuenta con rol «Cliente» sin su fila en cliente_usuarios no puede existir.
--
-- Pasó en producción (tintalafasevi@gmail.com, 2026-11-04): la cuenta quedó con rol Cliente y sin
-- enlace, y el portal le decía "Tu acceso al portal no está activo". La app ya lo frena (la pantalla
-- normal de usuarios no deja asignar el rol Cliente, y "Usuarios del portal del cliente" enlaza
-- ANTES de asignar el rol), pero la regla vive aquí para que ningún camino la salte: SQL a mano,
-- otra pantalla futura, un script.
--
-- Constraint triggers DIFERIDOS: se revisa al terminar la transacción, así una transacción que
-- haga las dos cosas (rol + enlace) pasa en cualquier orden. Desde la app cada sentencia es su
-- propia transacción, por eso la app enlaza primero y asigna el rol después.
--
-- Desactivar (activo = false) NO viola el candado: la fila sigue ahí, con su motivo.

-- 0) Antes de crear el candado: si ya hay cuentas huérfanas, no se aplica en silencio.
do $$
declare v_huerfanas text;
begin
  select string_agg(coalesce(p.nombre, p.id::text), ', ')
    into v_huerfanas
  from public.perfiles p
  join public.roles r on r.id = p.rol_id and r.nombre = 'Cliente'
  where not exists (select 1 from public.cliente_usuarios cu where cu.perfil_id = p.id);
  if v_huerfanas is not null then
    raise exception 'Hay cuentas con rol Cliente sin cliente enlazado: %. Enlázalas (o quítales el rol) y vuelve a correr esta migración.', v_huerfanas;
  end if;
end $$;

create or replace function public.fn_rol_cliente_exige_enlace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil uuid;
begin
  v_perfil := case when tg_table_name = 'perfiles' then new.id else old.perfil_id end;
  if exists (select 1 from perfiles p join roles r on r.id = p.rol_id
              where p.id = v_perfil and r.nombre = 'Cliente')
     and not exists (select 1 from cliente_usuarios cu where cu.perfil_id = v_perfil) then
    raise exception 'Una cuenta con rol Cliente necesita su cliente enlazado. Créala en Configuración → Usuarios del portal del cliente.';
  end if;
  return null;
end;
$$;

revoke all on function public.fn_rol_cliente_exige_enlace() from public, anon, authenticated;

-- Asignar el rol (o crear el perfil con él).
drop trigger if exists trg_perfiles_rol_cliente_enlace on public.perfiles;
create constraint trigger trg_perfiles_rol_cliente_enlace
  after insert or update of rol_id on public.perfiles
  deferrable initially deferred
  for each row execute function public.fn_rol_cliente_exige_enlace();

-- Quitar el enlace (o moverlo a otro perfil) dejando la cuenta con rol Cliente.
-- Si se borra la cuenta entera (perfiles en cascada), al final el perfil ya no existe y pasa.
drop trigger if exists trg_cliente_usuarios_enlace on public.cliente_usuarios;
create constraint trigger trg_cliente_usuarios_enlace
  after delete or update of perfil_id on public.cliente_usuarios
  deferrable initially deferred
  for each row execute function public.fn_rol_cliente_exige_enlace();

-- Para probar después de aplicar (y revertir):
--   1) update perfiles set rol_id = (select id from roles where nombre = 'Cliente') where id = <perfil interno sin enlace>;
--      → debe fallar con "Una cuenta con rol Cliente necesita su cliente enlazado".
--   2) delete from cliente_usuarios where perfil_id = <tintalafasevi>;   → debe fallar.
--   3) begin; insert into cliente_usuarios (...); update perfiles set rol_id = <Cliente> ...; commit;  → pasa.

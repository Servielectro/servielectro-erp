-- Encender el aviso al celular (Web Push) sobre lo preparado en la 76 (2026-10-27).
--
-- 1) fn_registrar_suscripcion: guarda el dispositivo del que acaba de activar los avisos. Un mismo
--    celular tiene un solo "endpoint": si antes lo activó otra persona (celular compartido o que
--    cambió de dueño), pasa a quien lo activó ahora; nunca le llegan a uno los avisos de otro.
--    Security definer porque esa fila puede ser de otro perfil (la RLS no le deja tocarla); solo
--    escribe la del endpoint que trae el navegador, y siempre a nombre de quien llama.
-- 2) fn_revocar_suscripcion: "desactivar en este celular". Solo la propia.
-- 3) Lo que ya existía no sale al celular: al encender, todas las notificaciones viejas quedan
--    marcadas como enviadas. Solo viaja lo nuevo.
--
-- El envío lo hace la Edge Function "enviar-push" (supabase/functions/enviar-push), con cron, con
-- la clave de servicio: no depende de ningún PC. El texto que viaja es el mismo de la
-- notificación (sin montos: sale en la pantalla de bloqueo).
--
-- Verificación: supabase/verificaciones/20261109000081_verificar.sql
-- Rollback:     supabase/rollbacks/20261109000081_push_encender_down.sql
-- Idempotente.

create or replace function public.fn_registrar_suscripcion(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión no se activan avisos.';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(coalesce(p_p256dh, '')) < 20 or length(coalesce(p_auth, '')) < 8 then
    raise exception 'El navegador no entregó una suscripción válida.';
  end if;
  insert into notificacion_suscripciones (perfil_id, endpoint, p256dh, auth, dispositivo, creada_en, revocada_en)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 300), now(), null)
  on conflict (endpoint) do update set
    perfil_id = auth.uid(),
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    dispositivo = excluded.dispositivo,
    creada_en = now(),
    revocada_en = null
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.fn_revocar_suscripcion(p_endpoint text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with r as (
    update notificacion_suscripciones set revocada_en = now()
    where endpoint = p_endpoint and perfil_id = auth.uid() and revocada_en is null
    returning 1
  )
  select exists (select 1 from r);
$$;

-- Lo viejo no se manda al encender: solo lo que se cree desde ahora.
update public.notificaciones set push_enviada_en = now() where push_enviada_en is null;

revoke all on function public.fn_registrar_suscripcion(text, text, text, text) from public, anon;
grant execute on function public.fn_registrar_suscripcion(text, text, text, text) to authenticated, service_role;
revoke all on function public.fn_revocar_suscripcion(text) from public, anon;
grant execute on function public.fn_revocar_suscripcion(text) to authenticated, service_role;

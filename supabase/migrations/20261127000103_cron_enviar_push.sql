-- Cron de los avisos al celular (2026-10-27). La plomería de la 76 y la 81 estaba completa pero el
-- tubo tapado: la Edge Function "enviar-push" no estaba desplegada, pg_cron no estaba instalado y
-- nadie la llamaba. El orquestador ya desplegó la función e instaló pg_cron y pg_net. Esto programa
-- la llamada: cada minuto, POST a enviar-push con la clave de servicio.
--
-- LA CLAVE NO VA AQUÍ. Lo que se escribe en cron.schedule queda guardado en texto plano en
-- cron.job, y lo ve cualquiera que lea esa tabla. La clave vive en Vault (cifrada) con el nombre
-- 'clave_servicio_cron' y el job la lee en cada vuelta desde vault.decrypted_secrets. La carga
-- Jhojan UNA vez desde el panel (Integrations → Vault → Add new secret), no por el editor SQL
-- (el editor guarda el historial de lo que se corre).
--
-- Qué clave: la "service_role" de las claves LEGADAS (Project Settings → API Keys → Legacy API
-- Keys). La función compara el Bearer con SUPABASE_SERVICE_ROLE_KEY, que es esa, y la puerta de
-- las Edge Functions exige un JWT: una clave nueva sb_secret_… no pasa.
--
-- Mientras falten los secretos VAPID de la función, cada vuelta responde 500 "Faltan secretos" y
-- no manda nada: no hay disparo en falso.
--
-- Requiere pg_cron, pg_net y el secreto en Vault: si falta el secreto, esta migración se detiene y
-- lo dice (sin el secreto, el job mandaría "Bearer " vacío cada minuto).
-- Idempotente: cron.schedule con el mismo nombre reemplaza el job.
-- Verificación: supabase/verificaciones/20261127000103_verificar.sql
-- Rollback:     supabase/rollbacks/20261127000103_cron_enviar_push_down.sql

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'Falta la extensión pg_cron (Database → Extensions).';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Falta la extensión pg_net (Database → Extensions).';
  end if;
  if not exists (select 1 from vault.secrets where name = 'clave_servicio_cron') then
    raise exception 'Primero carga la clave en Vault con el nombre clave_servicio_cron (Integrations → Vault → Add new secret; la service_role de Legacy API Keys).';
  end if;
end $$;

-- La URL del proyecto no es secreta; la clave sí, y se lee de Vault en cada vuelta.
select cron.schedule(
  'enviar-push',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://ehbgasnmsbqxruvjavis.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'clave_servicio_cron')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

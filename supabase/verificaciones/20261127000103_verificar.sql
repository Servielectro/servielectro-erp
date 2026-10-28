-- Verificación de la migración 103 (cron de enviar-push). Correr DESPUÉS de la migración. No crea
-- nada. Las filas 1 deben decir OK de una vez; la 2 necesita que el cron haya corrido (esperar
-- 2 o 3 minutos y volver a correr este archivo).

-- ============================================================ 1) el job, sin la clave en texto plano
select prueba, esperado, resultado, case when esperado = resultado then 'OK' else 'REVISAR' end as estado
from (
  select '1a el job existe, cada minuto, activo' as prueba, '* * * * * / true' as esperado,
         coalesce((select schedule || ' / ' || active::text from cron.job where jobname = 'enviar-push'), '(no está)') as resultado
  union all
  select '1b el comando NO trae una clave escrita (ni JWT ni sb_secret_)', 'false',
         coalesce((select (command ~ 'eyJ[A-Za-z0-9_-]{10,}' or command ~ 'sb_secret_')::text from cron.job where jobname = 'enviar-push'), '(no está)')
  union all
  select '1c el comando lee la clave de Vault', 'true',
         coalesce((select (command like '%vault.decrypted_secrets%' and command like '%clave_servicio_cron%')::text from cron.job where jobname = 'enviar-push'), '(no está)')
  union all
  select '1d el secreto está en Vault', 'true', exists (select 1 from vault.secrets where name = 'clave_servicio_cron')::text
  union all
  select '1e el secreto parece un JWT (la service_role legada)', 'true',
         coalesce((select (decrypted_secret like 'eyJ%')::text from vault.decrypted_secrets where name = 'clave_servicio_cron'), '(no está)')
) t;

-- ============================================================ 2) lo que respondió la función (últimas vueltas)
-- Esperado mientras falten los secretos VAPID: 500 con "Faltan secretos". Con ellos: 200 con
-- {"enviadas":0} o {"notificaciones":n,…}. Un 401 = la clave de Vault no es la service_role
-- legada. Un 404 = la función no está desplegada con ese nombre.
select r.id, r.status_code, left(coalesce(r.content::text, r.error_msg), 160) as respuesta, r.created
from net._http_response r
order by r.created desc
limit 5;

-- Las últimas corridas del job (si no hay, el cron no está corriendo).
select d.status, d.return_message, d.start_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'enviar-push'
order by d.start_time desc
limit 5;

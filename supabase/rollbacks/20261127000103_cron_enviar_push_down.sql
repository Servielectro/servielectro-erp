-- Deshace 20261127000103: apaga el cron de enviar-push. El secreto de Vault queda (bórralo desde
-- Integrations → Vault si ya no se usa: también lo usará el cron de respaldar-drive).
select cron.unschedule('enviar-push') where exists (select 1 from cron.job where jobname = 'enviar-push');

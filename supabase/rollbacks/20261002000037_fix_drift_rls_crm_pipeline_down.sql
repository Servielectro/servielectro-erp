-- Rollback de 20261002000037: vuelve al estado (con drift) que había antes.
drop policy if exists etapas_config_select on etapas_config;
drop policy if exists etapas_config_write on etapas_config;
create policy etapas_config_authenticated_read on etapas_config for select to authenticated using (true);

drop policy if exists oportunidad_etapas_historial_select on oportunidad_etapas_historial;
create policy historial_authenticated_all on oportunidad_etapas_historial for all to authenticated
  using (true) with check (true);

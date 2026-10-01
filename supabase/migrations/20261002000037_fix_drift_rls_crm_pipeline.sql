-- Corrige drift entre el archivo de la migración 27 (CRM — pipeline de oportunidades) y lo
-- que realmente había en la base — detectado al auditar RRHH/Licitaciones/CRM igual que se
-- hizo con la 36 (2026-10-02):
--
--   etapas_config: en la base solo existía "etapas_config_authenticated_read" (select).
--   Faltaba la política de escritura — nadie, ni Jhojan, podía ajustar los umbrales
--   (dias_alerta/dias_estancada) de las etapas. No se notó porque hoy no hay pantalla que
--   edite esto, pero quedaba mal si se llega a construir.
--
--   oportunidad_etapas_historial: en la base había "historial_authenticated_all" (for all,
--   using true) en vez de la política de solo lectura del archivo. Esto deshacía el diseño
--   explícito de la 27: "el historial lo escriben los triggers, nunca la app... nadie lo
--   puede editar a mano" — en la práctica, cualquier usuario autenticado podía insertar,
--   editar o borrar filas del historial directo, sin pasar por el trigger. El trigger
--   (fn_oportunidad_historial, security definer, dueño postgres) sigue escribiendo sin
--   problema con la tabla en RLS normal, porque el dueño de la tabla no está forzado a
--   cumplir su propia RLS (relforcerowsecurity = false) — confirmado antes de aplicar esto.
--
-- Esta migración deja la base igual a lo que el archivo 20260929000027 siempre dijo.
-- Idempotente.

drop policy if exists etapas_config_authenticated_read on etapas_config;
drop policy if exists etapas_config_select on etapas_config;
create policy etapas_config_select on etapas_config for select to authenticated using (true);
drop policy if exists etapas_config_write on etapas_config;
create policy etapas_config_write on etapas_config for all to authenticated
  using (fn_tiene_permiso('comercial', 'responsable'))
  with check (fn_tiene_permiso('comercial', 'responsable'));

drop policy if exists historial_authenticated_all on oportunidad_etapas_historial;
drop policy if exists oportunidad_etapas_historial_select on oportunidad_etapas_historial;
create policy oportunidad_etapas_historial_select on oportunidad_etapas_historial for select to authenticated
  using (true);

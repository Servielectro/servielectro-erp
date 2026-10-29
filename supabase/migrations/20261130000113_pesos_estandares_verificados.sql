-- Migración 113 (era la 110; se movió porque la 110 la tomó la historia clínica reservada). Pesos de los
-- 18 estándares que la 108 sembró sin verificar (2026-10-30). Confrontados contra la
-- autoevaluación de la ARL SURA del 20/02/2026 ("Estándares mínimos SG-SST 2025.pdf", en
-- OneDrive\BACKUP\SIG 2026), que trae la tabla oficial de la Resolución 0312 de 2019:
--   * Estándar 2 (gestión integral, 15 %): la gráfica de la página 6 da los 11 ítems uno por uno
--     (política 1, objetivos 1, evaluación inicial 1, plan anual 2, conservación documental 2,
--     rendición de cuentas 1, normatividad 2, comunicación 1, adquisiciones 1, contratación 2,
--     gestión del cambio 1). Coinciden todos con la 108.
--   * Grupo 3.2 (5 %): 3.2.1 y 3.2.2 aparecen con 2 % cada uno en el detalle; 3.2.3 = 5 − 4 = 1.
--   * Grupo 4.1 (15 %): 4.1.2 (4 %), 4.1.3 (3 %) y 4.1.4 (4 %) aparecen en el detalle;
--     4.1.1 = 15 − 11 = 4, y cuadra con el puntaje obtenido del grupo (11 = 4.1.1 + 4.1.2 + 4.1.3).
-- Ningún valor cambia: solo se marcan como verificados. Idempotente.
-- Verificación: supabase/verificaciones/20261130000113_verificar.sql
-- Rollback:     supabase/rollbacks/20261130000113_pesos_estandares_verificados_down.sql
update public.sst_plan_items
   set valor_verificado = true
 where anio = 2026
   and codigo in ('2.1.1', '2.2.1', '2.3.1', '2.4.1', '2.5.1', '2.6.1', '2.7.1', '2.8.1', '2.9.1', '2.10.1', '2.11.1',
                  '3.2.1', '3.2.2', '3.2.3', '4.1.1', '4.1.2', '4.1.3', '4.1.4')
   and valor = case codigo
     when '2.1.1' then 1 when '2.2.1' then 1 when '2.3.1' then 1 when '2.4.1' then 2 when '2.5.1' then 2
     when '2.6.1' then 1 when '2.7.1' then 2 when '2.8.1' then 1 when '2.9.1' then 1 when '2.10.1' then 2
     when '2.11.1' then 1 when '3.2.1' then 2 when '3.2.2' then 2 when '3.2.3' then 1
     when '4.1.1' then 4 when '4.1.2' then 4 when '4.1.3' then 3 when '4.1.4' then 4 end;

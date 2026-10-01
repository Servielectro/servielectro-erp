-- Clientes — responsabilidades tributarias leídas del RUT (pedido 2026-10-02).
--
-- `responsable_iva` ya existe (migración 14): se toma del RUT de CADA cliente (casilla 53,
-- código 48 = responsable del impuesto sobre las ventas), nunca de una regla por tipo de
-- cliente: un conjunto residencial normalmente no es responsable, pero puede serlo si
-- explota áreas comunes comercialmente; lo dice su RUT, no una suposición.
--
-- `responsabilidades_rut`: los códigos crudos de la casilla 53 (ej. {05,48}), para usarlos
-- después en retenciones. Opcional; null si el cliente se creó sin RUT.
--
-- No toca RLS (la tanda 2 de la Fase 2B ya cubre la tabla clientes). Idempotente.

alter table clientes add column if not exists responsable_iva boolean;
alter table clientes add column if not exists responsabilidades_rut text[];

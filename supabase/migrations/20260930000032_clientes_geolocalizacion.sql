-- Clientes — ubicación tomada en la obra (pedido de Jhojan 2026-09-30).
--
-- Botón "Tomar ubicación" en la ventana Nuevo cliente: usa el GPS del navegador (tablet
-- en campo, parado en la obra) y guarda latitud/longitud para abrirla en Google Maps.
-- La precisión (en metros) y la fecha quedan para saber qué tan confiable es el punto.
-- Todo opcional: un cliente sin ubicación es lo normal.
--
-- Idempotente.

alter table clientes add column if not exists latitud numeric(9,6)
  check (latitud is null or latitud between -90 and 90);
alter table clientes add column if not exists longitud numeric(9,6)
  check (longitud is null or longitud between -180 and 180);
alter table clientes add column if not exists ubicacion_precision_m numeric(8,1);
alter table clientes add column if not exists ubicacion_tomada_en timestamptz;

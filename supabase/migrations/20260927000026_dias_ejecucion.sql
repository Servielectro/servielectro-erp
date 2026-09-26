-- Tiempo de ejecución del proyecto, en días hábiles — fila "TIEMPO DE PROYECTO" del
-- documento formal ("Tiempo de ejecución del proyecto: 60 días hábiles laborales.").
-- Pedido por Jhojan 2026-09-25. Opcional: si queda vacío, la fila no sale en el documento.
-- Idempotente.
alter table cotizaciones
  add column if not exists dias_ejecucion int
  check (dias_ejecucion is null or dias_ejecucion between 1 and 3650);

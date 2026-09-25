-- Módulo 1: Proyectos — separa nombre corto (pantalla) de descripción larga (documento
-- al cliente). Jhojan pidió: pantalla limpia con el nombre corto, descripción larga
-- SOLO en el PDF que se le manda al cliente.
-- Idempotente: se puede correr más de una vez sin romper.
--
-- El nombre corto se backfillea desde `codigo`, no desde `descripcion`: `codigo` es el
-- texto original de la columna "Item" del Excel (el nombre corto de siempre) y la RPC
-- temporal de carga de descripciones largas solo toca `descripcion`, nunca `codigo` — así
-- que esto es seguro sin importar si esta migración corre antes o después de esa carga.

alter table items_catalogo add column if not exists nombre_corto text;
update items_catalogo set nombre_corto = codigo where nombre_corto is null;
alter table items_catalogo alter column nombre_corto set not null;

-- Snapshot de la descripción larga en la línea de la cotización, al momento de cotizar
-- (igual que ya se hace con el precio) — así el documento impreso no depende de que el
-- catálogo no cambie después.
alter table cotizacion_items add column if not exists descripcion_larga text;

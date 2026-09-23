# Carpeta para el catálogo real

Dejá acá la copia del Excel con la hoja **"CuadroItems"** (los 860 ítems). Puede ser:

- El archivo `.xlsm` completo (ej. `CSE-026-151 FASE I MANTO PUERTAS Tintala Fase 6.xlsm`), o
- Solo esa hoja exportada a `.xlsx` o `.csv`.

Cualquiera de las dos formas sirve — no hace falta limpiar ni traducir nada antes, el importador se escribe contra las columnas tal como están: Item, Descripción, Unidades (UNI/GL/...), Valor unitario, Proveedor, Referencia, Fecha.

Este archivo no se sube a git (ver `.gitignore`) — se procesa localmente para poblar `items_catalogo` y `items_precios_historico` en Supabase.

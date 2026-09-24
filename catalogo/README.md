# Carpeta para el catálogo real

**Estado (2026-09-24):** los 815 ítems ya están cargados en la base (importación manual directa, ver `docs/ERP-Servielectro-Modulo1-Proyectos.md §15`). Lo que falta es completar el campo `descripcion` de cada uno, que hoy quedó igual al nombre corto.

Dejá acá la copia del Excel con la hoja **"CuadroItems"**. Puede ser:

- El archivo `.xlsm` completo (ej. `CSE-026-151 FASE I MANTO PUERTAS Tintala Fase 6.xlsm`), o
- Solo esa hoja exportada a `.xlsx`.

Cuando el archivo esté acá, correr:

```
node scripts/generar-sql-descripciones.mjs
```

Esto lee la hoja, hace match por `codigo` (columna "Item" del Excel) y genera `scripts/output/actualizar-descripciones.sql` — **no inserta ni borra ítems**, solo actualiza el texto de `descripcion`. Revisar el archivo generado (y el conteo de filas que imprime en consola) antes de correrlo contra la base real.

Este archivo Excel no se sube a git (ver `.gitignore`).

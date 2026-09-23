# ERP Servielectro — Módulo 1: Gestión de Proyectos

Reconstrucción del modelo a partir de la descripción de Jhojan Poveda (Servielectro SAS) y del análisis del archivo `CSE-026-151 FASE I MANTO PUERTAS Tintala Fase 6.xlsm`. No se encontró en este equipo el documento de diseño previo (`ERP-Servielectro-Modulo1-Proyectos.md` de otra sesión), así que este documento es la reconstrucción vigente.

> **Prioridad de construcción (2026-09-23):** se arranca por el sub-módulo de **Cotizaciones**, mobile-first para tablet, porque el dolor real de Jhojan es "estoy perdiendo mucho tiempo en realizar cotizaciones a clientes" y quiere cotizar en vivo frente al cliente. Proyectos, ejecución, hitos de cobro y flujo de caja (secciones 7-9) quedan con su modelo de datos listo pero su UI se construye después.

## 1. Objetivo del módulo

Cotizar proyectos (obras de seguridad electrónica), ejecutarlos, y comparar lo presupuestado contra lo real, incluyendo el flujo de caja (cobros vs. gastos en el tiempo).

Diferencia clave frente al Excel actual: **el presupuesto (cotización aprobada) se congela**. La ejecución se registra en tablas separadas. Nunca se sobrescribe el dato presupuestado.

## 2. Cadena de precios (3 niveles) — por línea de ítem

1. **Compra con IVA**: costo unitario real de compra.
2. **Venta** = Compra ÷ `factor_rentabilidad_linea`. Margen sobre venta.
3. **CALCULO** = Venta ÷ `factor_recargo_proyecto`. Es lo que ve el cliente en la cotización.

**Actualización 2026-09-23:** `factor_rentabilidad_linea` **no sigue una regla por categoría** — Jhojan lo fija línea a línea a su criterio (0.85 es lo más frecuente en Tintalá, 0.88 para algunos ítems puntuales de EQUIPOS/MATERIALES, 0.80 para parte de MANO DE OBRA). El sistema usa **0.85 como default editable** en las tres categorías; no hay lógica automática de asignación todavía.

`factor_recargo_proyecto` (ej. 0.8852934680 → +12.96%) se calcula a partir de los porcentajes de administración, renta e ICA del proyecto — ver **§13 Pendientes** para el estado de esa fórmula (todavía no confirmada, campo editable manualmente mientras tanto).

## 3. Sobre el subtotal (AIU)

```
Subtotal CALCULO (suma de líneas)
  → + Administración  5%
  → + Imprevistos      6%
  → + Utilidad         5%   (AIU)
  → Subtotal general
  → + IVA (según tipo de contrato)
  → Total cotización
```

## 4. Esquema de IVA (interruptor maestro de la cotización)

**Actualización 2026-09-23:** Jhojan pidió que esto sea lo primero que se elige en cada cotización, visible siempre, porque "cambia todo de ahí para abajo". Se reemplazó la derivación automática desde `tipo_contrato` por una elección explícita: `esquema_iva` = `IVA_FULL` | `IVA_AIU`.

- `IVA_AIU`: el IVA se aplica **solo sobre la línea de Utilidad** (base especial, validada con el contador, 5 años de vigencia — corresponde al caso de obra civil con contrato firmado).
- `IVA_FULL`: IVA sobre el subtotal general completo.

`tipo_contrato` sigue existiendo en la tabla como metadata descriptiva (para reportes futuros) pero **ya no determina el cálculo**. El sistema registra `iva_base_motivo` junto al cálculo, para auditoría.

## 5. Gastos internos (se descuentan de la Utilidad, no cambian el precio al cliente)

- Administración interna: 14%
- Renta: 36%
- ICA: 12.05 por mil
- Comisión comercial: variable

Estos se restan de la capa de Utilidad (AIU) para mostrar la utilidad **neta** real del proyecto.

## 6. Las 5 capas de utilidad

1. Margen de línea (Venta − Compra, sumado)
2. Recargo de proyecto (CALCULO − Venta, sumado)
3. Administración (5% del subtotal)
4. Imprevistos (6% del subtotal)
5. Utilidad AIU (5% del subtotal) → menos gastos internos (admin 14%, renta 36%, ICA, comisión) = utilidad neta

Pantalla dedicada: mostrar aporte de cada capa al total, y comparar % bruto visible (capa 1 sola) vs. % neto real (todas las capas).

## 7. Esquemas de cobro

N hitos configurables que suman 100% del contrato. Ejemplos reales:
- Anticipo 50% + Pago final 50%
- Anticipo 50% + Corte 1 (20%) + Corte 2 (30%) + Entrega

Cada hito: nombre, porcentaje, valor programado, estado (pendiente/facturado/cobrado), fechas.

## 8. Presupuesto vs. Ejecución

La cotización aprobada = presupuesto congelado (`cotizacion_items`, inmutable tras aprobación).
La ejecución real se registra en `proyecto_ejecucion_items`, con vínculo opcional a la línea de presupuesto correspondiente, para poder mostrar: cantidad presupuestada vs. ejecutada, costo presupuestado vs. real, y desviación en $ y %.

## 9. Flujo de caja del proyecto

Cruce cronológico de:
- Ingresos: hitos de cobro con `fecha_cobrado` y `valor_cobrado`.
- Egresos: `proyecto_ejecucion_items` con su `fecha` y costo real.

Salida: entradas, salidas, saldo acumulado, saldo pendiente por cobrar, próximos hitos.

## 10. Catálogo de ítems

860 ítems (hoja "CuadroItems"): Item, Descripción, Unidad (UNI/GL/...), Valor unitario, Proveedor, Referencia, Fecha. Muchos sin precio o desactualizados (2025).

- Importador desde Excel/CSV → `items_catalogo` + `items_precios_historico`.
- Precios versionados en el tiempo (nunca se sobrescribe: se inserta un nuevo registro con `vigente_desde`).
- Pantalla de mantenimiento de precios con fecha de última actualización visible.
- Cotización toma snapshot del precio vigente al momento de cotizar (no depende de cambios futuros del catálogo).

## 11. Numeración

Cotizaciones: `CSE-AA-NNN` (ej. CSE-26-151). Consecutivo automático por año.

## 12. Ver también

- Modelo de datos y migraciones: `supabase/migrations/`

## 13. Pendientes / decisiones abiertas

**Fórmula de `factor_recargo_proyecto` (crítico).** Con Admin 14%, Renta 36%, ICA 12.05‰ (datos reales de Tintalá) se probaron ~20 fórmulas algebraicas a mano más una búsqueda automatizada por fuerza bruta sobre combinaciones lineales de esos tres porcentajes — ninguna reproduce 0.8852934680 de forma confiable. Con un solo proyecto de referencia el problema está subdeterminado: cualquier fórmula que "cuadre" es coincidencia numérica, no la real. Falta una de estas dos cosas para cerrarlo:
1. El texto literal de la fórmula de esa celda en el Excel, o
2. Los porcentajes + factor resultante de un **segundo proyecto real** (distinto de Tintalá).

Mientras tanto, `factor_recargo_proyecto` es un campo numérico editable a mano por cotización (con `formula_recargo_nota` para anotar cómo se obtuvo cada vez).

**Pantalla de clientes con NIT (pendiente de construir).** La cotización rápida solo pide el nombre del cliente (alta automática si no existe) — a propósito, por velocidad frente al cliente. Riesgo señalado por Jhojan: nombres como "Agrupación de Vivienda Tintalá" y sus variantes van a generar clientes duplicados. Hace falta una pantalla de administración de clientes que use **NIT como identificador**, y una limpieza posterior de duplicados. La tabla `clientes` ya tiene nit/contacto/telefono/email/direccion — falta la UI. Esos datos además son necesarios para poder imprimir la cotización (su formato real los incluye).

**Importación del catálogo (860 ítems).** Falta el archivo real (hoja "CuadroItems") para escribir el importador contra las columnas exactas.

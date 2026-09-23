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

**Fórmula de `factor_recargo_proyecto` (crítico).** Con Admin 14%, Renta 36%, ICA 12.05‰ (datos reales de Tintalá) se probaron ~20 fórmulas algebraicas a mano más una búsqueda automatizada por fuerza bruta sobre combinaciones lineales de esos tres porcentajes — ninguna reproduce 0.8852934680 de forma confiable. Con un solo proyecto de referencia el problema está subdeterminado: cualquier fórmula que "cuadre" es coincidencia numérica, no la real.

**Intento 2026-09-23 (segunda vuelta):** con `utilidad_aiu = $725.547` y asumiendo AIU estándar 5/6/5, se deriva `subtotal_calculo ≈ $14.510.940` y, usando el factor real (0.8852934680), `subtotal_venta ≈ $12.846.440`. Eso da un "recargo" (Calculo − Venta) de **≈$1.664.500**. Comparado contra los gastos reales de Tintalá (**$1.946.631** = admin+renta+ICA), la hipótesis "el recargo se calcula para financiar exactamente esos gastos" queda cerca pero no exacta (diferencia de ~$282.000, 14.5%) — probablemente porque `subtotal_calculo` se derivó asumiendo AIU 5/6/5 en vez de tomarlo del dato real, y/o porque comisión comercial (variable, no incluida en los $1.946.631 dados) también entra en la cuenta. No se puede cerrar sin más precisión. Falta una de estas dos cosas:
1. El texto literal de la fórmula de esa celda en el Excel, o
2. El desglose exacto de subtotal_venta y subtotal_calculo reales de Tintalá (no derivados/asumidos) + cuánto de los $1.946.631 es específicamente Admin, cuánto Renta y cuánto ICA (tres números separados, no el total).

Mientras tanto, `factor_recargo_proyecto` es un campo numérico editable a mano por cotización (con `formula_recargo_nota` para anotar cómo se obtuvo cada vez).

**Deducciones internas (`v_capas_utilidad`) — implementación anterior matemáticamente imposible, corregida en `20260923000010`.** El diseño original deducía admin/renta/ICA de `utilidad_aiu` únicamente. Con los datos reales de Tintalá eso es imposible: admin(14%)+renta(36%)+ICA(12.05‰) = 51.205% combinado, que sobre `utilidad_aiu` ($725.547) da un máximo de **$371.516** — pero los gastos reales son **$1.946.631** (2.68 veces más). La vista ahora deja esos campos en `null` con una nota explícita en vez de mostrar una "utilidad neta" que se sabe falsa. Dato de contexto a favor de que la base correcta es más amplia: si se deducen esos $1.946.631 del total de las 5 capas combinadas (no solo de la capa 5), la utilidad neta resultante ronda 23-24% sobre el subtotal general — coherente con el "gana 23.3% neto" que Jhojan mencionó al principio. Para implementarlo bien falta el mismo desglose que el punto anterior: cuánto de esos $1.946.631 es Admin, cuánto Renta, cuánto ICA, y sobre qué base exacta se calcula cada uno (ICA en Colombia normalmente es sobre ingresos brutos, no sobre utilidad — eso ya es un indicio fuerte, pero no alcanza para los otros dos).

**RLS demasiado permisiva (riesgo de seguridad, revisar antes del segundo usuario).** La migración `20260923000007_rls.sql` le da acceso total (lectura y escritura) a **cualquier usuario autenticado**, sin distinción de rol. Es una decisión consciente para arrancar con un solo usuario (Jhojan), pero significa literalmente que **cualquiera que entre a la cuenta ve los costos de compra, los márgenes de línea, el recargo de proyecto y la rentabilidad neta de todas las obras** — no solo el precio final que ve el cliente. Si en algún momento entra un comercial, un técnico o cualquier persona que no deba ver esa información financiera interna, hay que refinar las políticas de RLS **antes** de darle acceso, no después. Candidatos obvios para diferenciar: separar "ver precio CALCULO/cotización" de "ver compra/venta/márgenes/capas de utilidad", y mover ese segundo grupo a políticas restringidas a un rol admin.

**Pantalla de clientes con NIT (pendiente de construir).** La cotización rápida solo pide el nombre del cliente (alta automática si no existe) — a propósito, por velocidad frente al cliente. Riesgo señalado por Jhojan: nombres como "Agrupación de Vivienda Tintalá" y sus variantes van a generar clientes duplicados. Hace falta una pantalla de administración de clientes que use **NIT como identificador**, y una limpieza posterior de duplicados. La tabla `clientes` ya tiene nit/contacto/telefono/email/direccion — falta la UI. Esos datos además son necesarios para poder imprimir la cotización (su formato real los incluye).

**Importación del catálogo (860 ítems).** Falta el archivo real (hoja "CuadroItems") para escribir el importador contra las columnas exactas.

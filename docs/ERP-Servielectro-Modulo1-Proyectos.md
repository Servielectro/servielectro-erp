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

**Resuelto 2026-09-23:** `factor_recargo_proyecto` (ej. 0.8852934680 → +12.96%) ya no se escribe a mano — se calcula por **iteración de punto fijo** (`fn_calcular_factor_recargo` / `calcularFactorRecargo`):

```
factor = 1 − (Total Gastos internos ÷ Total del proyecto con IVA)
```

Es circular (el total depende del factor, el factor depende del total), así que se itera desde factor=1 hasta que converge (tolerancia 0.0000001, tope 30 vueltas — Tintalá converge en ~13). Verificado exacto contra Tintalá: ver §13.

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

## 5. Gastos internos (no cambian el precio al cliente, son análisis interno)

**Resuelto 2026-09-23** — cada uno sobre su base real, verificada exacta contra Tintalá (ver §13):

- **Admin** (14%, editable por cotización) = 14% × **Compra total** (sí se suma de vuelta a la utilidad — es provisión para administración propia, no una salida real de caja).
- **Renta** (36%, tasa fija de la empresa) = 36% × la utilidad que corresponda según el esquema: **utilidad del AIU** si `esquema_iva = IVA_AIU`, **utilidad total del bloque venta** (las 3 capas del AIU combinadas) si `esquema_iva = IVA_FULL` (este segundo caso sigue el mismo patrón de nombres pero no está verificado con un ejemplo real todavía).
- **ICA** (12.05 por mil, tasa fija) = 12.05‰ × Subtotal general del **bloque Venta** (venta + AIU sobre venta, sin el recargo de proyecto).
- **Comisión comercial** (variable, editable por cotización) = % × Total del proyecto con IVA. **Sin verificar** — en Tintalá siempre fue 0%, no hay ejemplo real con comisión distinta de cero.

## 6. Las 5 capas de utilidad + utilidad real del proyecto

1. Margen de línea (Venta − Compra, sumado)
2. Recargo de proyecto (CALCULO − Venta, sumado)
3. Administración (5% del subtotal)
4. Imprevistos (6% del subtotal)
5. Utilidad AIU (5% del subtotal)

**Utilidad Total** (resuelto 2026-09-23, distinto de sumar las 5 capas): `(Subtotal general del bloque Venta − Compra total) + Admin del gasto`. El Admin se suma de vuelta porque no sale de caja. Verificado exacto contra Tintalá. Se muestra junto con **Impuestos a transferir** (Renta + ICA + IVA) como referencia de cuánto hay que girarle al Estado.

Vista en pantalla: dentro del detalle de la cotización (`v_capas_utilidad`), no en una pantalla separada.

## 7. Esquemas de cobro

**Actualización 2026-09-23:** se arman **en la cotización**, no después en el proyecto — Jhojan necesita verlos y editarlos en la misma visita. `hitos_cobro` se repuntó de `proyecto_id` a `cotizacion_id`.

N hitos configurables que suman 100% del contrato. Ejemplos reales:
- Anticipo 50% + Pago final 50%
- Anticipo 50% + Corte 1 (20%) + Corte 2 (30%) + Entrega

Cada hito: nombre, porcentaje, valor programado (calculado sobre el total de la cotización), estado (pendiente/facturado/cobrado), fechas.

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

**✅ RESUELTO 2026-09-23 — Fórmula de `factor_recargo_proyecto` y bases de los gastos internos.** Jhojan mandó la captura de la hoja real de Tintalá con todos los valores intermedios (bloques CALCULO y VENTA, gastos desglosados en Admin/Renta/ICA por separado). Se verificaron las 6 fórmulas contra esos números — **coinciden exactas, al peso**:

| Cálculo | Fórmula | Verificado |
|---|---|---|
| Admin (gasto) | 14% × Compra total | $1.535.828 exacto |
| Renta | 36% × utilidad AIU del bloque Venta (esquema AIU) | $231.236 exacto |
| ICA | 12,05‰ × Subtotal general del bloque Venta | $179.567 exacto |
| Utilidad Total | (Subtotal gral. Venta − Compra total) + Admin del gasto | $5.467.491 exacto |
| Impuestos a transferir | Renta + ICA + IVA | $548.657 exacto |
| Factor de recargo | 1 − (Total Gastos ÷ Total con IVA), iterativo | 0.8852934706 (real: 0.8852934680) |

Implementado en `fn_calcular_factor_recargo` (SQL, migración `20260923000012`) y `calcularFactorRecargo` (TypeScript, `src/lib/pricing.ts`) — reproducido con un script y confirmado idéntico a mano antes de tocar el código. `v_capas_utilidad` corregida en la misma migración con las bases reales, reemplazando los `null` de la migración `20260923000010`.

**Sin verificar todavía (no bloquea, son casos que no aparecieron en Tintalá):**
- **Base de Renta con `esquema_iva = IVA_FULL`.** Se implementó siguiendo el mismo patrón de nombres que el caso AIU (utilidad total del bloque Venta = las 3 capas del AIU combinadas, en vez de solo la utilidad), pero Tintalá es esquema AIU — no hay un ejemplo real con IVA_FULL para confirmarlo.
- **Base de la Comisión comercial.** Siempre fue 0% en Tintalá. Se asumió % × Total del proyecto con IVA (convención habitual de comisión sobre venta), sin poder verificarla contra un número real.

Si aparece un proyecto real con IVA_FULL o con comisión distinta de cero, vale la pena revisar estos dos contra los números reales antes de confiar en ellos para un caso así.

**RLS demasiado permisiva (riesgo de seguridad, revisar antes del segundo usuario).** La migración `20260923000007_rls.sql` le da acceso total (lectura y escritura) a **cualquier usuario autenticado**, sin distinción de rol. Es una decisión consciente para arrancar con un solo usuario (Jhojan), pero significa literalmente que **cualquiera que entre a la cuenta ve los costos de compra, los márgenes de línea, el recargo de proyecto y la rentabilidad neta de todas las obras** — no solo el precio final que ve el cliente. Si en algún momento entra un comercial, un técnico o cualquier persona que no deba ver esa información financiera interna, hay que refinar las políticas de RLS **antes** de darle acceso, no después. Candidatos obvios para diferenciar: separar "ver precio CALCULO/cotización" de "ver compra/venta/márgenes/capas de utilidad", y mover ese segundo grupo a políticas restringidas a un rol admin.

**Pantalla de clientes con NIT (pendiente de construir).** La cotización rápida solo pide el nombre del cliente (alta automática si no existe) — a propósito, por velocidad frente al cliente. Riesgo señalado por Jhojan: nombres como "Agrupación de Vivienda Tintalá" y sus variantes van a generar clientes duplicados. Hace falta una pantalla de administración de clientes que use **NIT como identificador**, y una limpieza posterior de duplicados. La tabla `clientes` ya tiene nit/contacto/telefono/email/direccion — falta la UI. Esos datos además son necesarios para poder imprimir la cotización (su formato real los incluye).

**Importación del catálogo (860 ítems).** Falta el archivo real (hoja "CuadroItems") para escribir el importador contra las columnas exactas.

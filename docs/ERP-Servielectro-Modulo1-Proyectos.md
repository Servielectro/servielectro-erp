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

**Cargado 2026-09-24** (carga manual directa, no hubo importador — la hoja no tenía columna de categoría, así que no valía la pena automatizar la clasificación): **815 ítems** (859 filas originales, 44 duplicados exactos por nombre), **247 con precio** (fuente `IMPORTADO_EXCEL`), **588 sin precio** todavía. 227 MANO_DE_OBRA (clasificados por patrón de nombre: "Inst", "Manto", "M.O/", "Obra civil", "Transporte"...), 588 MATERIAL (todo lo que no matcheó ese patrón, **incluye equipos sin clasificar** — cámaras, NVR, switches, UPS, controladoras, talanqueras están hoy como MATERIAL). **Cero ítems en EQUIPO** — hay que reclasificar a mano en `/catalogo` (pantalla de reclasificación en lote, ver más abajo). `factor_rentabilidad_linea` en 0.85 para todos (el más frecuente). Unidades respetadas del original (UNI, GL, METRO, M2).

- `/catalogo`: pantalla de reclasificación en lote (filtro por categoría + búsqueda, selección múltiple, cambiar categoría a los seleccionados de una vez). Construida específicamente para resolver el problema de arriba con 588 ítems, no de a uno.
- `scripts/generar-sql-descripciones.mjs`: pendiente de correr — la `descripcion` de cada ítem quedó igual al nombre corto (no se cargaron las descripciones largas del Excel para no inflar la carga inicial). El script lee la hoja real, hace match por `codigo`, y genera el SQL para actualizar solo ese campo. Instrucciones en `catalogo/README.md`.
- Precios versionados en el tiempo (nunca se sobrescribe: se inserta un nuevo registro con `vigente_desde`).
- Pantalla de mantenimiento de precios con fecha de última actualización visible — **todavía no construida** (588 ítems sin precio la necesitan).
- Cotización toma snapshot del precio vigente al momento de cotizar (no depende de cambios futuros del catálogo).

## 11. Numeración

Cotizaciones: `CSE-AA-NNN` (ej. CSE-26-151). Consecutivo automático por año.

## 12. Ver también

- Modelo de datos y migraciones: `supabase/migrations/`

**Práctica fija desde el 2026-09-24:** toda vista nueva se crea con `WITH (security_invoker = true)` desde el principio (ver el hallazgo de seguridad en §13) — nunca depender de agregarlo después.

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

**✅ CORREGIDO 2026-09-24 — Las vistas ignoraban la RLS por completo, expuestas a CUALQUIERA sin sesión (mucho más grave que el punto siguiente).** Descubierto probando el buscador de ítems: en Postgres, una vista sin `security_invoker = true` corre con los privilegios de quien la CREÓ (el rol de las migraciones), no de quien consulta — se salta la RLS de las tablas base enteramente. Verificado con `curl` sin ninguna sesión, usando solo la publishable key (pública por diseño, va en el bundle del navegador): la tabla `items_catalogo` (815 filas reales) devolvía `[]` correctamente bloqueada, pero la vista `v_items_catalogo_con_precio` sobre esa misma tabla devolvía **las 815 filas completas, incluido el costo de compra**, a cualquiera en internet. Afectaba a las 13 vistas del proyecto por igual (mismo origen). Corregido en la migración `20260924000016_fix_vistas_bypass_rls.sql`. Las funciones RPC no estaban afectadas (ya corren como `SECURITY INVOKER` por defecto, verificado aparte).

**RLS de las tablas todavía demasiado permisiva entre usuarios autenticados (riesgo menor, pendiente, revisar antes del segundo usuario).** La migración `20260923000007_rls.sql` le da acceso total (lectura y escritura) a **cualquier usuario autenticado**, sin distinción de rol. Es una decisión consciente para arrancar con un solo usuario (Jhojan) — con el punto de arriba ya corregido, esto ya no es un problema de exposición pública, solo de que un segundo usuario autenticado (comercial, técnico) vería todo. Si en algún momento entra alguien así, hay que refinar las políticas de RLS **antes** de darle acceso, no después. Candidatos obvios para diferenciar: separar "ver precio CALCULO/cotización" de "ver compra/venta/márgenes/capas de utilidad", y mover ese segundo grupo a políticas restringidas a un rol admin.

**Pantalla de clientes con NIT (pendiente de construir, parcialmente mitigado por §14).** La cotización rápida solo pide el nombre del cliente (alta automática si no existe) — a propósito, por velocidad frente al cliente. Riesgo señalado por Jhojan: nombres como "Agrupación de Vivienda Tintalá" y sus variantes van a generar clientes duplicados. Desde que existe la carga de RUT (§14), el cliente sí queda con NIT confiable — pero la resolución de "es el mismo cliente" al escribir el nombre sigue siendo por texto, no por NIT. Sigue haciendo falta una pantalla de administración que use **NIT como identificador** y una limpieza de duplicados existentes.

**Importación del catálogo (860 ítems).** Falta el archivo real (hoja "CuadroItems") para escribir el importador contra las columnas exactas.

## 14. Carga del RUT del cliente con IA (2026-09-23)

Cuadro opcional en la cotización: Jhojan sube el PDF o foto del RUT del cliente, la IA lo lee y él confirma cada campo antes de que se guarde nada. Mismo mecanismo pensado para reutilizarse con facturas de proveedor en el módulo de ejecución (tabla `documentos` genérica por `tipo_documento`).

**Estructura real del RUT (investigada, no de memoria):**
- Casilla 5 = NIT (sin DV). Casilla 6 = DV.
- Casilla 53 = "Responsabilidades, Calidades y Atributos" — tabla de códigos de 2 dígitos. Código **48 = responsable de IVA**, **49 = no responsable**. Determina cómo se le factura.
- **Corrección a lo que se creía inicialmente:** la casilla 54 es "Intercambio Automático de Información CRS" (reporte financiero internacional) — no tiene relación con IVA, aunque a veces se confunden. La responsabilidad de IVA sale solo de la 53.
- Fuentes: [actualicese.com](https://actualicese.com/codigos-de-responsabilidades-tributarias-rut-casilla-53/), [gerencie.com](https://www.gerencie.com/codigo-de-las-responsabilidades-tributarias-que-puede-tener-un-contribuyente-en-el-rut.html), [siigo.com](https://www.siigo.com/blog/obligaciones-fiscales/codigo-de-responsabilidades-rut/).

**Dígito de verificación:** algoritmo módulo 11 de la DIAN (pesos primos 3,7,13,17,19,23,29,37,41,43,47,53,59,67,71 de derecha a izquierda; residuo 0→0, 1→1, si no 11−residuo). Verificado contra un ejemplo completo con el NIT real de la propia DIAN (800197268 → DV 4, suma 733, residuo 7). Implementado en `src/lib/nit.ts`, se corre siempre, independiente de qué tan segura diga estar la IA — es la red de seguridad barata contra un dígito mal leído.

**Arquitectura:**
- La clave de OpenAI (`OPENAI_API_KEY`) vive solo en el servidor, nunca con prefijo `NEXT_PUBLIC_`. Se usa en `src/lib/documentos/extraer-rut.ts`, llamado únicamente desde Server Actions (`src/app/cotizaciones/documentos-actions.ts`).
- Modelo `gpt-4o-mini`, Responses API con `input_file` (PDF nativo) o `input_image` (foto) + Structured Outputs (esquema Zod en `src/lib/documentos/rut-schema.ts`, convertido a JSON Schema por el propio SDK de OpenAI).
- Cada campo extraído trae su propio nivel de confianza (`alta`/`media`/`baja`/`no_legible`). Si es `no_legible`, el panel de confirmación deja el campo **vacío**, nunca precargado con una adivinanza.
- Si el documento no es un RUT (cédula, factura, foto de otra cosa), la IA lo marca explícitamente (`es_documento_rut=false`) y no se muestra ningún dato — se avisa y se sigue a mano.
- Nada se guarda en `clientes` hasta que Jhojan confirma en el panel — ver `confirmarRut` en `documentos-actions.ts`.

**Resolución del cliente antes de guardar la cotización:** como la cotización es "local hasta guardar", pero el RUT necesita un `cliente_id` real para subir el archivo a su carpeta, subir un RUT resuelve (o crea) el cliente en el momento vía `fn_buscar_o_crear_cliente` — antes de que se guarde el resto de la cotización. Es un cambio de comportamiento menor pero deseable: el cliente y su RUT quedan guardados aunque se abandone la cotización.

## 15. Nombre corto vs. descripción larga (2026-09-24)

Corrección de Jhojan: la pantalla de cotización debe mostrar solo el **nombre corto** del ítem (rápido de leer en tablet); la **descripción larga** (cargada desde el Excel real al catálogo, nunca escrita a mano) aparece únicamente en el documento que recibe el cliente.

- `items_catalogo.nombre_corto` (nuevo) = nombre corto, se muestra en pantalla (buscador, líneas de cotización, reclasificación). Backfilleado desde `codigo` (el título original de la columna "Item" del Excel), **no** desde `descripcion` — importante porque la carga de descripciones largas (ver abajo) sobrescribe `descripcion`, y `codigo` es la única columna que esa carga nunca toca.
- `items_catalogo.descripcion` = descripción larga, solo para el documento impreso.
- `cotizacion_items.descripcion_larga` (nuevo) = snapshot de la descripción larga al momento de cotizar, igual que ya se hace con el precio — el documento impreso no depende de que el catálogo no cambie después.
- **Vista previa**: botón en la pantalla de cotización que renderiza el mismo componente `FormatoCotizacion` que usa `/cotizaciones/[id]/imprimir`, alimentado con el estado en memoria (borrador sin guardar) en vez de una consulta a la base — mismo componente, dos fuentes de datos.
- **Carga real de descripciones (2026-09-24):** 823 filas actualizadas desde la hoja `CuadroItems` del Excel de Tintalá (`CSE-026-151`), vía una RPC temporal con permisos elevados (`fn_carga_temporal_descripciones`) creada y revocada por el usuario con acceso a la base — sin que este asistente tuviera sesión de base de datos en ningún momento. Solo tocó la columna `descripcion`; no insertó ni borró filas.

## 16. Condiciones comerciales del documento (2026-09-24)

Bloque final del documento que recibe el cliente. Jhojan aclaró que estos datos, junto con el RUT del cliente, son los insumos para generar el contrato de obra más adelante — por eso se modelan como datos estructurados (tablas con columnas propias), no como un bloque de texto libre.

Texto fuente: hoja `FormatoCotizacion` del Excel real de Tintalá (filas 114-123), transcrito literal — no redactado de nuevo.

- **`configuracion_empresa`** (tabla singleton, `id boolean primary key default true check (id)` garantiza una sola fila): datos **fijos** de la empresa, iguales en todas las cotizaciones.
  - `texto_despacho_aprobacion`: plazos de entrega y pasos de aprobación (orden de entrega, depósito de anticipo, aprobación del check-list).
  - `banco_nombre` / `banco_tipo_cuenta` / `banco_numero_cuenta` / `banco_titular`: cuenta bancaria, guardada en columnas separadas (no como texto libre) para poder reusarla en el contrato.
  - `texto_garantia`: condiciones de garantía completas.
  - `texto_validez_oferta`: vigencia de la oferta (elemento extra encontrado en el Excel, no pedido explícitamente pero forma parte del mismo bloque del documento real).
- **`polizas_catalogo`**: catálogo editable de pólizas (nombre, descripción/cláusula, % y vigencia por defecto). Sembrado con las 5 pólizas que nombró Jhojan (Responsabilidad civil extracontractual, Cumplimiento, Garantía, Salarios y prestaciones, Anticipo). **El Excel real solo nombra 3 pólizas sin cláusula legal ni porcentaje asociado** — no se inventó texto legal ni cifras; quedan `null`, editables desde la pantalla de cotización (que también permite agregar pólizas nuevas al catálogo).
- **`cotizacion_polizas`**: pólizas seleccionadas por cotización, con snapshot de nombre/%/vigencia (mismo patrón que precios y descripción larga — si el catálogo cambia después, la cotización ya guardada no se altera).
- **Forma de pago**: no se guarda aparte ni se escribe a mano — se redacta en el documento a partir del esquema de hitos ya existente (`hitos_cobro`), ej. "Anticipo 50%, Primer corte 20%, Segundo corte 30%".

**Pendiente de confirmar con Jhojan:** el texto de cláusula legal y el %/vigencia real de cada póliza (el Excel no los trae); y si el bloque de "plazos de entrega y aprobación" es realmente fijo para toda cotización (se asumió que sí, por estar redactado como texto genérico en el Excel) o si alguna vez cambia por proyecto.

**Almacenamiento:** bucket privado `documentos-clientes` en Supabase Storage (nunca público), carpeta `clientes/{cliente_id}/rut/{timestamp}-{archivo}`. Tabla `documentos` registra quién subió cada archivo y cuándo (`subido_por`, `subido_en`), y quién confirmó los datos extraídos (`confirmado_por`, `confirmado_en`). RLS con el mismo criterio permisivo del resto del sistema (ver nota de RLS arriba).

**Costo:** ~$0.0008 USD por RUT leído con `gpt-4o-mini` (3.000-4.000 tokens de entrada, ~400 de salida, a $0.15/$0.60 por millón de tokens — precios oficiales verificados en developers.openai.com/api/docs/pricing). Con 10-15 proyectos al año, costo anual despreciable. El costo real de cada lectura queda guardado en `documentos.costo_estimado_usd` para tener el dato, no solo la estimación.

**Sin verificar todavía:** el comportamiento de la IA con un RUT de persona natural (documento con estructura algo distinta al de persona jurídica) no se probó contra un ejemplo real — el esquema contempla el campo `tipo_contribuyente`, pero conviene confirmar con el primer RUT de persona natural que se cargue.

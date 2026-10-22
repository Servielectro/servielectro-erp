# NEXGO — "Personal": la ficha del empleado

Del video del 22/10/2026 (3 min 3 s). Jhojan: *"quiero ese submódulo de Personal tal como el
video, pestaña por pestaña, botón por botón. Quiero que dupliques todo."* Lo revisará con RRHH
y contabilidad.

Está en `Recursos Humanos → Personal`. La lista tiene contador de **Retirados** y filtro de
**Estado** (Todos).

## El formulario "Nuevo empleado"

Aviso en la cabecera:
> Guarde la ficha para asignar dotación, crear acceso NEXGO, generar carnet, liquidar o emitir
> desprendibles.

**Ocho pestañas:** `Datos` · `Hoja de vida` · `Contrato` · `Accesos` · `Dotación` ·
`Sueldo / liquidación` · `Desprendible` · `Caja menor`

**Al costado:** Foto (Subir foto / Quitar), **Carnet PDF**, **Ficha PDF**.
**Abajo, siempre:** `Cerrar` · `Ficha PDF` · **`Guardar ficha`**.

---

## Pestaña Datos

| Campo | Nota |
|---|---|
| Primer nombre * / Otros nombres | |
| Primer apellido * / Segundo apellido | marcador: *"Si no tiene, se usa el primero"* |
| Tipo doc. (`CC`) / Número * | |
| Código interno | ej. `001` |
| **Titulación** | `Sin titulación` · `Ingeniero(a) — Ing.` · `Tecnólogo(a) — Tnlgo.` · `Técnico(a) — Téc.` · `Profesional — Prof.` · `Arquitecto(a) — Arq.` · `Contador(a) público — C.P.` · `Administrador(a) — Adm.` · `Licenciado(a) — Lic.` · `Especialista — Esp.` · `Magíster — Mag.` · `Doctor(a) — Dr.` · `Auxiliar — Aux.` · `Bachiller académico — Bach.` |
| Cargo en la compañía | ej. "Soporte y Gerencia" |
| **Rol de menú** | *"Este campo define el menú al iniciar sesión (Administrador, Ingeniería, Comercial o Técnico). **No se toma del cargo.** Al guardarlo o cambiarlo se aplica a la cuenta vinculada."* |
| ☐ Mostrar la titulación junto al nombre en el carnet | *"(Ing., Tnlgo….). Si no, queda solo como registro en la ficha."* |
| Área | ej. "Operaciones, admin…" |
| Estado laboral | `Activo` |
| Correo / Teléfono | |
| Ciudad | |
| **Dirección *** | |
| **Municipio DANE** | ej. `11001` (Bogotá) |
| Fecha nacimiento | |
| **RH** | grupo sanguíneo |
| **EPS** / **AFP / pensión** | |
| **ARL** / **Caja compensación** | |
| Contacto de emergencia / Tel. emergencia | |
| **Fecha ingreso *** / Fecha retiro | |
| Motivo retiro / pausa | |
| **Salario base (COP) *** | |
| Bonificación (COP) / Rodamiento (COP) | *"Solo si aplica"* |
| Detalle de la bonificación | *"Bonificación mensual variable"* |
| **Tipo de contrato** | ej. `Término indefinido` |
| ☑ **Auxilio de transporte (si salario < 2 SMMLV)** · ☐ **Salario integral** | |
| **Valor auxilio de transporte (COP)** | en el video, `249095` |

Dos notas del propio NEXGO que conviene copiar tal cual, porque explican reglas:
> Bonificación y rodamiento salen en el certificado laboral solo si el valor está diligenciado.
> El certificado totaliza salario, bonificación y rodamiento.

> Por defecto usa el auxilio de **Recursos Humanos → Parámetros de liquidación**. Cámbielo solo
> si este colaborador tiene un valor distinto.

**Esa segunda nota es importante:** NEXGO tiene una pantalla de **Parámetros de liquidación** a
nivel de empresa, y la ficha de cada persona la hereda y puede sobrescribirla. Es exactamente el
diseño que hay que seguir: **los valores de ley se parametrizan, no se escriben en el código.**
Esa pantalla no sale en el video y hay que pedirla o diseñarla.

---

## Pestaña Hoja de vida

> Hoja de vida, certificaciones y documentos del colaborador. Se guardan en el archivo de la
> empresa (no en el listado). Guarde la ficha antes de subir.

- **Notas / información relevante** — *"Perfil, estudios, observaciones de selección…"*
- **Tipo** (selector, por defecto `Hoja de vida`)
- **Archivo** — *"PDF, Word o imagen · máx. 10 MB"*
- Botones: **Subir archivos** · **Guardar notas**
- Mientras la ficha no esté guardada: *"Guarde la ficha para adjuntar hoja de vida y
  certificaciones."*

---

## Pestaña Accesos — **esta NO se duplica tal cual**

Lo que hace NEXGO:
- **Acceso NEXGO (plataforma):** usuario/correo, **Rol** (se define en la pestaña Datos) y
  **Contraseña NEXGO** (mín. 6 caracteres).
- **Correo corporativo:** el colaborador lo usa instalando BlueMail; no crea cuenta en NEXGO.
- Botones **Guía PDF** y **Enviar guía**.

**No copiamos la contraseña.** El propio NEXGO dice: *"Queda registrada en la ficha para control
interno."* Guardar la contraseña de una persona dentro de su ficha de recursos humanos es un
error de seguridad serio: cualquiera que pueda ver fichas puede entrar como esa persona, y se
acaba la posibilidad de saber quién hizo qué.

En lo nuestro esa pestaña **enlaza** la ficha con el usuario del ERP, que ya tiene su propio
manejo de contraseñas. Si hay que dar una clave inicial, se entrega una vez y el sistema no la
guarda.

---

## Pestaña Dotación

**Tallas de dotación** — *"Camisa, pantalón y botas del colaborador. Se guardan con la ficha y
sirven para pedidos de uniforme y EPP."*
- Camisa (`S, M, L, XL, 38…`), Pantalón (`28, 30, 32, M…`), Botas (`38, 40, 42…`)
- Botón **Acta de entrega (PDF)**

**Herramientas de trabajo** — *"Asigne un activo del inventario o registre una herramienta
propia. Incluya fecha de entrega y foto. Puede editar o borrar cada ítem."*
- Activo del inventario (selector, *"— Del inventario interno (opcional) —"*) **o** nombre de la
  herramienta (ej. "Taladro, escalera")

---

## Pestaña Sueldo / liquidación

**Las fórmulas, textuales del propio NEXGO.** Esto es lo más importante del documento:

> Sueldo de **30** días (2026-10-01 → 2026-10-30): **salario ÷ 30 × días**. El mes se liquida
> del día 1 al 30 (**el 31 no se cuenta**), más auxilio de transporte prorrateado si aplica.

> Elija la fecha de inicio y la fecha de corte. El sueldo es **salario ÷ 30 × días** (CST: cada
> mes se liquida del día 1 al 30; si el mes tiene 31 días, el 31 no se cuenta). El auxilio **se
> prorratea a 30 días** si aplica. Del neto **se descuentan EPS y pensión (4 % del IBC: sueldo +
> extras, sin auxilio)**.

Campos: **Días laborados** y **Días base (mes)**, los dos en `30`.

Secciones plegables: **Horas extras y recargos** · **Licencias, permisos y ausencias** ·
**Valor extra no salarial**. Y abajo, **Liquidar periodo / retiro**.

El resumen que calcula:
```
Sueldo de 30 días pagados (2026-10-01 → 2026-10-30)
  Sueldo de días trabajados      $ 0     ($ 0 ÷ 30 × 30)
  Auxilio de transporte          $ 0     No aplica (salario ≥ 2 SMMLV, integral o desmarcado)
  Total devengado                $ 0
  Neto a pagar                   $ 0
```
Nota al pie del "Neto a pagar":
> Salario, auxilio, extras y ausencias del tramo, menos **aportes del trabajador (EPS y pensión
> sobre IBC)**. **No incluye cesantías, prima, vacaciones ni indemnización.**

Botones: **Liquidar y PDF** · **Enviar al correo del colaborador**. Debajo, **Historial de
liquidaciones**.

**Acá es donde el sistema calcula lo que se le paga a una persona.** Reglas de ley que ya se ven:
el umbral de 2 SMMLV para el auxilio, el IBC, los aportes del trabajador. Todo eso va como
parámetro, y **lo valida el contador de Jhojan antes de que alguien cobre con ese número**.

---

## Pestaña Desprendible

- **Fecha de pago**, **Medio de pago** (ej. `Transferencia`), **Cuenta / observación**
  (*"Banco, cuenta o nota"*)
- Resumen del período: `Periodo 01/10/2026 al 30/10/2026 · 30 días pagados`, con sueldo de días
  trabajados, auxilio de transporte, total devengado y neto a pagar.
  > Comprobante de pago del periodo. No incluye cesantías, prima, vacaciones ni indemnización.
- **Historial de desprendibles**

---

## Pestaña Caja menor

- **Concepto** — *"Para qué se entrega el dinero"*
- **Detalle del gasto**, por líneas: *"Cada línea lleva el documento que lo justifica (factura,
  cuenta de cobro o relación)"*
  - Concepto del gasto (*"Transporte, hotel, alimentación…"*) · Documento soporte (*"Factura,
    cuenta o relación"*) · Valor · botón de quitar
  - **+ Agregar línea**
- **Soportes y justificación** — *"Facturas, relación de gastos, tiquetes, peajes u otros
  documentos que respaldan el pago"*
- **Total a entregar**, con la nota: *"No constituye salario ni entra al desprendible de nómina."*
- **Historial de recibos de caja menor**

**Caja menor y gastos NO son lo mismo** (aclarado por Jhojan el 22/10/2026):

- **Caja menor = viáticos**, y solo cuando la obra es **fuera de la ciudad**: estadía,
  alimentación y demás. Se entrega plata por adelantado y se legaliza con soportes.
- **Gastos de materiales** = compras **en la ciudad**. Ahí **no se entregan viáticos**.

Son dos flujos distintos con disparadores distintos, así que **conviven** y no se unifican.

---

## Lo que falta por capturar

Solo la pestaña **Contrato** en detalle, y la pantalla **Recursos Humanos → Parámetros de
liquidación**, que no sale en el video y es de donde salen los valores de ley. Pedírselas antes
de construir esas dos partes; no inventarlas.

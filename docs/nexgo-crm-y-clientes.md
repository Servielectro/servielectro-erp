# NEXGO — CRM, Cotizaciones y Clientes

Del video del 25/10/2026 (2 min 12 s). Es la referencia para el **módulo de Clientes** y para los
**filtros del CRM** que pidió Jhojan ese mismo día.

## El menú completo de NEXGO, para ubicarse

`INICIO` · `PLANIFICACIÓN` · `OPERACIÓN` (Tickets, Mantenimientos, Cronograma, Visitas de
cotización, Firma de reportes, Proyectos, Instalaciones) · `RECURSOS HUMANOS` · `VENTAS` (CRM,
Cotizaciones, Propuestas SOP, Precios SOP, Contratos, Facturas y prefacturas, Punto de venta
(POS), Por facturar, Catálogos y listas, Órdenes de compra) · `CLIENTES` (Clientes, Cartera) ·
`FINANZAS` (Gastos, Ingresos, Flujo de caja, Reportes).

**Clientes es un módulo aparte de Ventas**, con Cartera adentro. Conviene copiar esa separación:
el CRM es el *antes* de la venta y Clientes el *después*.

---

## Ventas → CRM

> Contactos, prospectos y oportunidades. Convierta a cliente, cotice y haga seguimiento del
> pipeline.

Botones: **+ Nuevo contacto** · **Visitas de cotización** · **Recargar** · **Sincronizar
clientes**.

Un control **"Máximo a mostrar"** (deslizador, en el video en 5) para no traer toda la lista.

Filtros: **Responsable** (Todos) · **Estado** · **Buscar** (*"Empresa, contacto, email, tel"*).
Cuando hay filtro puesto, aparece **"Filtro activo: Negociación — Quitar filtro"**.

### Los 8 estados del pipeline, que son también los contadores

`Prospectos` · `Contactados` · `Cotizados` · `En negociación` · `Ganados` · `Clientes` ·
`Perdidos` · `Inactivos`

Los contadores **son el filtro**: se toca el número y filtra por ese estado. Es el patrón más
útil de toda la pantalla y hay que copiarlo.

Vacío: *"No hay contactos con estos filtros. Cree un nuevo contacto comercial."* ·
*"Mostrando 0 registro(s)"*.

### Formulario "Nuevo contacto"

| Campo | Nota del propio NEXGO |
|---|---|
| **Empresa / Razón social *** | |
| Persona de contacto | |
| **Email principal** | *"Correo registrado del contacto; se mantiene como principal"* |
| **Email adicional (copia)** | *"Opcional: se sugiere al enviar cotizaciones (gerencia, compras, etc.)"* |
| Teléfono | |
| NIT | Opcional |
| Cargo / Ciudad | |
| **Origen del lead** | selector |
| **Aliado / referidor** | *"(solo interno)"* — *"Solo uso interno. No sale en documentos al cliente."* |
| **Comisión %** | |
| **Oportunidad / asunto *** | *"Ej: Cotización sistema CCTV sede norte"* |
| Descripción / necesidad | |
| **Fecha inicio seguimiento** / **Fecha objetivo cierre** | en el video, 25/10/2026 y 24/11/2026 (un mes) |
| **Estado comercial** | Prospecto |
| **Responsable comercial** | *"Comercial o admin que gestiona este lead"* |
| **Cliente vinculado** | *"Si ya es cliente, selecciónelo o use «Convertir a cliente» en la lista"* |
| **Enlace externo (SIIGO / carpeta)** | `https://...` |

**Dos cosas que importan:**

1. **`Fecha objetivo cierre` es lo que hace útil al CRM.** Sin ella no hay "se me venció el
   seguimiento", y un CRM sin vencimientos es una lista de nombres. NEXGO la pone por defecto a
   un mes.
2. **NEXGO no importa de SIIGO: solo guarda un enlace.** Lo que pidió Jhojan —subir el Excel que
   descarga de SIIGO— va más allá de lo que hace NEXGO. No hay a quién copiarle; hay que
   diseñarlo.

---

## Ventas → Cotizaciones

> Documentos comerciales vinculados al CRM. Al crear/enviar/aprobar una cotización se actualiza
> el contacto automáticamente.

Contadores: `Total` · `Pendientes` · `En negociación` · `Aprobadas` · `Perdidas` · `Por facturar`
· `Facturadas`. Botones **Nueva Cotización** y **Recargar**; filtro **Estado** y buscador
(*"N°, cliente, proyecto…"*).

**El CRM y las cotizaciones son la misma historia vista dos veces.** Crear una cotización mueve
el contacto de estado solo. Eso es lo que evita el doble registro.

### Nueva Cotización

- **N° Cotización** (`COT-2026-0001`) · **Cliente *** con buscador y botón **Nuevo cliente**
  — *"Se vincula automáticamente al CRM (crea o actualiza el contacto comercial para
  trazabilidad)."*
- **Nombre del Proyecto / Cotización *** (*"Ej: Sistema de seguridad - Bodega Norte"*)
- **Equipos y Servicios**: buscador (*"Código, título, marca…"*) + **Cant.**, botones
  **Agregar**, **Nuevo producto**, **Crear producto**.
- **Instalación (opcional)**: ☐ Incluir materiales de instalación · ☐ Incluir mano de obra
  instalación.
- **Resumen**: Subtotal equipos/servicios · Subtotal antes de IVA · IVA · **TOTAL**.
- **Anticipo y retenciones** — *"Calculadora · RT · ICA · pago esperado"*.
- Observaciones / Complementos.
- **Aliado / referidor** + **Comisión %** — *"No aparece en PDF, email ni enlace público.
  Comisión sobre valor facturado."* · **Estado comisión** (Pendiente).
- **Métodos de pago** — *"Elija el esquema de anticipo. En el PDF solo aparece el seleccionado."*
  `50% – 50%` (anticipo y pago final) · `60% – 40%` · `50% – 30% – 20%` (anticipo, entrega
  parcial y puesta en marcha). ☐ **Descuento por pago del 100%** — *"Solo instalaciones o
  reparaciones"*.
- **Tiempo de entrega** (*"Ej: 8 días hábiles tras el anticipo"*) / **Tiempo de ejecución**
  (*"Ej: 5 días de trabajo en sitio"*).
- Cuenta bancaria, transferencia u otras notas · **Condiciones Comerciales**.
- **Estado**: `Pendiente / interna` · `En negociación` · `Aprobada` · `Perdida` · `Por facturar`
  · `Facturada (otro sistema)` — *"Use «Facturada» si ya emitió la factura fuera de NEXGO y solo
  necesita actualizar el estado."*
- Botones: `Cancelar` · `PDF` · **`Solo guardar (interno)`** · **`Guardar y enviar email`**.

**"Facturada (otro sistema)" es la pieza que reconoce la realidad de Servielectro:** la factura
se emite en SIIGO, no acá. El ERP no debe pretender facturar; debe saber que ya se facturó.

---

## Clientes → Nuevo Cliente (los datos fiscales)

Esta es la parte que el ERP todavía no tiene completa y la que llena un Excel de SIIGO.

| Campo | Nota |
|---|---|
| **Nombre / Razón Social *** | |
| **Tipo documento (DIAN)** | `13 — Cédula de ciudadanía` (lista DIAN) |
| **Tipo persona** | `Persona natural` / jurídica |
| **NIT / Identificación** | *"Sin DV ni guion (ej. 901559696)"* |
| **DV (NIT)** | *"Se calcula solo si el tipo de doc. es NIT"* |
| **Email *** | *(FE / DIAN)* |
| **Correo del encargado de proyecto** | *"Opcional. Se usa para avisos de avance, actas y cualquier envío adicional al responsable del proyecto en el cliente."* |
| Teléfono · Dirección | |
| **Municipio DIAN (código DANE)** | *"Obligatorio para FE. Use el código DANE de 5 dígitos."* (ej. 11001 Bogotá, 05001 Medellín) |

**Datos fiscales (FE / DIAN):**

- **Régimen IVA**: `ZZ — No responsable de IVA` y demás. *"Según el RUT. Se envía a la DIAN al
  emitir FE."*
- **Responsabilidad fiscal (RUT)** — *"Verifique en el RUT del cliente. Mínimo asigne R-99-PN."*
  Casillas: `O-13 Gran contribuyente` · `O-15 Autorretenedor` · `O-23 Agente de retención IVA` ·
  `O-47 Régimen simple de tributación` · `R-99-PN No aplica / Otros`.
- **Declarante de renta**: Sí / No — *"Define la tarifa de retención en la fuente que aplica."*
- **Notas**.

### Qué de esto ya está en nuestra tabla `clientes`

Ya existen: `nombre`, `nit`, `contacto`, `telefono`, `email`, `direccion`, `activo`,
`tipo_contribuyente`, `responsable_iva`, `municipio`, `departamento`, `responsabilidades_rut`,
y la ubicación (`latitud`, `longitud`, precisión y cuándo se tomó).

**Falta**, y es justo lo que trae el Excel de SIIGO: `tipo_documento` DIAN, `tipo_persona`, el
**DV** separado del NIT, el **código DANE** del municipio, `declarante_renta`, el **correo del
encargado de proyecto**, y las **sedes** (un cliente con varias, que Jhojan ya había pedido).

**Ojo con `responsabilidades_rut`:** ya existe como arreglo. El Excel de SIIGO hay que mapearlo a
esos mismos códigos, no inventar otra lista.

---

## Lo que hay que preguntarle a Jhojan antes de construir la importación

El Excel de SIIGO no sale en el video. Antes de escribir el importador hace falta **un archivo
de ejemplo**: los nombres exactos de las columnas, si el NIT trae el DV pegado o separado, y si
el municipio viene como nombre o como código DANE. Diseñar el mapeo sin verlo es adivinar.

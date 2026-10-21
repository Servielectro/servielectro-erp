# 2Workers — "Detalles de la tarea": la vista del coordinador

Transcrito del video que grabó Jhojan el 20/10/2026 (2 min 8 s, su cuenta real, tarea 5002293).
Pedido suyo: *"mira los resultados de una visita y cómo se visualizan. Así lo quiero para el
módulo de operativo, para que el coordinador vea y tenga la gestión de eso"*.

Es la contraparte de [la pantalla de asignación](./2workers-registrar-nueva-tarea.md): una vez
el técnico cerró la visita, acá es donde el coordinador ve el resultado.

## Encabezado

`‹ Detalles de la tarea 5002293` · botones **Copiar Link** y **Editar**.

El número de la tarea es visible y hay un enlace para compartir. Vale la pena: así se referencia
una visita por teléfono o por WhatsApp.

## Pestañas

`Detalles` · `Observación del usuario` · `Anexos` · `Formularios` · `Equipos` · `Pendientes`
· `Control de horas` · `Emails enviados` · `Valores`

## Pestaña Detalles

### DATOS DE LA TAREA
Arriba a la derecha, la fecha y hora programadas: `02/09/2026 a las 11:30`.

- **Creado por** `GESTION COMERCIAL` en `02/09/2026 a las 10:44` — queda quién y cuándo la creó
- **Para:** `TECNICOS PLANTA` — a quién se asignó
- **Tipo de tarea:** `Visita técnica`
- **Prioridad:** `Alta`
- **Dirección:** `Edicio Renacer - CALLE 129 # 56C-22`
- **Descripción de la tarea:** `Levantamiento información CCTV`
- **Palabras Claves** y **Código externo**

### Cotizaciones
Tabla con Código · Etapa · Fecha de Solicitud · Colaborador responsable · Valor cotizado, y dos
botones: **Asociar a cotización ya creada** y **+ Crear Cotización**.

**Esto es exactamente nuestro flujo de sugerencias**, que ya existe en la base desde la migración
45 y tiene su bandeja en Operativo. Confirma que el camino elegido es el correcto, y que la
cotización debe verse desde la visita y no solo al revés.

### MONITOREO
Una línea de tiempo horizontal con cuatro hitos, cada uno con su fecha y hora:

| Hito | Ejemplo |
|---|---|
| **Recibida** | 02/09/2026 10:46 |
| **Vista** | 02/09/2026 10:46 |
| **Check-in** | 02/09/2026 11:50 |
| **Check-out** | 02/09/2026 15:31 |

**"Vista" confirma que la columna `visto_en` que propusimos es la correcta:** la oficina quiere
saber si el técnico abrió la tarea, no solo si se la enviaron.

Debajo, los números de la visita:
- **Tipo de check-in:** Manual
- **Estatus:** Finalizada manualmente en 02/09/2026 a las 15:31
- **Distancia check-in** y **Distancia check-out:** No determinado
- **Duración:** `03:41:40`
- **Retraso:** `00:20:02` — contra la hora programada
- **Inicio de desplazamiento**, **Duración del desplazamiento**
- **Km informado:** 17,7 Km

**Duración y Retraso son las dos métricas de gestión que importan** y salen solas de los datos
que ya guardamos.

### Firma
Aparece la firma a mano alzada dibujada, con el texto "Firmado por: …" debajo.

### Fotos
Galería en rejilla de tres por fila. Al tocar una, se abre a pantalla completa con flechas para
pasar a la siguiente.

## Pestaña Formularios
Los formularios llenados en sitio.

## Pestaña Emails enviados
**La pieza que faltaba y que confirma lo que pedimos.** Dos bloques:

**OS DIGITAL** (la orden de servicio en PDF enviada al cliente), con etiqueta `Último envío`:
- Fecha y hora de envío: `20/10/2026 a las 22:18h`
- **Enviado por:** `GESTION COMERCIAL vía 2Workers Web`
- **Enviado para:** el correo del destinatario
- ✅ `La OS Digital fue enviada con éxito para el email informado`

**ENCUESTA DE SATISFACCIÓN**:
- `La encuesta de satisfacción aún no fue enviada por email.` **`Haga clic aquí para enviar`**

**Dos cosas que vale la pena notar:**
1. Hay **registro de cada envío**: a quién, cuándo, por quién y si llegó. Es lo que pedimos como
   no negociable.
2. **La encuesta se envía a mano**, con un enlace, no automáticamente. El propio 2Workers, que
   Jhojan usa hace cinco años, no automatiza ese envío.

## Pestaña Valores
Tabla con Productos, Servicios y Costos adicionales, con cantidad, valor unitario y total.

## Qué de esto ya tenemos

| Pieza | Estado |
|---|---|
| Datos de la visita, quién la creó y para quién | Sí |
| Check-in y check-out con hora y GPS | Sí (migración 45) |
| Firma dibujada con nombre y cédula | Sí, publicada el 20/10/2026 |
| Fotos con antes/durante/después | Sí |
| Sugerencias → cotización, con trazabilidad | Sí (la bandeja de Operativo) |
| Reporte diario | Sí |
| **Pantalla de resultado para el coordinador** | **No. Es lo que pide acá.** |
| Línea de tiempo Recibida/Vista/Check-in/Check-out | Falta `visto_en`; el resto ya está |
| Duración y Retraso | Se calculan de lo que ya hay |
| Dirección y ubicación del sitio | No (migración pendiente) |
| PDF de la visita | No |
| Envío por correo y su registro | No |
| Encuesta de satisfacción | No |
| Km recorridos | No, y no lo ha pedido |

## Orden que propongo

1. **La pantalla del coordinador** con lo que ya existe: datos, línea de tiempo, duración y
   retraso, firmas, fotos en galería, reporte diario y sugerencias. No necesita nada nuevo en la
   base salvo `visto_en`.
2. El **PDF** de esa misma pantalla.
3. El **envío por correo** con su registro, a un toque.
4. La **encuesta de satisfacción**.

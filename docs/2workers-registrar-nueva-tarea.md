# 2Workers — formulario "Registrar nueva tarea"

Transcrito del video que grabó Jhojan el 20/10/2026 (87 s, su propia cuenta de 2Workers).
Es la referencia de campos que pidió replicar: *"me gustarían esos campos, ya que están completos"*.

No hay que copiarlo entero ni copiar su diseño. Lo que importa es **qué datos lleva una tarea
asignada a un técnico**, porque esa lista sale de cinco años usándolo en obra.

## Pestañas

`General` · `Ubicación` · `Equipos` · `Anexos` · `Repetición` · `Valores`

El video solo recorre **General** y **Ubicación**. Las otras cuatro no se abrieron: si hacen
falta, hay que preguntarle.

## Pestaña General

| Campo | Tipo | Lo que se vio |
|---|---|---|
| **Tarea será ejecutada por** | dos selectores | Primero: `Colaborador` · `Grupo de colaboradores` · `Todos en el grupo de colaboradores`. Después, a quién: `No informar`, `GESTIÓN COMERCIAL – Gestión Comercial`, `TECNICOS EXTERNOS`, `TECNICOS PLANTA` |
| **Fecha** | calendario | Mes completo, se eligió el 20 de octubre de 2026 |
| **Hora** | reloj | Carátula analógica, quedó en `14:00` |
| **Tipo de Tarea** | selector | `Mantenimiento de CCTV`, `Mantenimiento de Sistema de Alarma`, `Mantenimiento de Puertas`, `Mantenimiento de Cerco Eléctrico`, `Mantenimiento de Control de Acceso`, `MANTENIMIENTOS GENERALES`, `Servicios Adicionales`, `Visita técnica` |
| **Tiempo de duración** | texto | Vacío en el video |
| **Formularios** | selector | `Seleccione…`, `Facturación`, `Firma adicional`, `Formulario`, `LEVANTAMIENTO DE INF CCTV`, `LEVANTAMIENTO DE INF DE PUERTAS PEATONALES`, `MANTENIMIENTO DE CERCA ELECTRICA`, `MANTENIMIENTO DE PUERTAS`. Eligió `Firma adicional` |
| **Prioridad** | selector | `Alta` |
| **Descripción de la tarea** | texto largo, **obligatorio** | Escribió "hacer levantamiento de información para cotización." |
| **Tipo de check-in** | selector | `Estándar de colaborador` · `Automático` · `Manual` |
| **Palabra Clave** | texto | "Búsqueda por palabra clave" |
| **Usar encuesta de satisfacción** | casilla | Al marcarla aparece **Email del destinatario de la encuesta**; puso `servielectrobogota@gmail.com` |
| **Código externo** | texto | Vacío |

Botones: `Cerrar` · `Guardar y agregar otra tarea` · `Guardar`.

## Pestaña Ubicación

Mapa a la izquierda (Leaflet con teselas de HERE) y a la derecha cuatro formas de fijar el punto:

1. **Cliente** — "Busque un cliente".
2. **URL Google Maps** — "Puede extraer los datos de la URL de búsqueda de…" con un botón **Extraer**.
   **Esto es lo que Jhojan pidió explícitamente:** abre Google Maps, marca el punto con el zoom
   que quiera, copia la URL, la pega acá, y la aplicación saca la ubicación y la deja marcada
   para que el técnico la tenga.
3. **Here** — "Búsqueda de direcciones y ubicaciones basado en here maps".
4. **Foursquare** — Ciudad + "Búsqueda por ubicación".

Debajo del mapa: **Dirección** (en el video, `calle 36 sur # 69 a 06`), **Latitud** y **Longitud**.

## Lo que Jhojan pidió además del formulario

- **Aviso al técnico** de que le llegó una tarea nueva.
- Poder cargar **fecha y hora**.
- La **ubicación pegando la URL de Google Maps**.

## Qué de esto ya tenemos

- Asignar a una persona: sí (`tarea_asignados`). **A un grupo: ya existe `grupos` desde la 53**,
  pero el tablero todavía no deja asignar una tarea de obra a un grupo.
- Fecha y hora: las columnas `fecha_programada` y `hora` existen desde la 50; falta la pantalla.
- Prioridad y descripción: sí.
- Tipo de tarea, tiempo de duración, formularios, tipo de check-in, palabra clave, encuesta de
  satisfacción, código externo: **no existen**.
- Ubicación del sitio puesta por quien asigna: **no existe**. Ojo: `visitas` tiene GPS de
  check-in y check-out, que es **evidencia de dónde estuvo el técnico** y no se debe reutilizar
  para esto.

## Antes de construir

Los **Formularios** por tipo de servicio son la pieza grande y ya están especificados en otro
lado: son las 10 hojas del Excel del informe técnico (Inventario CCTV, Inventario Acceso,
Inventario Incendio, Topología, Cargas y autonomía, Hallazgos y riesgos…). No inventarlos.

Preguntar a Jhojan antes de empezar:
1. De esta lista, **cuáles usa de verdad** y cuáles nunca llenó en cinco años.
2. Qué hay en las pestañas **Equipos, Anexos, Repetición y Valores**, que no se abrieron.
3. Si la encuesta de satisfacción la usa o es de las que nunca activó.

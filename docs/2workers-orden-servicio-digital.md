# 2Workers — "Orden de Servicio Digital": el informe que le llega al cliente

De dos capturas que mandó Jhojan el 20/10/2026: el correo que recibió y la página que abre ese
correo. Es el modelo del informe de visita que pidió: *"que se organice todo en un PDF para
poder enviarlo… al cliente por correo, para que la bitácora de la visita llegue el mismo día"*.

## Lo primero, porque cambia el diseño: **no manda un PDF adjunto**

El correo lleva **un enlace a una página web**. El PDF se descarga después, desde esa página, si
alguien lo quiere. Nosotros habíamos hablado de "generar un PDF y enviarlo"; el camino real es
otro y es mejor: la página siempre se ve bien en el celular del cliente, pesa poco en el correo
y no se rompe si hay muchas fotos.

## El correo

- **De:** `SERVICIOS ELECTRONICOS INDUSTRIALES SAS <noreply@2workers.me>`
- **Asunto:** `(SERVICIOS ELECTRONICOS INDUSTRIALES SAS) Orden de servicio digital 5002293`
- **Cuerpo:**
  > **Orden de Servicio Digital**
  >
  > ¡Hola!
  >
  > Aquí están las informaciones sobre la Orden de Servicio Digital:
  > Realizada por **SERVICIOS ELECTRONICOS INDUSTRIALES SAS** en **Edicio Renacer** en el día
  > **02/09/2026 11:30:00**
  > en la dirección [CALLE 129 # 56C-22](#) *(enlace al mapa)*
  > Realizada por el colaborador: **TECNICOS PLANTA**
  >
  > [**Haz click aquí para visualizar la Orden de Servicio Digital**](#)

Ojo que sale de `noreply@2workers.me`, el dominio **de ellos**, no el de Servielectro. Para
nosotros eso importa: si mandamos desde un dominio sin verificar, el correo cae en spam.

## La página

`2workers.me/informacoes/tarefa/<uuid>?chave=<token>`

Una página pública, sin login, protegida solo por el **token aleatorio de la URL**. Contiene:

- Los datos de la visita.
- **Las fotos**, en una rejilla de tres por fila.
- **La firma dibujada**, con `Firmado por: Santiago Trujillo` debajo.
- Abajo, dos botones: **Imprimir** y **Descarga del PDF**.

## El punto que hay que decidir antes de construir esto

Ese enlace es **un secreto en la URL**: quien lo tenga, ve el informe. No caduca y no se puede
revocar. Un correo reenviado, o un celular prestado, y el informe queda a la vista de alguien
que no debería tenerlo.

Y en el caso de Servielectro el contenido no es trivial: **son fotos de dónde están instaladas
las cámaras de un edificio**, los cuartos técnicos y los puntos de acceso. Eso es un mapa de la
seguridad del cliente. 2Workers lo resuelve con un token y nada más; nosotros deberíamos hacerlo
mejor, y no cuesta mucho:

- **Que el enlace caduque** (30 o 60 días, a definir con él).
- **Que se pueda revocar** desde la visita, si se mandó al correo equivocado.
- **Registrar cada apertura** — cuándo se vio, igual que registramos el envío.
- Evaluar con él si las fotos van en el enlace público o si el cliente debe pedirlas aparte.

Esto no es trabajo de más: es la diferencia entre entregarle al cliente un informe y dejar el
plano de sus cámaras en una URL que circula por WhatsApp. **Preguntárselo antes de construir.**

## El informe, bloque por bloque

De la captura de la página completa. Ya sale con la marca de Servielectro, así que el formato
le sirve casi tal cual.

**Encabezado**
- Logo de Servielectro a la izquierda.
- Título: **Informes de Actividades**.
- Bloque de la empresa: `SERVICIOS ELECTRONICOS INDUSTRIALES SAS`, Teléfono, **Número de
  identificación empresarial** (el NIT), Email, Dirección.

**Franja de identificación:** a la izquierda el sitio (`Edicio Renacer`), a la derecha
`Tarea 5002293`.

**Informaciones del cliente** (tabla)

| Campo | Ejemplo |
|---|---|
| Hablar con | Edilma Triana |
| Identificación Personal/Empresarial | 1542314 |
| Teléfono | 252352345 |
| Email | edificiorenacer129@gmail.com |
| Observación | *(vacío)* |

**Informaciones de las actividades** (tabla)

| Campo | Ejemplo |
|---|---|
| Para | TECNICOS PLANTA |
| Tipo de tarea | Visita técnica |
| Fecha | 02/09/2026 a 11:30 |
| **Check-in** | 02/09/2026 a 11:50 |
| Dirección | CALLE 129 # 56C-22 |
| Descripción de la tarea | Levantamiento información CCTV |
| **Reporte de ejecución** | Lista de renglones, uno por hallazgo |
| Palabras clave | *(vacío)* |

El **Reporte de ejecución** del ejemplo, que muestra bien para qué sirve:
> Se requiere la instalación de 21 cámaras nuevas ip
> El mantenimiento del sistema de cctv existente
> Mantenimiento de las puertas de salida de emergencia
> Instalación de dos sirenas con relé para pánico
> Cambio de estrobo para puerta vehicular

**Eso es exactamente nuestra bandeja de sugerencias.** Cada renglón es algo por cotizar. En el
informe va como texto; en nuestro ERP además queda enganchado al comercial.

**Formulario: Firma adicional** → sub-bloque **Firma** → la firma dibujada → `Firmado por: José
Morales`.

**Fotos** → rejilla de tres por fila.

Al final del documento aparece **otra firma**, con `Firmado por: Santiago Trujillo`. O sea: la
firma del formulario y la firma de cierre son dos, como en nuestro modelo (técnico y cliente).

**Detalle de estilo:** las etiquetas van en negro y **los valores en el rojo corporativo**.
Combina con nuestra marca (#A82323) sin tener que inventar nada.

## Qué implica para nosotros

| Pieza | Nota |
|---|---|
| Página pública de la visita | Con token, caducidad y revocación |
| PDF | Se genera desde esa página, no se adjunta al correo |
| Correo | Hace falta un dominio propio verificado (SPF y DKIM) o cae en spam |
| Registro de envíos | Ya acordado: a quién, cuándo, por quién, si llegó |
| Registro de aperturas | Nuevo, sale casi gratis y vale para "¿lo recibió?" |

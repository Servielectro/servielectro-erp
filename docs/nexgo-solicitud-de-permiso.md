# NEXGO — "Solicitud de permiso"

Del video del 22/10/2026 (41 s). Es la referencia que pidió Jhojan para que **el técnico
solicite permisos desde la app**.

Está en `Recursos Humanos → Certificados y permisos`, pestañas **Permisos** y **Certificados
laborales**, con contador, filtros Desde/Hasta, buscador y **Exportar**.

Texto de esa pantalla, que vale la pena leer porque anticipa otra función:
> El colaborador puede generar y descargar su **certificado laboral** en PDF con el membrete de
> la empresa, NIT/ID, antigüedad, el histórico y las solicitudes de permisos.

## El formulario

Subtítulo: *"Formato de permiso / licencia: datos del colaborador, tipo, fechas, motivo,
compensación y firmas."*

| Campo | Tipo | Valores vistos |
|---|---|---|
| **Colaborador** * | selector | — |
| **Tipo** | selector | `Asunto personal` · `Permiso remunerado` · `Permiso no remunerado` · `Cita médica` · `Calamidad doméstica` · `Medio día` · `Permiso por horas` · `Otro` |
| **Fecha solicitud** | fecha | por defecto, hoy |
| **Estado** | selector | `Solicitado` · `Aprobado` · `Rechazado` · `Gozado` |
| **Desde** * / **Hasta** | fechas | |
| **Hora inicio** / **Hora fin** | horas | para medio día y permisos por horas |
| **Motivo** | texto largo | "Describa el motivo del permiso" |
| **Compensación** | selector | `Con goce de sueldo` · `Sin goce de sueldo` · `Reposición de tiempo` · `Descuento de nómina` |
| **Observaciones** | texto largo | |
| **Jefe inmediato** | texto | "Nombre quien autoriza" |
| **Visto bueno RR.HH.** | texto | en el video, `Jhojan Poveda` |

Botones: `Cerrar` · `Guardar` · **`Guardar y PDF`**.

## Las diferencias con lo que quiere Jhojan

**1. Quién lo llena.** En NEXGO lo llena RRHH y elige el colaborador de una lista. Jhojan quiere
que **lo solicite el técnico desde la app**. Entonces en lo nuestro el colaborador **es quien
solicita**, no un campo editable, y RRHH/Jhojan aprueban después.

**2. No se puede pedir para el mismo día.** Regla suya, no de NEXGO: ahí el "Desde" viene con la
fecha de hoy. En lo nuestro la fecha mínima es **mañana**, y el mensaje tiene que decir por qué.
Queda pendiente preguntarle qué pasa con una **calamidad doméstica** o una **cita médica** de
urgencia, que por naturaleza son del mismo día: o se permiten como excepción, o se registran
después como "permiso ya tomado". Si no, la gente va a avisar por WhatsApp y el sistema queda
por fuera, que es justo lo que se quiere evitar.

**3. Dos visados.** El formato tiene **Jefe inmediato** y **Visto bueno RR.HH.**, o sea dos
firmas distintas. Conviene saber si quiere lo mismo, y si se parece a lo que decida para la
aprobación de los **abonos de nómina**, que es la misma pregunta.

**4. Estado.** `Solicitado → Aprobado / Rechazado → Gozado`. El último es útil: distingue lo
aprobado de lo efectivamente tomado, que es lo que Alejandra necesita para costear.

**5. "Guardar y PDF".** El permiso sale en PDF, igual que el informe de visita. Mismo mecanismo.

## Lo que ya tenemos y sirve acá

- El **lienzo de firma** de las visitas, para las firmas del formato.
- El patrón de **documento con destinatario** que va a necesitar RRHH.
- El **PDF**, cuando lo hagamos para la visita.

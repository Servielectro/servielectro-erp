# 2Workers — Ubicación desde Google Maps y "Gestionar clientes"

Del video que mandó Jhojan el 21/10/2026, revisado cuadro por cuadro. Es la referencia para dos
cosas que vienen: fijar la ubicación del sitio pegando un enlace de Google Maps, y el submódulo
de Clientes dentro de Administrativo.

Ver también: [la pantalla de asignación](./2workers-registrar-nueva-tarea.md) (pestaña
Ubicación) y [el resultado de la visita en Operativo](./operativo-detalle-visita.md).

## 1. Pegar el enlace de Google Maps: qué hace de verdad 2Workers

Después de pegar la URL y darle **Extraer**:

- El mapa se mueve al punto y **Latitud** queda llena (en el video, `4.6202594`).
- **Dirección queda VACÍA.** Al lado aparece un botón rojo aparte, **"Buscar dirección…"**.
- Lo que se ve escrito en Dirección ("calle 36 sur # 69 a 06") **es el autocompletar de Chrome**,
  no 2Workers.

O sea: **Extraer saca solo las coordenadas; la dirección es un segundo botón** que se aprieta a
mano. Jhojan lo recordaba como automático. Él quiere que sea automático, pero el estándar contra
el que nos comparamos es ese: dos pasos.

**Regla nuestra (no negociable):** una dirección sacada del mapa se muestra como *sugerida*, se
puede corregir a mano y queda guardado de dónde salió. Nunca se presenta como cierta si nadie la
confirmó. Si no se puede obtener: campo vacío y aviso, nunca una aproximada.

## 2. Por qué amplía el zoom al tope (y qué implica para el extractor)

La URL que pega es del tipo `https://www.google.com/maps/@4.6202594,-74.xxxx,<zoom>z`.

Esa forma `@lat,lng` es **el centro de la vista**, no un punto marcado. Por eso amplía al máximo:
para que el centro de la pantalla coincida con el sitio. Sin zoom, la URL apunta al centro de la
ciudad.

El extractor tiene que distinguir:

| La URL trae | Qué es | Qué hacer |
|---|---|---|
| `!3d<lat>!4d<lng>` (o `/place/…` con esos datos) | El **lugar marcado** | Usarlas: son exactas |
| `?q=<lat>,<lng>` o `query=<lat>,<lng>` | Un **punto** buscado | Usarlas |
| Solo `@<lat>,<lng>,<zoom>z` | El **centro de la vista** | Usarlas, pero decir en pantalla que es el centro del mapa y que verifique. Con zoom bajo (menos de 17z) avisar que el punto puede estar lejos del sitio |
| Enlace corto (`maps.app.goo.gl`, `goo.gl/maps`) | No trae coordenadas | Resolver la redirección en el servidor, solo hacia dominios de Google, y aplicar esta misma tabla a la URL larga |
| Nada de lo anterior | — | No inventar: campo vacío y aviso |

Esa diferencia es la que evita mandar un técnico a quince cuadras.

## 3. "Gestionar clientes" (de fondo en el video)

El modelo para el submódulo de Clientes:

- Columnas: **Cliente · Dirección · NIT · Contacto · Email · Última visita · Estatus (Activo)**.
- Buscador, **Filtrar**, **Más acciones** y **Adicionar cliente**.
- 40 clientes, paginados de a 10.

**"Última visita"** se calcula sola desde `visitas` (la más reciente con entrada del técnico).

## Estado

Nada de esto está construido (2026-10-21). Antes: la propuesta de sedes, el proveedor de
geocodificación inversa y las respuestas de Jhojan.

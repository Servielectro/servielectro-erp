# SG-SST — qué copiar de DataScope, Sabentis y Novasoft

Revisión del 26/10/2026. Jhojan dio estos tres como referencia. Cada uno enseña una cosa
distinta, y conviene no mezclarlas:

- **DataScope** → *cómo se llena un formato en campo.* Es el modelo operativo.
- **Sabentis** → *qué pide un sistema de gestión completo.* Es el modelo de alcance.
- **Novasoft** → *cómo se vende y se integra esto en Colombia.* Es el modelo local.

---

## 1. DataScope — el modelo operativo (lo más parecido a lo que necesita el SST en obra)

Lo que hace, según su propia documentación:

- **Armador de formularios**: la empresa arma sus formatos con los tipos de pregunta que
  necesite — **foto, firma, geolocalización, listas de verificación**, código de barras y QR.
- **Funciona sin conexión**: si no hay internet, los datos se guardan y se sincronizan después.
- **El supervisor ve lo recogido en tiempo real**, y puede exportarlo o integrarlo.
- **Asignación de tareas** con indicadores de cumplimiento.
- Corre en cualquier celular o tablet, Android o iOS.

**Lo que tomamos:** prácticamente todo, porque es exactamente el flujo del ATS y las
inspecciones. En particular, **el armador de formularios es la decisión de arquitectura del
módulo**: los formatos son datos, no código. Y el **sin conexión no es opcional** — un ATS se
llena en una obra donde no hay señal.

**Lo que ya tenemos y no hay que volver a construir:** el lienzo de firma de las visitas, la base
local con cola de subida del módulo Técnico, y las fotos con su candado de evidencia.

---

## 2. Sabentis — el alcance de un sistema de gestión

Se vende como plataforma de SST con más de 45 módulos. No hay que copiar 45 módulos: hay que
mirar **cuáles de esos nombres son huecos reales** en lo que estamos haciendo.

### 🟢 Lo que sí nos falta y vale

**Portal del trabajador, con reporte de riesgos.** En Sabentis cada empleado gestiona su
información, **comunica riesgos** y llena cuestionarios. Para Servielectro esto es
**reportar un acto o condición insegura desde la obra**, con foto y ubicación, en diez segundos.
Es barato de construir, no depende de los formatos de la SST, y es de las pocas cosas que
convierten el módulo en algo vivo en vez de un archivador. **Se puede construir ya.**

**Accidentes e incidentes.** Registro del evento, con la investigación después. Hoy no existe
nada de esto en el ERP y es lo primero que pide una ARL. **También se puede construir ya**, sin
los formatos. Ojo: en Colombia hay un **plazo legal corto para reportar un accidente de trabajo
a la ARL y a la EPS**; el sistema debería recordarlo y contar los días. **Confirmar el plazo
exacto con la responsable SST** antes de ponerlo en pantalla — no inventarlo.

**Formación / capacitaciones con registro.** Es lo que Jhojan ya pidió en los puntos 3 y 4.
Sabentis confirma que la pieza que importa no es el video: es **quién la tomó, cuándo y con qué
resultado**, porque eso es lo que se enseña en una auditoría.

**Contratistas.** Servielectro vive entrando a obras de terceros, y además a veces subcontrata.
Quién entró, con qué documentos vigentes, con qué afiliación. Para después, pero conviene que la
estructura no lo impida.

**Indicadores y auditoría.** El módulo de auditoría de Sabentis existe para "optimizar las tareas
documentales y generar el informe final". Eso es, en lo nuestro, el **plan de trabajo con el
porcentaje de avance** que pidió Jhojan.

### 🔴 Lo que no

Vigilancia de la salud, ergonomía y psicosociología: son servicios profesionales con datos de
salud de por medio. Guardar diagnósticos de los empleados es una categoría de dato que no
queremos en el ERP sin una razón muy fuerte. Si hace falta, se guarda **que el examen se hizo y
cuándo**, no el resultado.

Predicción con IA y big data: con el volumen de Servielectro no hay con qué predecir nada.

---

## 3. Novasoft — lo que enseña del mercado colombiano

No encontré la lista oficial de funciones del módulo; lo que sí hay son **contratos públicos**,
que dicen más que un folleto:

**El argumento de compra es la integración con nómina.** En el anexo técnico de una entidad
pública, el requisito está escrito así: *"resulta indispensable que el módulo de Seguridad y
Salud en el Trabajo (SST) esté integrado dentro del sistema de gestión de nómina"*, para no
reprocesar datos ni exportarlos entre aplicaciones.

**Eso valida lo que estamos haciendo.** Nuestro SG-SST se para sobre la misma tabla `empleados`
de RRHH: la misma persona, la misma ficha, la misma dotación de EPP. El ausentismo y las
incapacidades salen de ahí. Es justamente la ventaja que Novasoft vende, y nosotros la tenemos
de entrada por no haber construido dos sistemas.

**El precio, como referencia:** en una orden de compra de 2025 de la Tienda Virtual del Estado
Colombiano, el *"MÓDULO DE SG-SST (hasta 100 funcionarios)"* aparece a **3.000.000 COP al mes**,
en suscripción anual. Es una entidad pública y no es comparable uno a uno, pero sirve de
referencia de lo que vale esto en el mercado local.

---

## Lo que se puede construir YA, sin los formatos de la SST

Los formatos de Jhojan llegan mañana. Mientras tanto, nada de esto depende de ellos:

1. **El armador de plantillas y el llenado en sitio** (tipos de campo, foto, firma, ubicación,
   tabla, sin conexión, PDF). Los formatos son datos que se cargan encima.
2. **Reporte de acto o condición insegura** desde la app del técnico, con foto y ubicación.
3. **Registro de accidentes e incidentes**, con el conteo de días para el reporte a la ARL (el
   plazo lo confirma la SST).
4. **El bloque de firmas**: tres partes, y el de técnicos es una **lista** — firman todos los que
   estuvieron en la obra ese día (confirmado por Jhojan el 26/10/2026), más el responsable en
   sitio de Servielectro y el responsable SST del cliente.
5. **La estructura del plan de trabajo** (estándar, responsable, fecha límite, evidencia,
   avance), vacía. Los estándares los carga Jhojan con la SST el miércoles.

## Lo que NO se construye hasta tener los documentos

Los formatos en sí: ATS, permiso de trabajo, alturas, inspección de escaleras, inspección de
herramientas, trabajo en caliente. **Se cargan tal cual están en los documentos de la SST**, no
de memoria ni "parecidos".

---

### Fuentes

- DataScope: https://www.mydatascope.com/
- Sabentis (ficha de proveedor en G2): https://www.g2.com/products/sabentis/discuss
- Novasoft, módulo SG-SST en contratación pública:
  https://operaciones.colombiacompra.gov.co/tienda-virtual-del-estado-colombiano/ordenes-compra/152900

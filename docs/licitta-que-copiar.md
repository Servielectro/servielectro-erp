# Licitta: qué copiar y qué no, para el módulo de licitaciones

Estudio hecho el 2026-11-06 sobre fuentes públicas: `licitta.co`, su sitemap y su
manual completo (~60 artículos que documentan el producto por dentro), más su
política de privacidad y sus términos.

**Licitta es de Grupo Famaro S.A.S.**, NIT 901.957.891-1, Bogotá. Es el competidor
más cercano a lo que queremos construir, y publicó su diseño entero.

Esto es un estudio de diseño, no de código: lo que sigue sale de lo que ellos
documentan en público, no de su implementación. Lo valioso está acá de todas formas,
porque el producto es el razonamiento, no el JavaScript.

---

## 1. Qué hace, confirmado

Baja de SECOP II todos los documentos de un proceso (pliego, estudios previos,
anexos, adendas; PDF, Word, Excel, ZIP) y los cruza contra el perfil de la empresa.
El resultado es **requisito por requisito**, con la página del pliego de donde sale
cada exigencia.

Precios: **$120.000 / $290.000 / $590.000 COP + IVA al mes**. Siete días de prueba
sin tarjeta. El cupo se mide en análisis por mes; corregir el perfil **recalcula
todos los análisis sin gastar cupo**.

---

## 2. Lo que hay que copiar tal cual

### 2.1 La IA lee; las reglas deciden

El resultado sale de **reglas fijas**, no de un criterio del modelo: *"los mismos
datos dan siempre el mismo resultado"*. La IA extrae del PDF; la decisión es
determinista.

Es el mismo principio que ya usamos en los informes técnicos. Acá queda confirmado
por alguien que lo lleva en producción. **No negociable en nuestro motor.**

### 2.2 Dos resultados, sin punto medio, y un tercer estado explícito para el dato que falta

- **Cumple** — pasa todos los habilitantes.
- **No cumple** — al menos uno no se cumple **o no se pudo verificar**.
- Por fila: **No cumple · falta el dato**.

Lo importante es lo que *no* hicieron: no hay "en revisión". Un dato que falta no
suaviza el resultado, lo endurece. *"Licitta pide el dato antes que dar un Cumple
que no puede sostener."*

Esto calza exactamente con nuestras reglas de confiabilidad (CONFIRMADA /
INFORMADA / INFERIDA / PENDIENTE): **PENDIENTE nunca cuenta como cumplido.**

### 2.3 Nunca "no se encontró, así que no aplica"

La regla más importante de todas, y la más fácil de violar sin darse cuenta.

Un requisito sale como *no exigido* **solo con una razón**: el pliego lo dice (con
su página) o, en mínima cuantía, la invitación no lo menciona. Y entonces no es una
fila con resultado: va a una línea aparte del resumen, **"No exigidos en el pliego"**
/ **"No mencionados en la invitación"**, *para no parecer un requisito cumplido*.

Si no hay con qué verificar, es `No cumple · falta el dato`. Jamás silencio.

### 2.4 Tolerancia en el borde

Si lo acreditado y lo exigido difieren en menos de **0,001**, cuenta como Cumple:
*"el borde exacto nunca descarta"*. Un error de redondeo no puede costar una
licitación.

### 2.5 Cada fila se abre en cuatro partes

1. **El porqué**, en una línea.
2. **La cuenta**, si la hay (cuánto falta).
3. **El botón** con la mejor acción y su fecha límite.
4. **La fuente**: la página del pliego con el pasaje resaltado. Si no se puede
   resaltar: *"Lo citado está en la página N"*.

La trazabilidad a la página es lo que hace el análisis defendible ante la entidad.
Sin eso es una opinión.

### 2.6 La relevancia es un cálculo fijo, sin IA

Cinco criterios, cada uno se cumple o no: **actividad** (clase UNSPSC, primeros 6
dígitos), **modalidad**, **tipo de contrato**, **presupuesto** (rango), **ubicación**
(departamento).

- Relevante = cumple **4 o 5, con la actividad siempre entre ellos**. Uno de otro
  sector nunca es relevante.
- **Lo que no se marca cuenta como cumplido** (sin departamentos marcados, sirve
  cualquiera). Buen default: el filtro vacío no esconde nada.
- Se muestra como anillo con un tramo por criterio y "4/5" adentro.
- En el Plan Anual de Adquisiciones son cuatro criterios (el plan no publica tipo de
  contrato).

### 2.7 Los indicadores INDETERMINADO

Del RUP, según los Documentos Tipo de Colombia Compra:

- **Cobertura de intereses INDETERMINADO** o gastos de intereses en cero → **cumple**
  (no pagó intereses, la división no se puede hacer), *salvo que la utilidad
  operacional sea negativa*. Si el certificado no trae la utilidad operacional → no
  se pudo verificar.
- **Liquidez INDETERMINADO** (pasivo corriente cero) → **cumple**. Si hay cifra,
  manda la cifra.

Esto es conocimiento de dominio que cuesta descubrir. Lo tomamos.

### 2.8 Los vencimientos como cifra de portada

En su tablero: **Documentos por vencer**, con los tres más cercanos y sus días.
En el perfil: **días al próximo vencimiento** en la cabecera, y los documentos
pendientes **ordenados por cuántos análisis los piden** — no alfabéticos, no por
fecha: por cuánto duele que falten.

Ese ordenamiento es la buena idea. Ya tenemos el módulo de vencimientos; falta ese
criterio de orden.

### 2.9 El límite declarado

*"Licitta no recomienda presentarse o no. Dice qué se cumple y qué falta."*
Y los tres límites, escritos: no consulta SIRI (Procuraduría), Boletín de
Responsables Fiscales (Contraloría), antecedentes de Policía ni deudores
alimentarios — *"se consultan antes de presentar la oferta"*; no es asesoría legal;
no garantiza ganar.

Es la misma frontera que ya fijó el Contexto Maestro: la decisión y la firma son
humanas. Hay que escribirla en la pantalla, no solo en el documento interno.

---

## 3. Los once temas del análisis = el modelo de datos del motor

Esta es la lista más útil de todo el estudio. Son las secciones en que descomponen
un pliego:

| # | Tema | Decide Cumple/No cumple |
|---|------|--------------------------|
| 1 | Jurídico | **Sí** |
| 2 | Capacidad financiera | **Sí** |
| 3 | Experiencia | **Sí** |
| 4 | Capacidad residual (K) — solo obra | **Sí** |
| 5 | Puntaje | No |
| 6 | Documentos exigidos | No |
| 7 | Garantías | No |
| 8 | Contrato | No |
| 9 | Requisitos técnicos | No |
| 10 | Cronograma | No |
| 11 | Causales de rechazo | No |

Y las filas de cada habilitante:

- **Jurídico:** convocatoria limitada a Mipymes (si aplica) · RUP (o Existencia y
  representación legal donde no se exige RUP; para persona natural, Existencia y
  capacidad) · duración de la sociedad · multas y sanciones (inhabilidades) · y al
  final **objeto social**, comparando el del certificado contra el del proceso, con
  las palabras en común resaltadas — *no cambia el resultado*.
- **Capacidad financiera:** liquidez, endeudamiento, cobertura de intereses, capital
  de trabajo, patrimonio. Organizacionales: rentabilidad del patrimonio (ROE) y del
  activo (ROA).
- **Experiencia:** valor acumulado, número de contratos, magnitud ejecutada,
  antigüedad. Contrato por contrato y, si el pliego la pide por tramos, tramo por
  tramo. **Por fase se cumplen todas; por lotes basta uno**, y la razón dice en
  cuáles.
- **Capacidad residual:** la del proponente ≥ la del proceso.

Detalles de los temas que no deciden pero que valen oro:

- **Garantías:** la de seriedad trae los **datos listos para la aseguradora**
  (tomador, asegurado y beneficiario con NIT, valor, vigencia, proceso, objeto) con
  botón **Copiar**. Esto le ahorra una llamada a la aseguradora por cada oferta.
- **Requisitos técnicos:** por etapa (habilitantes / antes del cierre / después de
  adjudicar). Personal y maquinaria del pliego al lado de lo que tiene la empresa,
  con estado **En el perfil · Experiencia menor · Por confirmar · No está en el
  perfil**, y botón **Agregar al perfil** con los campos ya llenos con lo que pide el
  pliego. No cambia el resultado: el personal se ofrece con la oferta.
- **Causales de rechazo:** en el mismo orden del pliego, cada una con su página. Las
  que el pliego marca como no aplicables van al final en *"No aplican en este
  proceso · Lo dice el pliego"*.

### Las cinco observaciones al pliego (esto es el diferencial fino)

No cambian el resultado; van en su propio tema, con fecha límite para radicar:

1. **Se aparta del Documento Tipo** — una causal fuera de las taxativas, o un
   indicador más exigente que la matriz oficial de Colombia Compra.
2. **Se aparta de la norma** — exigencia que la ley no permite.
3. **Cláusula contra la norma** — con borrador listo para radicar.
4. **Los documentos del proceso se contradicen** — dos cifras distintas de
   presupuesto oficial, con las dos cifras y la observación redactada. *Pide aclarar
   cuál rige, no cambiarla.*
5. **Causal sin sus ítems** — la causal del techo por ítem anuncia ítems y no los
   nombra; solo vale para los que la entidad nombre (concepto C-1665 de 2025 de
   Colombia Compra).

Detectar que un pliego se aparta del Documento Tipo es trabajo de abogado. Que el
sistema lo haga y además redacte la observación es la parte más defendible de su
producto.

---

## 4. Cómo ingieren, y los números que nos sirven

- **Cada hora** revisan SECOP II y bajan los procesos abiertos de las modalidades que
  cubren.
- **Latencia real de los datos abiertos:** la entidad publica el mismo día, pero
  Colombia Compra tarda **1 a 3 días** en pasarlo a Datos Abiertos. **6 de cada 10
  llegan al día siguiente; 94 de 100 antes de tres días.**
- **La mitad de los procesos abiertos tiene más de 11 días entre publicación y
  cierre.** Solo **4 de cada 100** cierran en 3 días o menos — y para esos
  recomiendan mirar el portal directamente.
- **Desde septiembre de 2026 la mayoría de los procesos nuevos llegan sin código de
  categoría UNSPSC.** Lo leen del pliego (incluso escaneado) y, si no está, lo
  deducen de procesos anteriores con el nombre más parecido.
- La clase **801116** (servicios de personal temporal) la excluyen como actividad
  para todos.

Las dos últimas son minas que vamos a pisar igual. Que el UNSPSC venga vacío rompe
cualquier filtro por actividad, y es el criterio obligatorio de la relevancia.

**Conclusión de diseño:** el cron por hora sobre Datos Abiertos está bien para el
94% de los casos, pero no cubre los procesos de cierre rápido. Nuestro radar debe
decir de dónde salió cada proceso y cuántos días llevaba publicado, para que nadie
confíe en que la lista está completa.

### Analizar sin esperar a Datos Abiertos

Tienen una entrada manual: soltar el ZIP que descarga SECOP II o archivos sueltos
(PDF, Word, Excel, ZIP, RAR), hasta 15 archivos y 100 MB.

- **La revisión previa es gratis**: muestra entidad, objeto, número y presupuesto
  encontrados, y la lista de lo que el análisis necesita, marcado está / falta.
- El análisis necesita: **pliego** (o invitación pública en mínima cuantía),
  **estudios previos**, **anexo técnico**, **matriz de riesgos**. Sin al menos un
  documento de reglas el botón no se enciende, y la lista dice por qué.
- Cuando SECOP lo publica después, **lo unen solos** por número de proceso + NIT de
  entidad o presupuesto, leen lo que falta sin cobrar cupo, y avisan si cambió algún
  requisito. A los 90 días dejan de buscarlo.
- Advierten qué **no** sirve subir solo: el aviso de convocatoria (no trae los
  habilitantes), y un documento de otro proceso (se lee como si fuera de este).

El cobro-cero por releer y el empate automático con el proceso oficial son dos
decisiones de producto muy buenas. La segunda es la que evita el duplicado.

---

## 5. Las siete pestañas del perfil de empresa

Resumen · Capacidad jurídica · Capacidad financiera · Experiencia · Personal y
equipos · Puntaje · Documentos.

Cada tabla trae **Fuente, Estado, Modificado** (con la foto de quien hizo el último
cambio) — en Documentos, **Expedición** y **Vigencia** reemplazan a Fuente. Cada
pestaña lleva su cuenta de pendientes.

En **Puntaje**: Mipyme, empresa de mujeres, trabajadores con discapacidad e industria
nacional, **con la fecha desde la que se cumple cada uno**.

Dos decisiones suyas que son deliberadas:

- **El personal va por cargo, nunca con el nombre de quien lo ocupa**
  ("Director de obra", "Residente de obra"). Es correcto para un SaaS multiempresa:
  menos dato personal, menos responsabilidad bajo Ley 1581.
- **La columna Fuente en cada dato.** Del RUP, del RUES, de SECOP II, del documento
  cargado, o escrito a mano — y lo escrito cuenta igual **salvo donde la ley exige el
  RUP**. Saber de dónde salió cada número es lo que permite defenderlo.

---

## 6. Lo que NO hacen: nuestro espacio

### 6.1 Régimen especial: matizado, no es lo que dije primero

Corrección a lo que te conté en el primer mensaje. El régimen especial y la
contratación directa **sí aparecen en sus listas, se guardan y dan avisos**. Lo que
no hacen es analizar el pliego:

- Contratación directa: *"la entidad no publica los requisitos: no hay un pliego que
  analizar"* — razón técnica, correcta, nos pasa igual.
- Régimen especial: *"**todavía** no se analizan"* — ese "todavía" es una promesa de
  roadmap, no un límite de diseño.

Así que no es que te perderías esos procesos: los verías y te avisarían. Lo que no
tendrías es el cruce contra tu empresa. Que sigue siendo exactamente donde estaban
8 de las 15 oportunidades de tu radar, así que el hueco es real — pero es "no hay
análisis", no "no existen". Y lo pueden tapar en cualquier momento.

### 6.2 El expediente vivo — esto no lo puede vender nadie

Licitta te pide que escribas tu perfil: los cargos a mano, los equipos a mano, los
contratos uno por uno, los documentos subidos como PDF.

El ERP **ya tiene los datos, vivos y con firma**:

- **Personal:** no cargos escritos a mano, sino las personas reales con sus
  certificados, sus vigencias y su hoja de vida — el módulo de SG-SST ya lleva el
  vencimiento de cada curso de alturas, cada examen médico, cada inducción firmada.
- **Experiencia:** no contratos tecleados, sino los proyectos ejecutados con su acta
  de inicio y su acta de cierre **firmadas electrónicamente**, su contrato, su valor
  y su cliente.
- **Financiero:** el espejo de Siigo, no un PDF de estados financieros.
- **Equipos:** el inventario.

Donde Licitta cobra por un formulario que llenas a mano, nosotros generamos el
expediente desde la operación. Esa es la ventaja estructural, y no se puede comprar.

### 6.3 El armado de la oferta

Nadie en el mercado colombiano hace la fase 5 de lo que describiste: crear la carpeta
en Drive, organizar los documentos, llenar los anexos con los datos de la empresa y
dejar todo listo para que una persona revise y suba al SECOP a mano.

Licitta llega hasta "esto te falta". De ahí en adelante es nuestro.

---

## 7. Lo que sigue

Orden propuesto, de lo que da valor más rápido a lo que cuesta más:

1. **Radar diario** — cron sobre Datos Abiertos (`p6dx-8zbt`), los cinco criterios de
   relevancia como cálculo fijo, marcando **cuáles no exigen RUP** y de dónde salió
   cada proceso con cuántos días lleva publicado. Esto ya estaba empezado.
2. **Expediente de Servielectro** — generado desde los módulos que ya existen
   (personal + SG-SST + proyectos + Siigo), no escrito a mano. Con la columna Fuente
   y el orden de pendientes por cuántos análisis los piden. La lista de habilitantes
   de la carpeta POLICIA sirve de plantilla: es un proceso real que ya ganamos.
3. **Lector de pliegos** — los once temas, con cita de página obligatoria. IA para
   extraer, reglas para decidir. `No cumple · falta el dato` antes que un Cumple sin
   respaldo.
4. **Cruce + carpeta + anexos** — la parte que nadie vende.

Lo que vale la pena pagar aparte: **los siete días de prueba de Licitta**, subiéndole
el pliego de la Policía que ya ejecutamos. Ver su salida con un proceso que
conocemos de memoria vale más que seguir leyendo su manual.

---

*Fuentes: licitta.co (manual público, sitemap, precios, términos y privacidad),
consultadas el 2026-11-06. Licitta es un producto de Grupo Famaro S.A.S.*

# Módulo SG-SST (Sistema de Gestión de Seguridad y Salud en el Trabajo)

Pedido por Jhojan el 26/10/2026. Referencias que él dio para orientarse: **DataScope**,
**Sabentis**, **Novasoft**.

## Dos usuarios distintos, y es lo que define el módulo

**1. Responsable de la gestión (oficina).** Arma el sistema: documentos de la empresa,
plantillas, cursos, comités, responsables, EPP, y el plan de trabajo para llegar al 100 % del
registro documental.

**2. Responsable SST en obra (campo).** Usa las plantillas en sitio: llena el ATS, el permiso de
trabajo, la inspección de escaleras; las hace firmar; se guardan con las firmas y salen en PDF.

No es un módulo con dos pantallas: son **dos oficios**. El de oficina construye, el de obra
ejecuta. Los permisos tienen que separarlos.

---

## Lo que pidió el Responsable de la gestión

1. **Subir documentos de la empresa**, con respaldo en la nube de todo lo que entre por el ERP.
2. **Firma digital desde los dispositivos**, registrada en la base.
3. **Subir cursos y/o videos** para capacitación virtual de los técnicos.
4. **Videos explicativos + evaluación + registro del curso** (quién lo tomó, cuándo, con qué nota).
5. **Asignación de responsables de comités** internos y externos.
6. **Asignación de responsables de obra (SST de obra).**
7. **Módulo de documentos: las plantillas que se llenan en sitio** — ATS, permisos de trabajo,
   alturas y trabajos de alto riesgo, inspección de escaleras, inspección de herramientas,
   trabajo en caliente y demás. Con un **plan de trabajo para completar el 100 % del registro
   documental** y cumplir los parámetros mínimos de la norma.
8. **Asignación de EPP a los técnicos**, y que ellos registren con fotos que los están usando en
   sitio.

## Lo que pidió el SST en sitio

- Ver las plantillas del punto 7 y **trabajarlas en línea**.
- Registrar con ellas los trabajos de obra.
- **Firmas:** el personal técnico de Servielectro (cuando se requiera), el Responsable SST de
  Servielectro y el **SST del cliente**.
- Se guarda en línea con las firmas, **se convierte en PDF** y se envía por correo cuando esté
  revisado y aprobado.

---

## Decisiones de diseño

### 1. Las plantillas se arman, no se programan 🔴 lo más importante

Son siete tipos de documento hoy y van a ser doce mañana. Si cada uno se escribe en el código,
cada cambio de la norma o cada capricho del cliente es una migración y una espera.

**Hay que hacer un armador de plantillas**: el responsable SST define los campos (texto, número,
sí/no, lista, fecha, **foto**, **firma**, ubicación, tabla de filas) y el formulario sale solo en
el celular del técnico. Es exactamente el modelo de DataScope, que es la referencia que dio
Jhojan, y es lo que ya hicimos en Parámetros de liquidación a menor escala.

Consecuencia: **no se transcriben los siete formatos a mano.** Se construye el armador y Jhojan
(o su responsable SST) arma el ATS tal como lo usa hoy.

### 2. Reutilizar lo que ya existe, no construir en paralelo

- **El lienzo de firma** de las visitas: el mismo, con el mismo candado de evidencia.
- **El funcionamiento sin señal** del módulo Técnico (base local + cola de subida). Un ATS se
  llena en una obra sin señal: si el módulo exige internet, no sirve.
- **La dotación de EPP** ya existe (`dotacion_entregas`, categoría `epp`, con talla, fecha y
  foto). El punto 8 es **agregarle al técnico el registro de uso en sitio**, no una tabla nueva.
- **Los documentos con destinatario** (`documentos_personal`): ya resuelven "subo un documento
  para una persona, lo ve y lo firma". Las certificaciones de curso van por ahí.

### 3. Firma manuscrita digitalizada ≠ firma digital ⚠️

Lo que tenemos y lo que usan DataScope y compañía es una **firma manuscrita digitalizada**: el
trazo, con quién, cuándo, desde qué dispositivo y con el documento sellado para que no se pueda
cambiar después. **No es una firma digital con certificado** (Ley 527 de 1999), que exige una
entidad de certificación.

Para ATS y permisos de trabajo la firma manuscrita digitalizada es lo que se usa en la práctica
y es defendible si el registro es íntegro. Pero **estos documentos son prueba en una
investigación de accidente**, así que conviene que Jhojan lo sepa y, si su abogado o la ARL lo
exigen, se evalúe certificado digital para los documentos críticos. No prometer "firma digital"
sin esa distinción.

### 4. El plan de trabajo tiene que colgar de la norma real, no de una lista inventada

El "100 % del registro documental" en Colombia se mide contra los **estándares mínimos** de la
Resolución 0312 de 2019 (y el Decreto 1072 de 2015), y el número de estándares depende del
tamaño de la empresa y de la clase de riesgo.

**No se inventa la lista.** Igual que con las cláusulas del contrato: se construye la estructura
—estándar, responsable, fecha límite, evidencia que lo soporta, porcentaje de avance— y
**Jhojan o su responsable SST cargan los estándares que les aplican**. Pedírselos.

### 5. Retención: esto no se borra

Los registros de SST tienen tiempos de conservación largos por norma (algunos, décadas, por
tratarse de exposición laboral). Diseñar desde ya como **archivo que no se borra**: anulación
con motivo, nunca `delete`. Es el patrón que ya usamos en liquidaciones y caja menor.

### 6. Respaldo

Jhojan pidió que "la nube respalde todo lo que se suba por el ERP". Supabase hace copias de la
base; **lo que hay que confirmar es la política de respaldo del almacenamiento de archivos y por
cuánto tiempo**, porque aquí el archivo *es* la evidencia. Verificarlo antes de prometerlo.

### 7. Capacitaciones: empezar por lo simple

Puntos 3 y 4 son, juntos, una plataforma de cursos. Primera vuelta corta: **video + evaluación
de opción múltiple + nota mínima + constancia con fecha**, y que quede quién lo tomó y cuándo.
Sin rutas de aprendizaje, sin gamificación, sin SCORM.

---

## Orden sugerido

1. **Armador de plantillas + llenado en sitio con fotos y firmas + PDF.** Es el corazón y lo que
   el SST de obra necesita mañana.
2. **Documentos de la empresa y plan de trabajo contra los estándares mínimos.**
3. **EPP: registro de uso con foto**, sobre la dotación que ya existe.
4. **Comités y responsables** (es poco código y ordena responsabilidades).
5. **Capacitaciones con evaluación.**

---

## Referencias

- **DataScope** — el modelo a seguir para las plantillas: armador de formularios con foto,
  firma, geolocalización y código de barras; **funciona sin conexión** y sincroniza después; el
  supervisor ve lo recogido en tiempo real; indicadores de cumplimiento.
  https://www.mydatascope.com/
- **Sabentis** — software español de prevención de riesgos laborales, enfocado en el sistema de
  gestión completo.
- **Novasoft** — ERP colombiano con módulo de SST; sirve de referencia para lo que exige la
  norma local.

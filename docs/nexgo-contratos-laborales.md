# NEXGO — "Contratos laborales"

Del video del 22/10/2026 (5 min 46 s). Es la pestaña **Contrato** que faltaba de la ficha de
personal, y resulta ser un módulo entero.

Está en `Recursos Humanos → Contratos laborales`.

> Contratos de **empleados y colaboradores** (término fijo, indefinido y obra labor). Cree el
> documento aquí y asócielo al colaborador. Use **Renovar** u **Otro sí** si el contrato ya
> existe. Los contratos con clientes o proveedores están en **Ventas → Contratos**.

## Generar contrato

- **Plantilla por defecto** — *"Solo valores base · no es el contrato"*
- Botón **+ Crear nuevo…** — *"Use «Crear nuevo…» para cambiar el flujo"*
- **Tipo de documento**: `Laboral · Término fijo` · `Laboral · Indefinido` · `Laboral · Obra o
  labor` · `Contrato de prestación de servicios`
- **Origen**: `Empleado (nómina)` u otros
- **Empleado** (selector) / **Trabajador** (razón social)
- **Tipo documento**, **Documento**, **Salario (COP)**
- **Ciudad de firma**, **Fecha del contrato**, **Objeto del contrato**

### La frase que más importa de todo el video

> Al elegir una **cotización aprobada** se cargan **cláusulas comerciales, pólizas, forma de pago
> (50-50, 60-40, 50-30-20 u otra) y plazo de ejecución según lo cotizado**. En 50-30-20 el 30 %
> se libera con **acta de entrega parcial** (equipos, materiales e infraestructura) y el 20 % con
> **montaje, configuración y puesta en marcha**. Revise y ajuste antes de guardar.

Eso es el **contrato que se arma solo desde la cotización** que estaba pensado hace rato en
[[erp-modulo-ejecucion]]. Las formas de pago y los hitos de liberación son los de Servielectro.

## Cláusulas por defecto

Cada tipo de contrato trae su juego de cláusulas, en una tabla **Título / Texto** con botones
**Editar** y **Eliminar** por fila, y **+ Agregar cláusula**.

**Laboral (fijo, indefinido, obra o labor):**
`TIPO Y DURACIÓN` · `PERIODO DE PRUEBA` · `NATURALEZA DEL VÍNCULO` · `CARGO Y FUNCIONES` ·
`LUGAR DE TRABAJO` · `JORNADA Y HORARIO` · `SALARIO Y FORMA DE PAGO` · `AUXILIO DE TRANSPORTE` ·
`PRESTACIONES SOCIALES` · `SEGURIDAD SOCIAL` · `OBLIGACIONES DEL TRABAJADOR` ·
`OBLIGACIONES DEL EMPLEADOR` · `POLÍTICAS, NORMAS Y SG-SST`

**Prestación de servicios:**
`OBJETO` · `OBLIGACIONES DEL CONTRATISTA` · `DURACIÓN` · `PROPUESTA Y ANEXO TÉCNICO` ·
`VALOR Y FORMA DE PAGO` · `PAGOS DURANTE LA EJECUCIÓN Y ENTREGA PARCIAL` ·
`PROPIEDAD INTELECTUAL` · `DATOS PERSONALES` · `TERMINACIÓN` · `INEXISTENCIA DE RELACIÓN
LABORAL` · `PERSONAL, SST Y SEGURIDAD SOCIAL` · `GASTOS` · `GARANTÍAS Y PÓLIZAS` ·
`MÉRITO EJECUTIVO` · `DOMICILIO CONTRACTUAL`

## Pólizas por defecto

Tabla con: **Activo** (casilla) · **Póliza** · **%** · **Durante** (años / meses extra) ·
**Complemento**.

Filas vistas: `Cumplimiento` · `Buen manejo del anticipo` · `Calidad de materiales y equipos` ·
`Responsabilidad civil extracontractual` · `Estabilidad de la obra` · `Prestaciones sociales`.

Coincide con las cinco pólizas que ya teníamos registradas de Jhojan. **Recordar su regla:** en
la **cotización** las pólizas van sin porcentaje ni vigencia; los porcentajes aparecen solo en el
**contrato**. Esta pantalla es la del contrato, así que acá sí llevan número.

## Cronograma de ejecución por defecto

Tabla con **Actividad** · **Día inicio / fecha** · **Duración (hábiles)** · **Día fin** ·
**Responsable**. Filas vistas: `Acta de inicio / movilización`, `Levantamiento y planeación`,
`Ejecución / suministro e instalación`.

## Advertencia sobre el texto de las cláusulas

**El texto legal de estas plantillas no se copia a ciegas.** El contrato laboral de Servielectro
ya se revisó una vez y tenía problemas serios —pacto de no competencia posterior, descuentos de
salario, una cláusula que llamaba "Contratista" a un trabajador— y quedó en manos de su abogado.

Lo que replicamos es **la estructura**: tipos de contrato, cláusulas editables, pólizas,
cronograma y el armado desde la cotización. **El texto lo pone el abogado de Jhojan**, no NEXGO
y no nosotros.

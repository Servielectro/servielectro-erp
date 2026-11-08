// Las 11 etapas del Plan Maestro de Jhojan (hoja 00_Proceso_Estandar) contra licitaciones.estado
// (migración 147). Los nombres son los suyos: no se inventan otros.

export const ETAPAS: { numero: number; estado: string[]; nombre: string }[] = [
  { numero: 1, estado: ["planeada"], nombre: "Planeada" },
  { numero: 2, estado: ["detectada"], nombre: "Detectada" },
  { numero: 3, estado: ["prefiltrada"], nombre: "Prefiltrada" },
  { numero: 4, estado: ["comite_go_nogo"], nombre: "Comité GO/NO-GO" },
  { numero: 5, estado: ["en_preparacion"], nombre: "En preparación" },
  { numero: 6, estado: ["en_analisis"], nombre: "En análisis" },
  { numero: 7, estado: ["preparacion_oferta"], nombre: "Preparación de oferta" },
  { numero: 8, estado: ["lista_revision"], nombre: "Lista para revisión" },
  { numero: 9, estado: ["presentada"], nombre: "Presentada" },
  { numero: 10, estado: ["en_evaluacion"], nombre: "En evaluación" },
  { numero: 11, estado: ["adjudicada", "no_adjudicada"], nombre: "Adjudicada / No adjudicada" },
];

/** Estados que ya existían en la base de Jhojan fuera de las 11 etapas. */
const OTROS: Record<string, string> = {
  descartada: "Descartada (NO-GO)",
  pendiente_info: "Pendiente de información",
  aprobada_participar: "Aprobada para participar",
  cancelada: "Cancelada",
  cerrada: "Cerrada",
  adjudicada: "Adjudicada",
  no_adjudicada: "No adjudicada",
};

export function nombreEstado(estado: string | null | undefined): string {
  if (!estado) return "Sin estado";
  if (OTROS[estado]) return OTROS[estado];
  return ETAPAS.find((e) => e.estado.includes(estado))?.nombre ?? estado;
}

export function numeroEtapa(estado: string | null | undefined): number | null {
  return ETAPAS.find((e) => e.estado.includes(estado ?? ""))?.numero ?? null;
}

/** Antes de la puerta (etapas 1-4): aquí se decide GO/NO-GO. */
export const ANTES_DE_LA_PUERTA = ["planeada", "detectada", "prefiltrada", "comite_go_nogo"];

/** Tipos de documento (licitacion_documentos.tipo, migraciones 143 y 147). */
export const TIPOS_DOCUMENTO: Record<string, string> = {
  pliego: "Pliego",
  invitacion: "Invitación",
  estudios_previos: "Estudios previos",
  anexo_tecnico: "Anexo / ficha técnica",
  matriz_riesgos: "Matriz de riesgos",
  adenda: "Adenda / modificación",
  aviso_convocatoria: "Aviso de convocatoria",
  formulario: "Formulario / formato",
  ejecucion: "Del contrato (ya contratado)",
  otro: "Otro",
};

const norm = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const BORRADOR_CONTRATO = / (minuta|modelo|proyecto|borrador|formato) (del? )?contrato /;

/**
 * ¿Este archivo prueba que el proceso ya se contrató? Solo señales fuertes: número de contrato en
 * SECOP, acta de inicio, aceptación de la oferta, orden de compra o contrato identificado. La
 * designación de supervisor sola NO alcanza. Misma regla de scripts/licitaciones/medir-ya-contratados.mjs,
 * con la que se midió (2026-11-08): 0 de 19 en las modalidades que no son régimen especial.
 */
export function pruebaContratacion(nombre: string, numeroContrato: string | null): boolean {
  const n = ` ${norm(nombre)} `;
  if (BORRADOR_CONTRATO.test(n)) return false;
  if ((numeroContrato ?? "").trim()) return true;
  if (/ (acta de inicio|acta inicio|aceptacion de (la )?oferta|carta de aceptacion|orden de compra|oc|pccntr) /.test(n)) return true;
  return / contrato /.test(n) && /( firmado | de compra | no | \d)/.test(n);
}

/** Lo que el portal deja subir (lo vuelve a exigir la política del bucket, migración 148). */
export const EXTENSIONES_PERMITIDAS = [
  "pdf", "doc", "docx", "xls", "xlsx", "xlsm", "csv", "txt", "rtf", "odt", "ods",
  "ppt", "pptx", "zip", "rar", "7z", "dwg", "jpg", "jpeg", "png", "tif", "tiff",
];

/** Para reconocer un archivo bajado de SECOP: sin extensión, sin el « (1)» del navegador, sin signos. */
export const nombreComparable = (nombre: string) => norm(nombre.replace(/\.[^.]*$/, "").replace(/\s*\(\d+\)\s*$/, ""));

/**
 * SECOP (dmgg-8hin) no dice qué es cada archivo: se deduce del NOMBRE. Es una suposición y la
 * pantalla lo dice («deducido del nombre»); una persona lo corrige. El orden importa: lo del
 * contrato primero (un «CONTRATO #19» no es un pliego).
 */
export function tipoPorNombre(nombre: string): string {
  const n = ` ${norm(nombre)} `;
  // Minuta, modelo o borrador de contrato son precontractuales; el acta de cierre es el cierre de
  // recepción de ofertas, anterior a adjudicar: ninguno prueba que ya se contrató.
  if (!BORRADOR_CONTRATO.test(n) && / (contrato|acta de inicio|acta inicio|aceptacion de (la )?oferta|carta de aceptacion|designacion (de )?supervisor|asignacion (de )?supervisor|orden de compra|oc|pccntr|acta de liquidacion) /.test(n)) return "ejecucion";
  if (/ (adenda|modificatorio|modificacion) /.test(n)) return "adenda";
  // «Respuesta a observaciones al proyecto de pliego» habla del pliego pero no lo es.
  if (/ respuestas? (a )?(las )?observaciones /.test(n)) return "otro";
  if (/ (pliego|prepliego|proyecto de condiciones|pliego de condiciones) /.test(n)) return "pliego";
  if (/ invitacion /.test(n)) return "invitacion";
  if (/ (estudios? previos?|estudio previo) /.test(n)) return "estudios_previos";
  if (/ (matriz de riesgos?|estimacion del riesgo|riesgos) /.test(n)) return "matriz_riesgos";
  // Antes que el anexo: «FORMULARIO CONOCIMIENTO DE LAS ESPECIFICACIONES TÉCNICAS» es un formulario.
  if (/ (formularios?|formatos?) /.test(n)) return "formulario";
  if (/ (anexo tecnico|ficha tecnica|especificaciones tecnicas|anexo) /.test(n)) return "anexo_tecnico";
  if (/ aviso (de )?convocatoria /.test(n)) return "aviso_convocatoria";
  return "otro";
}

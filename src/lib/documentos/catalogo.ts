// Documentos de obra (migración 90, proyecto_documentos) y del cliente (migración 101,
// cliente_documentos), más el RUT (tabla documentos, su propio flujo). Aquí: los tipos con su
// nombre en pantalla, el MIME por extensión y la PROPUESTA de tipo para un archivo según la
// carpeta de OneDrive de donde sale. Es una propuesta: una persona la revisa antes de subir.

export const TIPOS_OBRA: { id: string; etiqueta: string }[] = [
  { id: "contrato_firmado", etiqueta: "Contrato firmado (el que volvió firmado)" },
  { id: "contrato_borrador", etiqueta: "Contrato enviado (el que mandó Servielectro)" },
  { id: "cotizacion", etiqueta: "Cotización" },
  { id: "poliza", etiqueta: "Póliza" },
  { id: "comprobante_pago_poliza", etiqueta: "Comprobante de pago de póliza" },
  { id: "acta_inicio", etiqueta: "Acta de inicio" },
  { id: "acta_corte", etiqueta: "Acta de corte" },
  { id: "acta_entrega", etiqueta: "Acta de entrega" },
  { id: "acta_liquidacion", etiqueta: "Acta de liquidación" },
  { id: "informe_tecnico", etiqueta: "Informe técnico" },
  { id: "cuenta_de_cobro", etiqueta: "Cuenta de cobro" },
  { id: "orden_compra", etiqueta: "Orden de compra" },
  { id: "cronograma", etiqueta: "Cronograma" },
  { id: "plano", etiqueta: "Plano" },
  { id: "registro_fotografico", etiqueta: "Registro fotográfico" },
  { id: "otro", etiqueta: "Otro" },
];

export const TIPOS_CLIENTE: { id: string; etiqueta: string }[] = [
  { id: "camara_comercio", etiqueta: "Cámara de comercio" },
  { id: "existencia_representacion", etiqueta: "Certificado de existencia y representación" },
  { id: "acta_consejo", etiqueta: "Acta del consejo" },
  { id: "acta_asamblea", etiqueta: "Acta de la asamblea" },
  { id: "reglamento_ph", etiqueta: "Reglamento de propiedad horizontal" },
  { id: "cedula_representante", etiqueta: "Cédula del representante" },
  { id: "certificado_bancario", etiqueta: "Certificado bancario" },
  { id: "otro", etiqueta: "Otro" },
];

export const NOMBRE_TIPO: Record<string, string> = {
  ...Object.fromEntries(TIPOS_OBRA.map((t) => [t.id, t.etiqueta])),
  ...Object.fromEntries(TIPOS_CLIENTE.map((t) => [t.id, t.etiqueta])),
  rut: "RUT",
};

export const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  txt: "text/plain",
};
/** Lo que acepta el bucket del RUT (migración 15): PDF y fotos. */
export const MIME_RUT = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
export const LIMITE_BYTES = 15 * 1024 * 1024;

export const extension = (nombre: string) => (nombre.toLowerCase().split(".").pop() ?? "");
/** Nombre seguro para Storage: sin tildes ni espacios. */
export const nombreLimpio = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");

export type Destino = "obra" | "cliente" | "rut";

export interface Propuesta {
  destino: Destino;
  tipo: string;
  reservado: boolean;
  /** Incluido de entrada en la subida. Lo que no se reconoce entra apagado. */
  incluir: boolean;
  /** Pide que una persona marque "revisado" antes de subir (los contratos, y lo que no se reconoce). */
  revisar: string | null;
  origen: "original" | "escaneado" | "fotos";
}

const sin = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Propone destino y tipo para un archivo de la carpeta del cliente en OneDrive
 * (…\CLIENTES 2026\<CLIENTE>\<n. SUBCARPETA>\archivo). `ruta` es la ruta relativa que da el
 * navegador al elegir la carpeta (webkitRelativePath); con archivos sueltos, solo el nombre.
 */
export function proponer(ruta: string): Propuesta {
  const partes = ruta.split("/");
  const archivo = sin(partes[partes.length - 1]);
  const carpeta = sin(partes.slice(0, -1).join("/"));
  const ext = extension(archivo);
  const foto = ["jpg", "jpeg", "png", "webp", "heic"].includes(ext);
  const p = (destino: Destino, tipo: string, extra: Partial<Propuesta> = {}): Propuesta => ({
    destino, tipo, reservado: false, incluir: true, revisar: null, origen: foto ? "fotos" : "original", ...extra,
  });

  // Información que entregó el cliente: va al cliente, no a la obra.
  if (/informacion recibida|documentos del cliente|cliente\b/.test(carpeta) || /\brut\b/.test(archivo)) {
    if (/\brut\b/.test(archivo)) return p("rut", "rut");
    if (/camara/.test(archivo)) return p("cliente", "camara_comercio");
    if (/existencia|representacion/.test(archivo)) return p("cliente", "existencia_representacion");
    if (/asamblea/.test(archivo)) return p("cliente", "acta_asamblea");
    if (/consejo/.test(archivo)) return p("cliente", "acta_consejo");
    if (/reglamento/.test(archivo)) return p("cliente", "reglamento_ph");
    if (/cedula|\bcc\b/.test(archivo)) return p("cliente", "cedula_representante");
    if (/bancari/.test(archivo)) return p("cliente", "certificado_bancario");
    return p("cliente", "otro", { revisar: "No reconocí qué documento es." });
  }

  // Oferta comercial: cotizaciones. El Excel trae el cuadro de costos: reservado.
  if (/oferta|cotizacion/.test(carpeta) || /^cse[\s-]/.test(archivo)) {
    const excel = ["xls", "xlsx", "xlsm"].includes(ext);
    return p("obra", "cotizacion", excel ? { reservado: true } : {});
  }

  // Contratos: el enviado y el firmado NO se adivinan sin que alguien mire. En Tintalá el cliente
  // editó el contrato en su PC y se firmó otro: confundirlos es justo el error que no se repite.
  if (/contrato/.test(archivo)) {
    const word = ["doc", "docx"].includes(ext);
    return p("obra", word ? "contrato_borrador" : "contrato_firmado", {
      origen: word ? "original" : "escaneado",
      revisar: word
        ? "¿Es el contrato que ENVIÓ Servielectro? Si es el que volvió firmado, cámbialo."
        : "¿Es el contrato que volvió FIRMADO? Si es el que se envió, cámbialo.",
    });
  }
  if (/comprobante|recibo de pago/.test(archivo)) return p("obra", "comprobante_pago_poliza");
  if (/poliza/.test(archivo)) return p("obra", "poliza");
  if (/cuenta de cobro|cuenta_de_cobro|cuenta cobro/.test(archivo)) return p("obra", "cuenta_de_cobro");
  if (/informe/.test(archivo)) return p("obra", "informe_tecnico");
  if (/acta/.test(archivo)) {
    if (/inicio/.test(archivo)) return p("obra", "acta_inicio");
    if (/entrega/.test(archivo)) return p("obra", "acta_entrega");
    if (/liquidacion/.test(archivo)) return p("obra", "acta_liquidacion");
    if (/corte|parcial/.test(archivo)) return p("obra", "acta_corte");
  }
  if (/cronograma/.test(archivo)) return p("obra", "cronograma");
  if (/orden de compra|\boc\b/.test(archivo)) return p("obra", "orden_compra");
  if (/plano/.test(archivo) || ["dwg", "dxf"].includes(ext)) return p("obra", "plano");
  if (foto && /registro fotografico|fotos/.test(carpeta)) return p("obra", "registro_fotografico");
  if (foto) {
    return p("obra", "registro_fotografico", {
      incluir: false,
      revisar: "Es una foto: ¿registro de obra, o una hoja de un documento (por ejemplo, del contrato)?",
    });
  }
  return p("obra", "otro", { incluir: false, revisar: "No reconocí qué documento es." });
}

/** El código de cotización u obra que trae el nombre ("CSE- 026-151 …" → "CSE-26-151"), o null. */
export function codigoEnNombre(nombre: string): string | null {
  const m = /cse[\s_-]*0?(\d{2})[\s_-]+(\d{3})/i.exec(nombre);
  return m ? `CSE-${m[1]}-${m[2]}` : null;
}

/** sha256 en hexadecimal, en el navegador. */
export async function sha256Archivo(archivo: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer());
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

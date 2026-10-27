// SG-SST: las plantillas se ARMAN, no se programan (docs/modulo-sgsst.md). Los campos son datos;
// la base los valida (fn_sst_campos_problema, migración 75) y esto dice lo mismo antes de guardar.

export type TipoCampo =
  | "seccion"
  | "texto"
  | "texto_largo"
  | "numero"
  | "si_no"
  | "lista"
  | "fecha"
  | "hora"
  | "foto"
  | "firma"
  | "ubicacion"
  | "tabla";

export type TipoColumna = "texto" | "numero" | "si_no" | "lista" | "fecha" | "hora";

export interface Columna {
  id: string;
  tipo: TipoColumna;
  etiqueta: string;
  opciones?: string[];
}

export interface Campo {
  id: string;
  tipo: TipoCampo;
  etiqueta: string;
  obligatorio?: boolean;
  ayuda?: string;
  opciones?: string[];
  multiple?: boolean;
  columnas?: Columna[];
}

export type RolFirma = "tecnico" | "responsable_sst" | "sst_cliente" | "otro";
export interface FirmaPedida {
  rol: RolFirma;
  etiqueta: string;
  obligatoria?: boolean;
}

export const TIPOS_CAMPO: { id: TipoCampo; nombre: string; ayuda: string }[] = [
  { id: "seccion", nombre: "Título de sección", ayuda: "Separa el formato en partes; no se responde." },
  { id: "texto", nombre: "Texto corto", ayuda: "Una línea." },
  { id: "texto_largo", nombre: "Texto largo", ayuda: "Varias líneas." },
  { id: "numero", nombre: "Número", ayuda: "" },
  { id: "si_no", nombre: "Sí / No", ayuda: "" },
  { id: "lista", nombre: "Lista de opciones", ayuda: "Una o varias, según se configure." },
  { id: "fecha", nombre: "Fecha", ayuda: "" },
  { id: "hora", nombre: "Hora", ayuda: "" },
  { id: "foto", nombre: "Foto", ayuda: "Con la cámara; puede ser más de una." },
  { id: "firma", nombre: "Firma dentro del formato", ayuda: "Una firma como dato (las firmas de cierre van aparte)." },
  { id: "ubicacion", nombre: "Ubicación (GPS)", ayuda: "Toma la ubicación del celular." },
  { id: "tabla", nombre: "Tabla de filas", ayuda: "Ej.: lista de EPP con columnas Elemento / Estado." },
];
export const NOMBRE_TIPO = Object.fromEntries(TIPOS_CAMPO.map((t) => [t.id, t.nombre])) as Record<TipoCampo, string>;
export const TIPOS_COLUMNA: TipoColumna[] = ["texto", "numero", "si_no", "lista", "fecha", "hora"];

export const ROLES_FIRMA: { id: RolFirma; nombre: string; lista: boolean }[] = [
  { id: "tecnico", nombre: "Técnicos de Servielectro (firman todos los de la obra)", lista: true },
  { id: "responsable_sst", nombre: "Responsable en sitio de Servielectro", lista: false },
  { id: "sst_cliente", nombre: "Responsable SST del cliente", lista: false },
  { id: "otro", nombre: "Otro", lista: false },
];
/** Los tres bloques que confirmó Jhojan (26/10). Se pueden renombrar o quitar al armar. */
export const FIRMAS_POR_DEFECTO: FirmaPedida[] = [
  { rol: "tecnico", etiqueta: "Técnicos que ejecutan el trabajo", obligatoria: true },
  { rol: "responsable_sst", etiqueta: "Responsable en sitio de Servielectro", obligatoria: true },
  { rol: "sst_cliente", etiqueta: "Responsable SST del cliente", obligatoria: true },
];
// ------------------------------------------------------------------ ámbito (migración 85)
// El mismo motor sirve a SG-SST y a las actas de Proyectos. En la base los roles de firma son los
// mismos; aquí cambian los nombres y a dónde lleva cada pantalla.
export type Ambito = "sgsst" | "proyectos";

export const AMBITO: Record<
  Ambito,
  { plantillas: string; documentos: string; campo: string; gestion: string; documento: string; documentos_nombre: string; roles: Record<RolFirma, string> }
> = {
  sgsst: {
    plantillas: "/sgsst/plantillas",
    documentos: "/sgsst/formatos",
    campo: "/sgsst/campo",
    gestion: "la gestión SST",
    documento: "formato",
    documentos_nombre: "Formatos",
    roles: { tecnico: "Técnico", responsable_sst: "Responsable en sitio", sst_cliente: "SST del cliente", otro: "Otro" },
  },
  proyectos: {
    plantillas: "/proyectos/actas/plantillas",
    documentos: "/proyectos/actas",
    campo: "/actas/campo",
    gestion: "el responsable de Proyectos",
    documento: "acta",
    documentos_nombre: "Actas",
    roles: { tecnico: "Técnico", responsable_sst: "Por Servielectro", sst_cliente: "Por el cliente", otro: "Otro" },
  },
};

/** Los bloques de firma que se ofrecen al armar, con su nombre en cada ámbito. */
export function rolesFirma(ambito: Ambito): { id: RolFirma; nombre: string; lista: boolean }[] {
  if (ambito === "sgsst") return ROLES_FIRMA;
  return [
    { id: "tecnico", nombre: "Técnicos de Servielectro (firman todos los de la obra)", lista: true },
    { id: "responsable_sst", nombre: "Representante de Servielectro", lista: false },
    { id: "sst_cliente", nombre: "Representante del cliente (con su empresa)", lista: false },
    { id: "otro", nombre: "Otro (interventoría, supervisor…)", lista: false },
  ];
}

/** Con qué firmas arranca una plantilla nueva. En Proyectos no se inventa el texto del acta: solo las firmas. */
export function firmasPorDefecto(ambito: Ambito): FirmaPedida[] {
  if (ambito === "sgsst") return FIRMAS_POR_DEFECTO;
  return [
    { rol: "responsable_sst", etiqueta: "Por Servielectro SAS", obligatoria: true },
    { rol: "sst_cliente", etiqueta: "Por el cliente", obligatoria: true },
  ];
}

export const ROL_LISTA: Record<RolFirma, boolean> = { tecnico: true, responsable_sst: false, sst_cliente: false, otro: false };

/** Migración 83: quién estuvo en la obra ese día. Firman todos; la base no deja cerrar sin eso. */
export interface TecnicoEnObra {
  nombre: string;
  documento: string;
}

/** La cédula como la compara la base (fn_sst_doc): sin puntos, espacios ni guiones. */
export function docComparable(d: string): string {
  return d.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** ¿La plantilla pide firma de técnico obligatoria? Entonces la lista va antes de la primera firma. */
export function pideTecnicos(pedidas: FirmaPedida[]): boolean {
  return pedidas.some((p) => p.rol === "tecnico" && p.obligatoria !== false);
}

export function tecnicosSinFirmar(lista: TecnicoEnObra[], hechas: { rol: string; documento: string }[]): TecnicoEnObra[] {
  return lista.filter((t) => !hechas.some((h) => h.rol === "tecnico" && docComparable(h.documento) === docComparable(t.documento)));
}

export interface Plantilla {
  id: string;
  codigo: string;
  nombre: string;
  version: number;
  descripcion: string | null;
  campos: Campo[];
  firmas: FirmaPedida[];
  estado: "borrador" | "publicada" | "archivada";
  plantilla_anterior_id: string | null;
  publicada_en: string | null;
  archivada_en: string | null;
  motivo_archivo: string | null;
  /** Migración 85: SG-SST o actas de Proyectos (el mismo motor). */
  ambito: Ambito;
}
export const COLUMNAS_PLANTILLA =
  "id, codigo, nombre, version, descripcion, campos, firmas, estado, plantilla_anterior_id, publicada_en, archivada_en, motivo_archivo, ambito";

/** "Trabajo a realizar" → "trabajo_a_realizar" (único dentro de la plantilla). */
export function idDesdeEtiqueta(etiqueta: string, usados: string[]): string {
  const base =
    etiqueta
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 34) || "campo";
  let id = base;
  for (let i = 2; usados.includes(id); i++) id = `${base}_${i}`;
  return id;
}

/** Lo mismo que fn_sst_campos_problema: null si sirve, o la frase del problema. */
export function problemaCampos(campos: Campo[], firmas: FirmaPedida[]): string | null {
  if (!campos.length) return "La plantilla no tiene campos.";
  const ids = new Set<string>();
  for (const c of campos) {
    if (!/^[a-z0-9_]{1,40}$/.test(c.id)) return `Un campo tiene un identificador inválido (${c.id || "vacío"}).`;
    if (ids.has(c.id)) return `El identificador "${c.id}" está repetido.`;
    ids.add(c.id);
    if (!c.etiqueta.trim()) return "Hay un campo sin nombre.";
    if (c.tipo === "lista" && !(c.opciones ?? []).filter((o) => o.trim()).length) return `La lista "${c.etiqueta}" no tiene opciones.`;
    if (c.tipo === "tabla") {
      if (!(c.columnas ?? []).length) return `La tabla "${c.etiqueta}" no tiene columnas.`;
      const idsc = new Set<string>();
      for (const col of c.columnas ?? []) {
        if (!/^[a-z0-9_]{1,40}$/.test(col.id) || idsc.has(col.id)) return `La tabla "${c.etiqueta}" tiene una columna repetida o inválida.`;
        idsc.add(col.id);
        if (!col.etiqueta.trim()) return `La tabla "${c.etiqueta}" tiene una columna sin nombre.`;
        if (col.tipo === "lista" && !(col.opciones ?? []).filter((o) => o.trim()).length) return `La columna "${col.etiqueta}" de "${c.etiqueta}" no tiene opciones.`;
      }
    }
  }
  for (const f of firmas) if (!f.etiqueta.trim()) return "Un bloque de firmas no tiene nombre.";
  return null;
}

/** Valores vacíos: lo que fn_sst_faltantes considera "sin responder". */
export function vacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
}

/** Campos obligatorios sin responder (las fotos y firmas cuentan por archivos). */
export function faltantes(campos: Campo[], respuestas: Record<string, unknown>, archivosPorCampo: Record<string, number>): string[] {
  return campos
    .filter((c) => c.obligatorio && c.tipo !== "seccion")
    .filter((c) => (c.tipo === "foto" || c.tipo === "firma" ? !(archivosPorCampo[c.id] > 0) : vacio(respuestas[c.id])))
    .map((c) => c.etiqueta);
}

/** Bloques obligatorios sin ninguna firma (para cerrar). */
export function firmasQueFaltan(pedidas: FirmaPedida[], hechas: { rol: string }[]): string[] {
  return pedidas.filter((p) => p.obligatoria !== false && !hechas.some((h) => h.rol === p.rol)).map((p) => p.etiqueta);
}

export const ESTADO_FORMATO: Record<string, string> = {
  borrador: "En llenado",
  firmado: "Firmado y sellado",
  aprobado: "Aprobado",
  anulado: "Anulado",
};

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

export type TipoColumna = "texto" | "texto_largo" | "numero" | "si_no" | "lista" | "fecha" | "hora";

export interface Columna {
  id: string;
  tipo: TipoColumna;
  etiqueta: string;
  opciones?: string[];
  /** Migración 112: una lista que en el papel son casillas (SI · NO · N/A): se marca una con X. */
  marcas?: boolean;
}

/** Migración 112: fila FIJA de una tabla (los 5 pasos del ATS, los EPP, los ítems de chequeo). */
export interface FilaFija {
  id: string;
  etiqueta: string;
}

/**
 * Migración 112: dato que se pide por persona en la lista de técnicos (las columnas del FOR-15).
 * `esperado` es la respuesta "buena" (en la autodeclaración de acrofobia es NO); si se marca la
 * otra, la pantalla avisa antes de firmar. `vigencia_de` dice de qué dato de Personal saldrá
 * después (se evalúa a la fecha de la firma, no a hoy); hoy se marca a mano.
 */
export interface ColumnaPersona {
  id: string;
  etiqueta: string;
  tipo: "si_no";
  esperado?: boolean;
  vigencia_de?: "aptitud_alturas" | "seguridad_social" | "epcc";
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
  /** Migración 112: tabla de filas fijas. La respuesta es { fila: { columna: valor } }. */
  filas?: FilaFija[];
  /** Migración 112: texto fijo del papel (en una sección), p. ej. la Res. 4272 de 2021, art. 15. */
  texto?: string;
  /** Migración 112: unidad que va al lado del número en el papel ("mts."). */
  unidad?: string;
  /** Migración 112: lista pintada como casillas (llega desde la columna de una tabla). */
  marcas?: boolean;
  /**
   * Migración 94: se prellena al crear el acta con este dato de la obra (fn_actas_prellenado:
   * "alcance" del contrato confirmado, "lugar_direccion" de la sede…). Lo que traía queda en
   * respuestas._prellenado y, si se cambia, el acta queda marcada como apartada.
   */
  prellenar?: string;
  /** Migraciones 94 y 96: lo calcula la base (y el celular con la misma regla); no se escribe a mano. */
  calculado?: "fecha_del_acta" | "inicio_dias_habiles" | "terminacion_dias_habiles";
  /** Para "terminacion_dias_habiles": el campo con el plazo en días hábiles. */
  plazo_campo?: string;
  /** Migración 96: el campo "Inicio de labores" (el mismo día del acta / el día siguiente). */
  inicio_campo?: string;
  /** Migración 94: si al firmar no está en "Sí", la pantalla avisa (no bloquea). */
  aviso_firma?: boolean;
}

/** Dónde guarda el acta lo que se prellenó (para saber si se apartó). */
export const PRELLENADO = "_prellenado";

const normal = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** ¿El valor de un campo prellenado se apartó de lo que traía? (ej. el alcance del contrato) */
export function seAparto(c: Campo, respuestas: Record<string, unknown>): { original: string } | null {
  const pre = respuestas[PRELLENADO] as Record<string, unknown> | undefined;
  if (!c.prellenar || !pre || !(c.id in pre)) return null;
  return normal(respuestas[c.id]) === normal(pre[c.id]) ? null : { original: String(pre[c.id] ?? "") };
}

/** Respuestas iniciales de un acta nueva: lo prellenado y su copia para comparar después. */
export function prellenar(campos: Campo[], datos: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!datos) return {};
  const r: Record<string, unknown> = {};
  const pre: Record<string, unknown> = {};
  for (const c of campos) {
    if (!c.prellenar) continue;
    const v = datos[c.prellenar];
    if (v === undefined || v === null || v === "") continue;
    r[c.id] = v;
    pre[c.id] = v;
  }
  if (Object.keys(pre).length) r[PRELLENADO] = pre;
  if (datos._contrato_id) r._contrato_id = datos._contrato_id;
  return r;
}

/** Migración 112: las respuestas por persona que no son la esperada (avisar antes de firmar, no bloquear). */
export function avisosDePersonas(pedidas: FirmaPedida[], lista: TecnicoEnObra[]): string[] {
  const cols = pedidas.find((p) => p.rol === "tecnico")?.columnas ?? [];
  const r: string[] = [];
  for (const t of lista)
    for (const c of cols) {
      const v = t[c.id];
      if (c.esperado === undefined) continue;
      if (v === undefined || v === null) r.push(`${t.nombre}: sin marcar "${c.etiqueta}"`);
      else if (v !== c.esperado) r.push(`${t.nombre}: "${c.etiqueta}" = ${v ? "Sí" : "No"}`);
    }
  return r;
}

/** Día de una firma en Bogotá (aaaa-mm-dd): el de la firma diaria. */
export function diaDeFirma(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** Los requisitos con aviso que no están en "Sí" (para avisar antes de la primera firma). */
export function avisosDeFirma(campos: Campo[], respuestas: Record<string, unknown>): string[] {
  return campos.filter((c) => c.aviso_firma && respuestas[c.id] !== true).map((c) => c.etiqueta);
}

export type RolFirma = "tecnico" | "responsable_sst" | "sst_cliente" | "otro";
export interface FirmaPedida {
  rol: RolFirma;
  etiqueta: string;
  obligatoria?: boolean;
  /**
   * Migración 112: se firma una vez por DÍA (ATS y alturas 2026: de lunes a sábado). El día sale
   * de la hora de la firma en el dispositivo (Bogotá). El contenido se sella con la primera firma.
   */
  diaria?: boolean;
  /** Migración 112: datos por persona de la lista de técnicos (solo en el bloque "tecnico"). */
  columnas?: ColumnaPersona[];
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
export const TIPOS_COLUMNA: TipoColumna[] = ["texto", "texto_largo", "numero", "si_no", "lista", "fecha", "hora"];

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
  /** Migración 112: las columnas por persona de la plantilla (sí/no). */
  [columna: string]: string | boolean | null | undefined;
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
      const idsf = new Set<string>();
      for (const fi of c.filas ?? []) {
        if (!/^[a-z0-9_]{1,40}$/.test(fi.id) || idsf.has(fi.id) || !fi.etiqueta.trim()) return `La tabla "${c.etiqueta}" tiene una fila fija repetida, inválida o sin nombre.`;
        idsf.add(fi.id);
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

// RRHH, primera vuelta (migración 64): gastos, permisos, abonos y documentos del personal.
// Etiquetas y tipos compartidos entre el técnico (/tecnico/…) y RRHH (/rrhh/…).
// Las reglas (quién ve qué, qué fecha se acepta, quién aprueba) las exige la base: acá solo
// se muestran y se explican.

export const BUCKET_SOPORTES = "rrhh-soportes";
export const MAX_BYTES_SOPORTE = 10 * 1024 * 1024;
export const MIME_SOPORTE = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

// ------------------------------------------------------------------ gastos
export type TipoGasto = "compra" | "transporte";
export type CategoriaCosto = "MATERIAL" | "EQUIPO" | "HERRAMIENTA" | "TRANSPORTE" | "OTRO";
export type EstadoGasto = "registrado" | "observado" | "anulado";
export type PagadoCon = "propio" | "empresa";

export const CATEGORIAS_COMPRA: { id: Exclude<CategoriaCosto, "TRANSPORTE">; nombre: string }[] = [
  { id: "MATERIAL", nombre: "Material" },
  { id: "EQUIPO", nombre: "Equipo" },
  { id: "HERRAMIENTA", nombre: "Herramienta" },
  { id: "OTRO", nombre: "Otro" },
];
export const CATEGORIA: Record<CategoriaCosto, string> = {
  MATERIAL: "Material",
  EQUIPO: "Equipo",
  HERRAMIENTA: "Herramienta",
  TRANSPORTE: "Transporte",
  OTRO: "Otro",
};
export const ESTADO_GASTO: Record<EstadoGasto, string> = {
  registrado: "Registrado",
  observado: "Por corregir",
  anulado: "Anulado",
};
export const PAGADO_CON: Record<PagadoCon, string> = {
  propio: "De mi bolsillo",
  empresa: "Con plata de la empresa",
};

export interface Gasto {
  id: string;
  persona_id: string;
  tipo: TipoGasto;
  categoria_costo: CategoriaCosto;
  fecha: string;
  monto: number;
  descripcion: string;
  proveedor: string | null;
  numero_factura: string | null;
  origen: string | null;
  destino: string | null;
  pagado_con: PagadoCon;
  proyecto_id: string | null;
  estado: EstadoGasto;
  observacion: string | null;
  observado_en: string | null;
  reembolsado_quincena: string | null;
  reembolsado_en: string | null;
  proyecto_asignado_en: string | null;
  created_at: string;
  gasto_soportes: { id: string; storage_path: string; nombre_archivo: string | null; mime: string | null }[];
}
export const COLUMNAS_GASTO =
  "id, persona_id, tipo, categoria_costo, fecha, monto, descripcion, proveedor, numero_factura, origen, destino, pagado_con, proyecto_id, estado, observacion, observado_en, reembolsado_quincena, reembolsado_en, proyecto_asignado_en, created_at, gasto_soportes(id, storage_path, nombre_archivo, mime)";

// ------------------------------------------------------------------ permisos
export type TipoPermiso =
  | "asunto_personal"
  | "remunerado"
  | "no_remunerado"
  | "cita_medica"
  | "calamidad_domestica"
  | "medio_dia"
  | "por_horas"
  | "otro";
export type Compensacion = "con_goce" | "sin_goce" | "reposicion" | "descuento_nomina";
export type EstadoPermiso = "solicitado" | "aprobado" | "rechazado" | "gozado" | "anulado";

/** Mismo orden y nombres del formulario de NEXGO (docs/nexgo-solicitud-de-permiso.md). */
export const TIPOS_PERMISO: { id: TipoPermiso; nombre: string }[] = [
  { id: "asunto_personal", nombre: "Asunto personal" },
  { id: "remunerado", nombre: "Permiso remunerado" },
  { id: "no_remunerado", nombre: "Permiso no remunerado" },
  { id: "cita_medica", nombre: "Cita médica" },
  { id: "calamidad_domestica", nombre: "Calamidad doméstica" },
  { id: "medio_dia", nombre: "Medio día" },
  { id: "por_horas", nombre: "Permiso por horas" },
  { id: "otro", nombre: "Otro" },
];
export const TIPO_PERMISO = Object.fromEntries(TIPOS_PERMISO.map((t) => [t.id, t.nombre])) as Record<TipoPermiso, string>;
export const COMPENSACIONES: { id: Compensacion; nombre: string }[] = [
  { id: "con_goce", nombre: "Con goce de sueldo" },
  { id: "sin_goce", nombre: "Sin goce de sueldo" },
  { id: "reposicion", nombre: "Reposición de tiempo" },
  { id: "descuento_nomina", nombre: "Descuento de nómina" },
];
export const COMPENSACION = Object.fromEntries(COMPENSACIONES.map((c) => [c.id, c.nombre])) as Record<Compensacion, string>;
export const ESTADO_PERMISO: Record<EstadoPermiso, string> = {
  solicitado: "Solicitado",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  gozado: "Gozado",
  anulado: "Anulado",
};
export const conHoras = (t: TipoPermiso) => t === "medio_dia" || t === "por_horas";

/**
 * La regla del mismo día, con la misma frase que devuelve la base (fn_permiso_fecha_bloqueada,
 * migración 64). Jhojan: para hoy solo calamidad doméstica; días anteriores, ningún tipo.
 */
export function motivoFechaBloqueada(tipo: TipoPermiso, desde: string, hoy: string): string | null {
  if (!desde) return null;
  if (tipo === "calamidad_domestica") {
    return desde < hoy ? "La calamidad doméstica se acepta para el mismo día en que se pide, no para días anteriores." : null;
  }
  return desde <= hoy
    ? "Para hoy solo se puede pedir calamidad doméstica (accidente propio o de un familiar). Los demás permisos, desde mañana."
    : null;
}

export interface Permiso {
  id: string;
  persona_id: string;
  tipo: TipoPermiso;
  fecha_solicitud: string;
  desde: string;
  hasta: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string;
  compensacion_propuesta: Compensacion | null;
  compensacion: Compensacion | null;
  estado: EstadoPermiso;
  decidido_en: string | null;
  motivo_rechazo: string | null;
  gozado_marcado_en: string | null;
  observaciones: string | null;
}
export const COLUMNAS_PERMISO =
  "id, persona_id, tipo, fecha_solicitud, desde, hasta, hora_inicio, hora_fin, motivo, compensacion_propuesta, compensacion, estado, decidido_en, motivo_rechazo, gozado_marcado_en, observaciones";

// ------------------------------------------------------------------ abonos
export type EstadoAbono = "solicitado" | "aprobado" | "rechazado" | "desembolsado" | "anulado";
export const ESTADO_ABONO: Record<EstadoAbono, string> = {
  solicitado: "Solicitado",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  desembolsado: "Desembolsado",
  anulado: "Anulado",
};
export interface Abono {
  id: string;
  persona_id: string;
  monto: number;
  motivo: string;
  fecha_solicitud: string;
  estado: EstadoAbono;
  decidido_en: string | null;
  motivo_rechazo: string | null;
  fecha_desembolso: string | null;
  pantallazo_path: string | null;
  quincena_descuento: string | null;
}
export const COLUMNAS_ABONO =
  "id, persona_id, monto, motivo, fecha_solicitud, estado, decidido_en, motivo_rechazo, fecha_desembolso, pantallazo_path, quincena_descuento";

/** "1.ª quincena de octubre 2026" a partir del primer día de la quincena (1 o 16). */
export function nombreQuincena(inicio: string | null): string {
  if (!inicio) return "—";
  const [a, m, d] = inicio.split("-").map(Number);
  const mes = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, 1)));
  return `${d <= 15 ? "1.ª" : "2.ª"} quincena de ${mes} ${a}`;
}

// ------------------------------------------------------------------ documentos
export type TipoDocumento = "desprendible" | "liquidacion" | "contrato" | "otro";
export const TIPOS_DOCUMENTO: { id: TipoDocumento; nombre: string }[] = [
  { id: "desprendible", nombre: "Desprendible de nómina" },
  { id: "liquidacion", nombre: "Liquidación" },
  { id: "contrato", nombre: "Contrato" },
  { id: "otro", nombre: "Otro" },
];
export const TIPO_DOCUMENTO = Object.fromEntries(TIPOS_DOCUMENTO.map((t) => [t.id, t.nombre])) as Record<TipoDocumento, string>;
export interface DocumentoPersonal {
  id: string;
  persona_id: string;
  tipo: TipoDocumento;
  titulo: string;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  storage_path: string;
  nombre_archivo: string | null;
  requiere_firma: boolean;
  subido_en: string;
  visto_en: string | null;
  firma_path: string | null;
  firmado_en: string | null;
  anulado_en: string | null;
  motivo_anulacion: string | null;
}
export const COLUMNAS_DOCUMENTO =
  "id, persona_id, tipo, titulo, periodo_inicio, periodo_fin, storage_path, nombre_archivo, requiere_firma, subido_en, visto_en, firma_path, firmado_en, anulado_en, motivo_anulacion";

// ------------------------------------------------------------------ formato
export function pesos(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, d)),
  );
}
/** Monto escrito con puntos o comas de miles → número. Null si no es un monto válido. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[^\d]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

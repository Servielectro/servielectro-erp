// Registrar problema (migración 73) y observaciones de revisión (migración 104): lo que el usuario
// anota sobre una pantalla del ERP. Una sola bandeja para todo.

export type Gravedad = "bloquea" | "estorba" | "detalle";
export const GRAVEDADES: { id: Gravedad; nombre: string; ayuda: string }[] = [
  { id: "bloquea", nombre: "Me bloquea", ayuda: "No puedo seguir trabajando" },
  { id: "estorba", nombre: "Me estorba", ayuda: "Puedo seguir, pero cuesta" },
  { id: "detalle", nombre: "Es un detalle", ayuda: "Algo que se ve mal o sobra" },
];
export const GRAVEDAD = Object.fromEntries(GRAVEDADES.map((g) => [g.id, g.nombre])) as Record<Gravedad, string>;

export type TipoReporte = "problema" | "hallazgo" | "sugerencia" | "duda";
export const TIPOS_REPORTE: { id: TipoReporte; nombre: string; ayuda: string }[] = [
  { id: "problema", nombre: "Problema", ayuda: "Algo está roto o no funciona" },
  { id: "hallazgo", nombre: "Hallazgo", ayuda: "Incumple una norma" },
  { id: "sugerencia", nombre: "Sugerencia", ayuda: "Una mejora" },
  { id: "duda", nombre: "Duda", ayuda: "No sé cómo se hace" },
];
export const TIPO_REPORTE = Object.fromEntries(TIPOS_REPORTE.map((t) => [t.id, t.nombre])) as Record<TipoReporte, string>;

/** Lo que pregunta cada tipo (la misma tabla: que_paso y que_esperaba). */
export const PREGUNTAS: Record<TipoReporte, { que: string; ejemplo: string; esperado: string | null; ejemploEsperado: string }> = {
  problema: { que: "¿Qué pasó?", ejemplo: "Ej.: toqué Guardar y no pasó nada", esperado: "¿Qué esperabas que pasara?", ejemploEsperado: "Ej.: que guardara la visita" },
  hallazgo: { que: "¿Qué incumple y dónde?", ejemplo: "Ej.: la inspección no pide la firma del responsable del SG-SST", esperado: "¿Cómo debería quedar?", ejemploEsperado: "Ej.: un campo de firma del responsable al final" },
  sugerencia: { que: "¿Qué mejorarías?", ejemplo: "Ej.: poder filtrar el plan por estándar", esperado: "¿Cómo lo imaginas?", ejemploEsperado: "Ej.: un filtro arriba de la lista" },
  duda: { que: "¿Cuál es tu duda?", ejemplo: "Ej.: ¿dónde se ve el plan anual?", esperado: null, ejemploEsperado: "" },
};

export type EstadoReporte = "nuevo" | "en_revision" | "aceptado" | "resuelto" | "descartado";
export const ESTADO_REPORTE: Record<EstadoReporte, string> = {
  nuevo: "Recibido, sin revisar",
  en_revision: "En estudio",
  aceptado: "Aceptado: se va a hacer",
  resuelto: "Resuelto / implementado",
  descartado: "Descartado",
};
/** Antes de la 104 el descartado se llamaba así: se muestra igual. */
export const etiquetaEstado = (e: string) => ESTADO_REPORTE[e as EstadoReporte] ?? (e === "no_es_error" ? "Descartado" : e);

/** Nombre del módulo según el primer tramo de la ruta (columna modulo de la 104). */
export const MODULO_RUTA: Record<string, string> = {
  sgsst: "SG-SST",
  actas: "Proyectos (actas)",
  proyectos: "Proyectos",
  comercial: "Comercial",
  administrativo: "Administrativo",
  operativo: "Operativo",
  tecnico: "App del técnico",
  rrhh: "RRHH",
  configuracion: "Configuración",
  reportar: "SG-SST (reportar)",
  notificaciones: "Notificaciones",
};
export const nombreModulo = (m: string | null) => (m ? MODULO_RUTA[m] ?? m : "Inicio");

export interface ReporteProblema {
  id: string;
  reportado_por: string;
  reportado_en: string;
  ruta: string;
  que_paso: string;
  que_esperaba: string | null;
  gravedad: Gravedad | null;
  tipo?: TipoReporte;
  norma?: string | null;
  seccion?: string | null;
  modulo?: string | null;
  captura_path: string | null;
  contexto: Record<string, unknown>;
  estado: EstadoReporte;
  nota_cierre: string | null;
  revisado_en: string | null;
  revisado_por?: string | null;
}
export const COLUMNAS_REPORTE =
  "id, reportado_por, reportado_en, ruta, que_paso, que_esperaba, gravedad, captura_path, contexto, estado, nota_cierre, revisado_en";
/** Con las columnas de la 104 (tipo, norma, sección, módulo y quién respondió). */
export const COLUMNAS_OBSERVACION = `${COLUMNAS_REPORTE}, tipo, norma, seccion, modulo, revisado_por`;

/** El nombre de la pantalla en que está: su título (el h1), o el del documento. */
export function seccionActual(): string | null {
  if (typeof document === "undefined") return null;
  const h1 = document.querySelector("main h1, h1")?.textContent?.trim();
  const t = (h1 || document.title || "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 200) : null;
}

export const BUCKET_REPORTES = "reportes-problema";

/**
 * Lo que se manda solo para depurar. SOLO estas claves (la base rechaza cualquier otra): nada
 * de lo escrito en los formularios ni datos personales.
 */
export function contextoDepuracion(): Record<string, unknown> {
  return {
    sin_senal: typeof navigator !== "undefined" ? !navigator.onLine : null,
    ancho: typeof window !== "undefined" ? window.innerWidth : null,
    alto: typeof window !== "undefined" ? window.innerHeight : null,
    version: process.env.NEXT_PUBLIC_VERSION_APP ?? null,
    navegador: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    app: typeof window !== "undefined" && window.location.pathname.startsWith("/tecnico") ? "tecnico" : "oficina",
  };
}

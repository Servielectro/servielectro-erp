// Registrar problema (migración 73): lo que el usuario reporta cuando algo de la app no está bien.

export type Gravedad = "bloquea" | "estorba" | "detalle";
export const GRAVEDADES: { id: Gravedad; nombre: string; ayuda: string }[] = [
  { id: "bloquea", nombre: "Me bloquea", ayuda: "No puedo seguir trabajando" },
  { id: "estorba", nombre: "Me estorba", ayuda: "Puedo seguir, pero cuesta" },
  { id: "detalle", nombre: "Es un detalle", ayuda: "Algo que se ve mal o sobra" },
];
export const GRAVEDAD = Object.fromEntries(GRAVEDADES.map((g) => [g.id, g.nombre])) as Record<Gravedad, string>;

export type EstadoReporte = "nuevo" | "en_revision" | "resuelto" | "no_es_error";
export const ESTADO_REPORTE: Record<EstadoReporte, string> = {
  nuevo: "Recibido, sin revisar",
  en_revision: "En revisión",
  resuelto: "Resuelto",
  no_es_error: "No es un error",
};

export interface ReporteProblema {
  id: string;
  reportado_por: string;
  reportado_en: string;
  ruta: string;
  que_paso: string;
  que_esperaba: string | null;
  gravedad: Gravedad;
  captura_path: string | null;
  contexto: Record<string, unknown>;
  estado: EstadoReporte;
  nota_cierre: string | null;
  revisado_en: string | null;
}
export const COLUMNAS_REPORTE =
  "id, reportado_por, reportado_en, ruta, que_paso, que_esperaba, gravedad, captura_path, contexto, estado, nota_cierre, revisado_en";

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

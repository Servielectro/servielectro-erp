// Tipos y utilidades del radar de licitaciones (migración 143). Todo lo calcula la base
// (v_licitaciones_radar); acá solo se presenta.

export interface FilaRadar {
  id: string;
  id_del_proceso: string;
  entidad: string | null;
  departamento: string | null;
  ciudad: string | null;
  objeto: string | null;
  modalidad: string | null;
  presupuesto: number | null;
  cierra_en: string | null; // hora de Colombia, sin zona (así la guarda SECOP)
  url_secop: string | null;
  publicado_en: string | null;
  traida_en: string;
  dias_publicado_al_traer: number | null;
  requiere_rup: boolean | null;
  afinidad: number | null;
  criterios_que_coinciden: string[] | null;
  criterios_faltantes: string[] | null;
  actividad_por: "unspsc" | "palabra" | "sin_criterio" | null;
  lineas_que_calzaron: string[] | null;
  relevante: boolean | null;
}

export interface Barrido {
  id: string;
  iniciado_en: string;
  terminado_en: string | null;
  ventana_desde: string | null;
  leidos: number;
  con_actividad: number;
  relevantes: number;
  nuevos: number;
  sin_rup: number;
  con_token: boolean | null;
  error: string | null;
}

/** Los cinco criterios de Licitta, en el orden en que se muestran. */
export const CRITERIOS = [
  { id: "actividad", nombre: "Actividad" },
  { id: "ubicacion", nombre: "Ubicación" },
  { id: "modalidad", nombre: "Modalidad" },
  { id: "tipo_contrato", nombre: "Tipo de contrato" },
  { id: "presupuesto", nombre: "Presupuesto" },
] as const;

export const LINEAS: Record<string, string> = {
  seguridad_electronica: "Seguridad electrónica",
  cercas: "Cercas",
  monitoreo: "Monitoreo",
  redes: "Redes",
  electrico: "Eléctrico",
  sin_linea: "Sin línea",
};
export const nombreLinea = (l: string) => LINEAS[l] ?? l;

/** Ciudad si SECOP la trae; si no, el departamento entre paréntesis. */
export function lugar(f: Pick<FilaRadar, "ciudad" | "departamento">): string {
  const c = (f.ciudad ?? "").trim();
  if (c && !/^no (definido|aplica)$/i.test(c)) return c;
  return f.departamento ? `(${f.departamento})` : "Sin ubicación";
}

/** El cierre de SECOP es hora de Colombia sin zona: se le pone la de Bogotá (-05:00, sin horario de verano). */
export function fechaCierre(cierra_en: string | null): Date | null {
  if (!cierra_en) return null;
  const d = new Date(`${cierra_en.slice(0, 19)}-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Días calendario (Bogotá) que faltan para el cierre: 0 = hoy. */
export function diasParaCierre(cierra_en: string | null, ahora: Date): number | null {
  const d = fechaCierre(cierra_en);
  if (!d) return null;
  const dia = (x: Date) => Math.floor((x.getTime() - 5 * 3600 * 1000) / 86400000);
  return dia(d) - dia(ahora);
}

export const formatoPesos = (v: number | null) =>
  v == null ? "Sin presupuesto" : v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export const formatoFechaHora = (d: Date) =>
  d.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Búsqueda pública de SECOP II, para lo que cierra pronto (Datos Abiertos va 1 a 3 días atrás). */
export const SECOP_BUSQUEDA = "https://community.secop.gov.co/Public/Tendering/ContractNoticeManagement/Index";

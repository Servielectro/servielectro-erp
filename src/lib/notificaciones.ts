// Notificaciones (migración 76). Las crea la base con disparadores; la app solo las lee, las marca
// como leídas y guarda las preferencias de cada quien.

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  ruta: string | null;
  urgente: boolean;
  creada_en: string;
  leida_en: string | null;
}
export const COLUMNAS_NOTIFICACION = "id, tipo, titulo, cuerpo, ruta, urgente, creada_en, leida_en";

export interface TipoNotificacion {
  id: string;
  nombre: string;
  descripcion: string;
  para: "tecnico" | "aprobador" | "rrhh" | "sst";
  por_defecto: boolean;
  orden: number;
}

export const GRUPO_TIPO: Record<TipoNotificacion["para"], string> = {
  tecnico: "Lo tuyo",
  aprobador: "Como aprobador",
  rrhh: "Como RRHH",
  sst: "Como SG-SST",
};

/** "hace 5 min", "ayer", "12 oct". */
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.floor((ahora - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  if (h < 48) return "ayer";
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).format(new Date(iso));
}

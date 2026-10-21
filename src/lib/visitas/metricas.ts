// Métricas de una visita para Operativo: línea de tiempo, duración y retraso. Puras (sin
// base ni pantalla) para poder probarlas con números.
//
// Bogotá no tiene horario de verano: la hora programada se lee como -05:00 fijo (el mismo
// supuesto que la migración 55).

export interface JornadaTiempos {
  fecha: string; // YYYY-MM-DD
  checkInEn: string | null;
  checkOutEn: string | null;
}

export interface Hito {
  clave: "recibida" | "vista" | "checkin" | "checkout";
  etiqueta: string;
  en: string | null;
}

/**
 * Recibida · Vista · Check-in · Check-out.
 * - Recibida: cuando se creó y asignó la visita.
 * - Vista: la primera vez que el técnico la abrió (visitas.visto_en).
 * - Check-in: la primera entrada. Check-out: la última salida, solo si TODAS las jornadas
 *   tienen salida (si falta una, la visita sigue abierta y no hay check-out que mostrar).
 */
export function lineaDeTiempo(
  creadaEn: string | null,
  vistoEn: string | null,
  jornadas: JornadaTiempos[],
): Hito[] {
  const entradas = jornadas.map((j) => j.checkInEn).filter((x): x is string => Boolean(x)).sort();
  const todasConSalida = jornadas.length > 0 && jornadas.every((j) => j.checkOutEn);
  const salidas = jornadas.map((j) => j.checkOutEn).filter((x): x is string => Boolean(x)).sort();
  return [
    { clave: "recibida", etiqueta: "Recibida", en: creadaEn },
    { clave: "vista", etiqueta: "Vista", en: vistoEn },
    { clave: "checkin", etiqueta: "Check-in", en: entradas[0] ?? null },
    { clave: "checkout", etiqueta: "Check-out", en: todasConSalida ? salidas[salidas.length - 1] : null },
  ];
}

/**
 * Tiempo en sitio: la suma de cada jornada (entrada → salida). En una visita de un día es su
 * única jornada; en una obra, la suma de los días (el desglose va aparte). Las jornadas sin
 * salida no suman: no se inventa una hora de salida.
 */
export function duracionMs(jornadas: JornadaTiempos[]): number | null {
  let total = 0;
  let alguna = false;
  for (const j of jornadas) {
    if (!j.checkInEn || !j.checkOutEn) continue;
    const ms = Date.parse(j.checkOutEn) - Date.parse(j.checkInEn);
    if (Number.isFinite(ms) && ms > 0) {
      total += ms;
      alguna = true;
    }
  }
  return alguna ? total : null;
}

/** Instante de la hora programada (fecha + hora de Bogotá). Null si falta alguna. */
export function programadaEn(fecha: string | null, hora: string | null): string | null {
  if (!fecha || !hora) return null;
  const hhmm = hora.slice(0, 5);
  const d = new Date(`${fecha}T${hhmm}:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Retraso: primera entrada − hora programada. Positivo = llegó tarde; negativo = llegó antes.
 * Null si no hay hora programada o todavía no hay entrada (no se calcula contra "ahora").
 */
export function retrasoMs(programada: string | null, checkInEn: string | null): number | null {
  if (!programada || !checkInEn) return null;
  const ms = Date.parse(checkInEn) - Date.parse(programada);
  return Number.isFinite(ms) ? ms : null;
}

/** "3 h 41 min", "20 min", "45 s". Para duraciones y retrasos (se pasa el valor absoluto). */
export function formatoDuracion(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

/** Texto del retraso para la pantalla: "20 min tarde", "5 min antes", "a tiempo". */
export function textoRetraso(ms: number): string {
  if (Math.abs(ms) < 60_000) return "a tiempo";
  return `${formatoDuracion(ms)} ${ms > 0 ? "tarde" : "antes"}`;
}

/** Distancia en metros entre dos puntos (haversine; de sobra para distancias de una obra). */
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** "35 m", "1,2 km". */
export function formatoDistancia(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

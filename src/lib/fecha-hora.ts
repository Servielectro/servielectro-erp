// Fecha y hora para mostrar, siempre en hora de Colombia. `toLocaleString("es-CO")` a secas usa
// la zona del equipo que la pinta: en el servidor de Vercel (UTC) daba 5 horas de más.

const FORMATO = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

/** "21 oct 2026, 10:00 a. m." en hora de Bogotá. */
export function fechaHoraCo(iso: string | null | undefined): string {
  if (!iso) return "—";
  return FORMATO.format(new Date(iso));
}

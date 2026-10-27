// Plazos de reporte e investigación (migración 77). Los días los carga la gestión SST con su
// vigencia: aquí no hay ningún número de ley.

/** Estados de un accidente o incidente (migración 77), como se leen en pantalla. */
export const ESTADO_EVENTO: Record<string, string> = { abierto: "Abierto", investigado: "Investigado", cerrado: "Cerrado", anulado: "Anulado" };

export interface Plazo {
  clave: string;
  nombre: string;
  dias: number | null;
  tipo_dias: "habiles" | "calendario" | null;
  vigente_desde: string | null;
}

const dia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

/**
 * Fecha límite (YYYY-MM-DD, inclusive) contando desde el día siguiente al evento. Los días hábiles
 * saltan sábados y domingos; los festivos NO se descuentan (se avisa en pantalla).
 */
export function fechaLimite(ocurridoEn: string, dias: number, tipo: "habiles" | "calendario"): string {
  const d = new Date(`${dia(ocurridoEn)}T12:00:00Z`);
  let contados = 0;
  while (contados < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    const sem = d.getUTCDay();
    if (tipo === "calendario" || (sem !== 0 && sem !== 6)) contados++;
  }
  return d.toISOString().slice(0, 10);
}

export type EstadoPlazo =
  | { tipo: "sin_configurar" }
  | { tipo: "cumplido"; el: string; aTiempo: boolean; limite: string }
  | { tipo: "pendiente"; limite: string; vencido: boolean; diasRestantes: number };

export function estadoPlazo(plazo: Plazo | undefined, ocurridoEn: string, hechoEn: string | null, hoy: string): EstadoPlazo {
  if (!plazo || plazo.dias === null || plazo.tipo_dias === null) return { tipo: "sin_configurar" };
  const limite = fechaLimite(ocurridoEn, plazo.dias, plazo.tipo_dias);
  if (hechoEn) return { tipo: "cumplido", el: dia(hechoEn), aTiempo: dia(hechoEn) <= limite, limite };
  const diasRestantes = Math.round((Date.parse(`${limite}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  return { tipo: "pendiente", limite, vencido: diasRestantes < 0, diasRestantes };
}

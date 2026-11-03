// Capacitaciones e inducción (FOR-02 v4, migración del 2026-11-03): una sesión es un sst_formatos
// más del motor de plantillas. Lo común de las pantallas de /sgsst/capacitaciones.

import type { Campo } from "./plantillas";

/**
 * La plantilla FOR-02 trae "registro de competencia" como tipo "casillas" (varias a la vez). El
 * renderizador de formatos ya lo dibuja como una lista múltiple: se traduce aquí y no se toca el
 * motor.
 */
export function camposFor02(campos: Campo[]): Campo[] {
  return campos.map((c) => ((c.tipo as string) === "casillas" ? { ...c, tipo: "lista", multiple: true } : c));
}

export interface Asistente {
  nombre: string;
  documento: string;
  cargo?: string | null;
}

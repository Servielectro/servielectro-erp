// Días hábiles en Colombia, igual que fn_sumar_dias_habiles (migración 96): LUNES A SÁBADO, sin
// festivos. Si las labores inician el mismo día del acta, ese día es el primero que cuenta (si es
// hábil); si no, se empieza a contar el día siguiente (Jhojan, 2026-10-27). Si la regla cambia,
// se cambia en los dos lugares a la vez: el celular muestra lo mismo que la base guarda.

/** Opciones del campo "Inicio de labores" del acta de inicio. */
export const INICIO_MISMO_DIA = "El mismo día del acta";
export const INICIO_DIA_SIGUIENTE = "El día siguiente al acta";

export function iniciaMismoDia(valor: unknown): boolean | null {
  return valor === INICIO_MISMO_DIA ? true : valor === INICIO_DIA_SIGUIENTE ? false : null;
}

/**
 * El día en que se cumplen `dias` días hábiles desde `desde` ("YYYY-MM-DD"). Con dias = 1, el
 * primer día que cuenta (el inicio de labores). null si falta algo: el plazo, el inicio o el
 * calendario de festivos. Nunca se calcula en días corridos.
 */
export function sumarDiasHabiles(desde: string, dias: number, mismoDia: boolean | null, festivos: Set<string> | null): string | null {
  if (!desde || !Number.isInteger(dias) || dias < 1 || mismoDia === null || !festivos) return null;
  const d = new Date(`${desde}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (mismoDia) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay(); // 0 domingo, 6 sábado
    if (dia !== 0 && !festivos.has(d.toISOString().slice(0, 10))) n++;
  }
  return d.toISOString().slice(0, 10);
}

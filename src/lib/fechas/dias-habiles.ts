// Días hábiles en Colombia, igual que fn_sumar_dias_habiles (migración 94): lunes a viernes, sin
// festivos, contando desde el día SIGUIENTE a `desde`. Si la regla cambia (sábado hábil, o que
// el día del acta cuente), se cambia en los dos lugares a la vez: el celular muestra lo mismo que
// la base guarda.

/** "YYYY-MM-DD" + n días hábiles. null si falta algo o si no hay calendario de festivos. */
export function sumarDiasHabiles(desde: string, dias: number, festivos: Set<string> | null): string | null {
  if (!desde || !Number.isInteger(dias) || dias < 1 || !festivos) return null;
  const d = new Date(`${desde}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let n = 0;
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay(); // 0 domingo, 6 sábado
    if (dia >= 1 && dia <= 5 && !festivos.has(d.toISOString().slice(0, 10))) n++;
  }
  return d.toISOString().slice(0, 10);
}

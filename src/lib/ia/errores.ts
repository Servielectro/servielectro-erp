import "server-only";

// Errores de IA clasificados por CAUSA, porque cada causa se trata distinto y el mensaje tiene
// que decir la verdad (2026-10-22: "mucho tráfico" aparecía aunque el problema fuera otro, y
// hacía buscar la falla donde no estaba).
//
//   saturado  503 / UNAVAILABLE / overloaded: el servicio está lleno ahora. Se reintenta rápido.
//   cuota     sin saldo o cuota del día/mes agotada (429 insufficient_quota, quotaId PerDay…):
//             NUNCA se reintenta, no va a cambiar en segundos.
//   limite    límite por minuto (429 rate limit): tampoco se reintenta con un cliente al frente
//             (Google/OpenAI piden esperar decenas de segundos); se pasa al otro proveedor.
//   config    falta la clave, clave inválida, sin permiso, modelo inexistente.
//   tiempo    no respondió dentro del tope.
//   otro      petición rechazada por otra razón.
export type CausaIA = "saturado" | "cuota" | "limite" | "config" | "tiempo" | "otro";

export class ErrorIA extends Error {
  constructor(
    readonly proveedor: "OpenAI" | "Gemini",
    readonly causa: CausaIA,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorIA";
  }
}

/** Una línea por proveedor, en español, para el mensaje final cuando fallan los dos. */
export function explicar(e: ErrorIA): string {
  switch (e.causa) {
    case "saturado":
      return `${e.proveedor} está saturado en este momento`;
    case "cuota":
      return `${e.proveedor}: se agotó el saldo o la cuota`;
    case "limite":
      return `${e.proveedor}: demasiadas consultas seguidas (límite por minuto)`;
    case "tiempo":
      return `${e.proveedor} no respondió a tiempo`;
    case "config":
      return `${e.proveedor}: ${e.message}`;
    default:
      return `${e.proveedor} rechazó la consulta`;
  }
}

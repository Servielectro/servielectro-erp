// Estado de un acta frente al portal del cliente (migración 137: enviar al cliente / publicar al
// sellar). Sin "use client": lo usan tanto la ficha del proyecto (servidor) como el botón (cliente).

export type EstadoEnvio = "borrador" | "enviada" | "firmada" | "publicada" | "cerrada";

/** "Enviada el DD/MM a las HH:MM", en hora de Bogotá. */
export function fechaEnvio(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${dia} a las ${hora}`;
}

/** El estado del acta frente al cliente, en una frase. Sirve igual para la ficha del proyecto. */
export function estadoEnvio(a: { estado: string; enviadoEn: string | null; firmoContratante: boolean; publicada: boolean }): { clave: EstadoEnvio; texto: string } {
  if (a.estado !== "borrador") {
    return a.publicada ? { clave: "publicada", texto: "Firmada y publicada en el portal del cliente" } : { clave: "cerrada", texto: "Cerrada (no publicada en el portal del cliente)" };
  }
  if (a.firmoContratante) return { clave: "firmada", texto: "Firmada por el contratante" };
  if (a.enviadoEn) return { clave: "enviada", texto: `Enviada al cliente el ${fechaEnvio(a.enviadoEn)} — pendiente de su firma` };
  return { clave: "borrador", texto: "Borrador — no visible para el cliente" };
}

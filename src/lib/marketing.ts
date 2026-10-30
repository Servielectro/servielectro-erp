// Marketing (migraciones 125 y 126): etiquetas y tipos que usan las pantallas del servidor y del
// cliente. Sin "use client" a propósito: se importa desde los dos lados.

export type EstadoIdea = "idea" | "guion" | "arte" | "aprobada" | "programada" | "publicada" | "descartada";

/** El camino de una idea, en orden. "descartada" va aparte: se sale del camino en cualquier punto. */
export const CAMINO: { key: Exclude<EstadoIdea, "descartada">; label: string; ayuda: string }[] = [
  { key: "idea", label: "Idea", ayuda: "De qué se va a hablar." },
  { key: "guion", label: "Guion", ayuda: "Gancho, láminas o escenas y llamado a la acción." },
  { key: "arte", label: "Arte", ayuda: "Las fotos, imágenes o el video." },
  { key: "aprobada", label: "Aprobada", ayuda: "Lista para salir. Con material de un cliente, solo si autorizó." },
  { key: "programada", label: "Programada", ayuda: "Con fecha en el calendario." },
  { key: "publicada", label: "Publicada", ayuda: "Ya salió en al menos una cuenta." },
];

export const ETIQUETA_ESTADO: Record<EstadoIdea, string> = {
  ...(Object.fromEntries(CAMINO.map((c) => [c.key, c.label])) as Record<Exclude<EstadoIdea, "descartada">, string>),
  descartada: "Descartada",
};

export const COLOR_ESTADO: Record<EstadoIdea, string> = {
  idea: "border-slate-300 bg-slate-50 text-slate-800",
  guion: "border-sky-300 bg-sky-50 text-sky-900",
  arte: "border-violet-300 bg-violet-50 text-violet-900",
  aprobada: "border-green-400 bg-green-50 text-green-900",
  programada: "border-amber-400 bg-amber-50 text-amber-900",
  publicada: "border-green-700 bg-green-700 text-white",
  descartada: "border-slate-200 bg-white text-slate-400 line-through",
};

export const TIPOS_IDEA: { key: string; label: string }[] = [
  { key: "carrusel", label: "Carrusel" },
  { key: "video", label: "Video" },
  { key: "post", label: "Post" },
  { key: "caso_obra", label: "Caso de obra" },
  { key: "historia", label: "Historia" },
  { key: "articulo", label: "Artículo" },
];
export const ETIQUETA_TIPO: Record<string, string> = Object.fromEntries(TIPOS_IDEA.map((t) => [t.key, t.label]));

export const CANALES: { key: string; label: string }[] = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "otro", label: "Otro" },
];
export const ETIQUETA_CANAL: Record<string, string> = Object.fromEntries(CANALES.map((c) => [c.key, c.label]));

/** Lo aprobado por Jhojan: 3 publicaciones por semana, LinkedIn primero. */
export const CADENCIA_SEMANAL = 3;

export type Autorizacion = "pendiente" | "concedida" | "negada" | "no_aplica";

/**
 * Cómo se muestra el permiso de un material. Lo que importa es si SE PUEDE PUBLICAR: material
 * identificable sin autorización concedida no pasa a "aprobada" (lo bloquea la base).
 */
export function estadoPublicable(identificable: boolean, autorizacion: Autorizacion) {
  if (!identificable) return { publicable: true, texto: "No se reconoce de quién es", clase: "bg-slate-100 text-slate-700 border-slate-300" };
  if (autorizacion === "concedida") return { publicable: true, texto: "Cliente autorizó", clase: "bg-green-100 text-green-900 border-green-400" };
  if (autorizacion === "negada") return { publicable: false, texto: "Cliente NO autorizó: no se publica", clase: "bg-slate-900 text-white border-slate-900" };
  return { publicable: false, texto: "Sin autorización: no se puede publicar", clase: "bg-red-100 text-red-900 border-red-400" };
}

/** Fecha de hoy en Bogotá, AAAA-MM-DD. */
export function hoyBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export const fechaCorta = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "";

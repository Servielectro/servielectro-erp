// Reuniones (migración 86): el acta tal como la define el prompt 02_acta.md de la app de Jhojan, y
// cómo pasa a la plantilla "Acta de reunión" del motor de plantillas (para firmarse).

export type Parte = "servielectro" | "cliente" | "tercero";

export interface Participante {
  nombre: string;
  rol: string;
  parte: Parte;
}
export interface Compromiso {
  descripcion: string;
  parte: Parte;
  responsable: string;
  fecha_limite: string | null;
  cita: string;
}
export interface Acta {
  titulo: string;
  cliente: string;
  fecha_mencionada: string | null;
  lugar: string;
  participantes: Participante[];
  resumen_ejecutivo: string;
  temas: { tema: string; desarrollo: string }[];
  puntos_clave: string[];
  decisiones: string[];
  conclusiones: string[];
  compromisos: Compromiso[];
  pendientes_por_confirmar: string[];
  riesgos_u_objeciones: string[];
  oportunidades_comerciales: string[];
  inconsistencias: string[];
  siguiente_reunion: string | null;
}

export type EstadoReunion = "preparando" | "audio_subido" | "transcribiendo" | "redactando" | "lista" | "error" | "aprobada" | "anulada";
export const ESTADO_REUNION: Record<EstadoReunion, string> = {
  preparando: "Por grabar",
  audio_subido: "Audio subido",
  transcribiendo: "Transcribiendo",
  redactando: "Redactando el acta",
  lista: "Acta lista para revisar",
  error: "Con error",
  aprobada: "Aprobada",
  anulada: "Anulada",
};

export interface Asistente {
  nombre: string;
  parte: Parte;
  rol?: string;
}

export interface Reunion {
  id: string;
  proyecto_id: string;
  titulo: string;
  lugar: string | null;
  fecha: string;
  aviso_grabacion: boolean;
  aviso_por: string | null;
  aviso_en: string | null;
  asistentes: Asistente[];
  audio_path: string | null;
  audio_mime: string | null;
  audio_bytes: number | null;
  duracion_s: number | null;
  estado: EstadoReunion;
  error: string | null;
  transcripcion: string | null;
  acta: Acta | null;
  acta_revisada: Acta | null;
  aprobada_por: string | null;
  aprobada_en: string | null;
  formato_id: string | null;
  motivo_anulacion: string | null;
  creada_en: string;
}
export const COLUMNAS_REUNION =
  "id, proyecto_id, titulo, lugar, fecha, aviso_grabacion, aviso_por, aviso_en, asistentes, audio_path, audio_mime, audio_bytes, duracion_s, estado, error, transcripcion, acta, acta_revisada, aprobada_por, aprobada_en, formato_id, motivo_anulacion, creada_en";

/** Id de la plantilla "Acta de reunión" que siembra la migración 86. */
export const PLANTILLA_ACTA_REUNION = "00000000-0000-4000-8000-0000000086a1";

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "")).filter((x) => x.trim()) : []);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const parte = (v: unknown): Parte => (v === "cliente" || v === "tercero" ? v : "servielectro");

/** Lo que devolvió la IA, con forma segura (lo que falte queda vacío; nada se inventa). */
export function normalizarActa(crudo: unknown): Acta {
  const a = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);
  return {
    titulo: texto(a.titulo),
    cliente: texto(a.cliente),
    fecha_mencionada: typeof a.fecha_mencionada === "string" ? a.fecha_mencionada : null,
    lugar: texto(a.lugar),
    participantes: arr(a.participantes).map((p) => ({ nombre: texto(p.nombre), rol: texto(p.rol), parte: parte(p.parte) })),
    resumen_ejecutivo: texto(a.resumen_ejecutivo),
    temas: arr(a.temas).map((t) => ({ tema: texto(t.tema), desarrollo: texto(t.desarrollo) })),
    puntos_clave: lista(a.puntos_clave),
    decisiones: lista(a.decisiones),
    conclusiones: lista(a.conclusiones),
    compromisos: arr(a.compromisos)
      .map((c) => ({
        descripcion: texto(c.descripcion),
        parte: parte(c.parte),
        responsable: texto(c.responsable),
        fecha_limite: typeof c.fecha_limite === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha_limite) ? c.fecha_limite : null,
        cita: texto(c.cita),
      }))
      .filter((c) => c.descripcion.trim()),
    pendientes_por_confirmar: lista(a.pendientes_por_confirmar),
    riesgos_u_objeciones: lista(a.riesgos_u_objeciones),
    oportunidades_comerciales: lista(a.oportunidades_comerciales),
    inconsistencias: lista(a.inconsistencias),
    siguiente_reunion: typeof a.siguiente_reunion === "string" && a.siguiente_reunion.trim() ? a.siguiente_reunion : null,
  };
}

/** El contexto que la app de Jhojan le da a la etapa 2 (api/pipeline.py, _contexto), igual. */
export function contextoReunion(r: Pick<Reunion, "titulo" | "lugar" | "fecha" | "asistentes">, cliente: string | null): string {
  const partes: string[] = [];
  if (r.titulo) partes.push(`Título dado por el usuario: ${r.titulo}`);
  if (cliente) partes.push(`Cliente: ${cliente}`);
  if (r.lugar) partes.push(`Lugar: ${r.lugar}`);
  if (r.asistentes.length) partes.push("Participantes indicados: " + r.asistentes.map((a) => a.nombre).join(", "));
  if (r.fecha) partes.push(`Fecha de la reunión: ${r.fecha.slice(0, 10)}`);
  if (!partes.length) return "";
  return "CONTEXTO APORTADO POR EL USUARIO (es dato confirmado, úsalo para nombrar participantes y cliente):\n" + partes.map((p) => "- " + p).join("\n");
}

const renglones = (xs: string[]) => xs.map((x) => `• ${x}`).join("\n");

/** El acta aprobada → respuestas de la plantilla "Acta de reunión" (mismos campos, en el mismo orden). */
export function respuestasDesdeActa(a: Acta, avisoTexto: string): Record<string, unknown> {
  return {
    aviso_grabacion: avisoTexto,
    titulo: a.titulo,
    cliente: a.cliente,
    participantes: a.participantes.map((p) => ({ nombre: p.nombre, rol: p.rol, parte: p.parte })),
    resumen_ejecutivo: a.resumen_ejecutivo,
    temas: a.temas.map((t) => ({ tema: t.tema, desarrollo: t.desarrollo })),
    puntos_clave: renglones(a.puntos_clave),
    decisiones: renglones(a.decisiones),
    conclusiones: renglones(a.conclusiones),
    compromisos: a.compromisos.map((c) => ({ descripcion: c.descripcion, parte: c.parte, responsable: c.responsable, fecha_limite: c.fecha_limite ?? "" })),
    pendientes_por_confirmar: renglones(a.pendientes_por_confirmar),
    riesgos_u_objeciones: renglones(a.riesgos_u_objeciones),
    oportunidades_comerciales: renglones(a.oportunidades_comerciales),
    inconsistencias: renglones(a.inconsistencias),
    siguiente_reunion: a.siguiente_reunion ?? "",
  };
}

const quitarTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * A quién proponer para un compromiso: la persona asignable cuyo nombre coincide con el
 * responsable que dice el acta. Si hay varias o ninguna, nadie (lo elige Jhojan).
 */
export function proponerAsignado(responsable: string, personas: { id: string; nombre: string }[]): string | null {
  const r = quitarTildes(responsable);
  if (!r) return null;
  const palabras = r.split(/\s+/).filter((p) => p.length > 2);
  const hits = personas.filter((p) => {
    const n = quitarTildes(p.nombre);
    return n === r || (palabras.length > 0 && palabras.every((w) => n.includes(w)));
  });
  return hits.length === 1 ? hits[0].id : null;
}

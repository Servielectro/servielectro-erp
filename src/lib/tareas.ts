// Tablero de tareas y agenda personal: tipos y reglas de presentación compartidas.
// Las reglas que importan (quién ve, quién asigna, dependencias, historial) las exige la
// base (migración 50); acá solo lo que la pantalla necesita para mostrar y ordenar.

export type EstadoTarea = "por_hacer" | "en_progreso" | "hecho";
export type PrioridadTarea = "baja" | "media" | "alta" | "urgente";
export type VisibilidadTarea = "interna" | "equipo";

export const COLUMNAS: { estado: EstadoTarea; titulo: string; borde: string; texto: string }[] = [
  { estado: "por_hacer", titulo: "Por hacer", borde: "border-t-orange-500", texto: "text-orange-700" },
  { estado: "en_progreso", titulo: "En progreso", borde: "border-t-blue-500", texto: "text-blue-700" },
  { estado: "hecho", titulo: "Hecho", borde: "border-t-green-600", texto: "text-green-700" },
];

export const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  por_hacer: "Por hacer",
  en_progreso: "En progreso",
  hecho: "Hecho",
};

export const PRIORIDADES: { valor: PrioridadTarea; etiqueta: string; clase: string }[] = [
  { valor: "baja", etiqueta: "BAJA", clase: "bg-slate-100 text-slate-700" },
  { valor: "media", etiqueta: "MEDIA", clase: "bg-sky-100 text-sky-800" },
  { valor: "alta", etiqueta: "ALTA", clase: "bg-amber-100 text-amber-900" },
  { valor: "urgente", etiqueta: "URGENTE", clase: "bg-red-100 text-red-800" },
];

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: PrioridadTarea;
  visibilidad: VisibilidadTarea;
  proyectoId: string | null;
  visitaId: string | null;
  fechaProgramada: string | null; // YYYY-MM-DD
  hora: string | null; // HH:MM, null = en el día
  fechaLimite: string | null;
  orden: number;
  creadaPor: string;
  archivada: boolean;
  cerradaEn: string | null;
  /** Si nació de una sugerencia del técnico. */
  sugerenciaId: string | null;
  asignados: string[];
  subtareas: { id: string; titulo: string; hecha: boolean; orden: number }[];
  dependencias: { bloqueanteId: string; tipo: "para_empezar" | "para_cerrar" }[];
}

export interface Obra {
  /** "p:<id>" para proyecto, "v:<id>" para visita */
  clave: string;
  nombre: string;
}

/** Fila de la base → Tarea. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tareaDeFila(f: any): Tarea {
  return {
    id: f.id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    estado: f.estado,
    prioridad: f.prioridad,
    visibilidad: f.visibilidad,
    proyectoId: f.proyecto_id,
    visitaId: f.visita_id,
    fechaProgramada: f.fecha_programada,
    hora: f.hora ? String(f.hora).slice(0, 5) : null,
    fechaLimite: f.fecha_limite,
    orden: Number(f.orden ?? 0),
    creadaPor: f.creada_por,
    archivada: Boolean(f.archivada),
    cerradaEn: f.cerrada_en,
    sugerenciaId: f.sugerencia_id ?? null,
    asignados: (f.tarea_asignados ?? []).map((a: { perfil_id: string }) => a.perfil_id),
    subtareas: (f.tarea_subtareas ?? [])
      .map((s: { id: string; titulo: string; hecha: boolean; orden: number }) => ({
        id: s.id,
        titulo: s.titulo,
        hecha: s.hecha,
        orden: Number(s.orden ?? 0),
      }))
      .sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden),
    dependencias: (f.dependencias ?? []).map((d: { bloqueante_id: string; tipo: "para_empezar" | "para_cerrar" }) => ({
      bloqueanteId: d.bloqueante_id,
      tipo: d.tipo,
    })),
  };
}

/** Lo que se pide a la base para armar una Tarea (con sus hijos). */
export const SELECT_TAREA =
  "id, titulo, descripcion, estado, prioridad, visibilidad, proyecto_id, visita_id, fecha_programada, hora, fecha_limite, orden, creada_por, archivada, cerrada_en, sugerencia_id, tarea_asignados(perfil_id), tarea_subtareas(id, titulo, hecha, orden), dependencias:tarea_dependencias!tarea_dependencias_tarea_id_fkey(bloqueante_id, tipo)";

// ------------------------------------------------------------------ fechas
export function hoyBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

/** Próximo lunes (si hoy es lunes, el de la semana que viene). */
export function proximoLunes(hoy: string): string {
  const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 domingo
  const faltan = ((8 - dia) % 7) || 7;
  return sumarDias(hoy, faltan);
}

export function fechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "America/Bogota",
  });
}

/** "Vence hoy", "Vence en 2d", "Venció hace 1d". null si no tiene fecha límite o ya está hecha. */
export function etiquetaVence(t: Pick<Tarea, "fechaLimite" | "estado">, hoy: string): { texto: string; clase: string } | null {
  if (!t.fechaLimite || t.estado === "hecho") return null;
  const d = diasEntre(hoy, t.fechaLimite);
  if (d < 0) return { texto: `Venció hace ${-d}d`, clase: "bg-red-100 text-red-800" };
  if (d === 0) return { texto: "Vence hoy", clase: "bg-amber-100 text-amber-900" };
  if (d <= 2) return { texto: `Vence en ${d}d`, clase: "bg-amber-50 text-amber-800" };
  return { texto: `Vence en ${d}d`, clase: "bg-slate-100 text-slate-700" };
}

// ------------------------------------------------------------------ filtros
export type FiltroEstado = "abiertas" | "vencidas" | "por_vencer" | "hechas" | "todas";

export const FILTROS: { valor: FiltroEstado; etiqueta: string }[] = [
  { valor: "abiertas", etiqueta: "Abiertas" },
  { valor: "vencidas", etiqueta: "Vencidas" },
  { valor: "por_vencer", etiqueta: "Por vencer" },
  { valor: "hechas", etiqueta: "Hechas" },
  { valor: "todas", etiqueta: "Todas" },
];

/** Por vencer = vence entre hoy y dentro de 2 días. */
export function cumpleFiltro(t: Tarea, filtro: FiltroEstado, hoy: string): boolean {
  switch (filtro) {
    case "abiertas":
      return t.estado !== "hecho";
    case "vencidas":
      return t.estado !== "hecho" && Boolean(t.fechaLimite) && diasEntre(hoy, t.fechaLimite!) < 0;
    case "por_vencer":
      return t.estado !== "hecho" && Boolean(t.fechaLimite) && diasEntre(hoy, t.fechaLimite!) >= 0 && diasEntre(hoy, t.fechaLimite!) <= 2;
    case "hechas":
      return t.estado === "hecho";
    case "todas":
      return true;
  }
}

// ------------------------------------------------------------------ orden fraccionario
/** Orden para dejar una tarjeta entre `antes` y `despues` (cualquiera puede faltar). */
export function ordenEntre(antes: number | null, despues: number | null): number {
  if (antes === null && despues === null) return 1000;
  if (antes === null) return despues! - 1000;
  if (despues === null) return antes + 1000;
  return (antes + despues) / 2;
}

// ------------------------------------------------------------------ dependencias
/**
 * Qué la bloquea, visto desde la pantalla. Las que no puede ver solo se cuentan (la base
 * tampoco le dice el título). La base es la que decide: esto es solo para avisar antes.
 */
export function bloqueos(
  t: Tarea,
  destino: "en_progreso" | "hecho",
  porId: Map<string, Tarea>,
): { visibles: Tarea[]; ocultas: number } {
  const visibles: Tarea[] = [];
  let ocultas = 0;
  for (const d of t.dependencias) {
    if (destino === "en_progreso" && d.tipo !== "para_empezar") continue;
    const b = porId.get(d.bloqueanteId);
    if (!b) ocultas++;
    else if (b.estado !== "hecho") visibles.push(b);
  }
  return { visibles, ocultas };
}

// ------------------------------------------------------------------ agenda
export type GrupoAgenda = "atrasadas" | "hoy" | "manana" | "semana" | "despues" | "sin_fecha";

export const GRUPOS_AGENDA: { valor: GrupoAgenda; titulo: string }[] = [
  { valor: "atrasadas", titulo: "Atrasadas" },
  { valor: "hoy", titulo: "Hoy" },
  { valor: "manana", titulo: "Mañana" },
  { valor: "semana", titulo: "Esta semana" },
  { valor: "despues", titulo: "Más adelante" },
  { valor: "sin_fecha", titulo: "Sin fecha" },
];

/** El día de la agenda: cuándo se hace; si no tiene, cuándo vence. */
export function diaAgenda(t: Tarea): string | null {
  return t.fechaProgramada ?? t.fechaLimite;
}

export function grupoAgenda(t: Tarea, hoy: string): GrupoAgenda {
  return grupoDeDia(diaAgenda(t), hoy);
}

/** Grupo de la agenda para un día cualquiera (tareas y visitas). */
export function grupoDeDia(dia: string | null, hoy: string): GrupoAgenda {
  if (!dia) return "sin_fecha";
  const d = diasEntre(hoy, dia);
  if (d < 0) return "atrasadas";
  if (d === 0) return "hoy";
  if (d === 1) return "manana";
  if (d <= 6) return "semana";
  return "despues";
}

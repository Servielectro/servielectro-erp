// Eventos de la Agenda (citas, reuniones, recordatorios; migración 55). Conviven en el
// calendario con las tareas con fecha. Las reglas (quién ve, quién edita, día completo a
// medianoche de Bogotá, historial) las exige la base; acá solo armar, mostrar y guardar.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Participante, VisibilidadTarea } from "./tareas";

export interface Evento {
  id: string;
  titulo: string;
  descripcion: string | null;
  lugar: string | null;
  /** ISO (timestamptz). */
  inicio: string;
  fin: string;
  todoElDia: boolean;
  visibilidad: VisibilidadTarea;
  creadoPor: string;
  archivado: boolean;
  participantes: Participante[];
}

export const SELECT_EVENTO =
  "id, titulo, descripcion, lugar, inicio, fin, todo_el_dia, visibilidad, creado_por, archivado, evento_participantes(perfil_id, grupo_id)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function eventoDeFila(f: any): Evento {
  return {
    id: f.id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    lugar: f.lugar,
    inicio: f.inicio,
    fin: f.fin,
    todoElDia: Boolean(f.todo_el_dia),
    visibilidad: f.visibilidad,
    creadoPor: f.creado_por,
    archivado: Boolean(f.archivado),
    participantes: (f.evento_participantes ?? []).map((p: { perfil_id: string | null; grupo_id: string | null }) => ({
      perfilId: p.perfil_id,
      grupoId: p.grupo_id,
    })),
  };
}

// ------------------------------------------------------------------ fechas (Bogotá, UTC-5 fijo)
/** Día (YYYY-MM-DD) en Bogotá de un instante. */
export function diaBogota(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** Hora (HH:MM) en Bogotá de un instante. */
export function horaBogota(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** Instante de un día y hora de Bogotá. Colombia no tiene horario de verano: siempre -05:00. */
export function instanteBogota(dia: string, hora: string): string {
  return new Date(`${dia}T${hora || "00:00"}:00-05:00`).toISOString();
}

/** ¿El evento toca este día? (Día completo: del día de inicio al de fin, ambos incluidos.) */
export function eventoEnDia(e: Evento, dia: string): boolean {
  const desde = diaBogota(e.inicio);
  let hasta = diaBogota(e.fin);
  // Con hora, un fin exacto a medianoche no ocupa el día siguiente.
  if (!e.todoElDia && hasta > desde && horaBogota(e.fin) === "00:00") {
    const d = new Date(`${hasta}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    hasta = d.toISOString().slice(0, 10);
  }
  return desde <= dia && dia <= hasta;
}

// ------------------------------------------------------------------ guardar
export interface BorradorEvento {
  titulo: string;
  descripcion: string;
  lugar: string;
  todoElDia: boolean;
  diaInicio: string;
  horaInicio: string;
  diaFin: string;
  horaFin: string;
  visibilidad: "interna" | "compartida";
  participantes: Participante[];
}

export function borradorEventoVacio(dia: string): BorradorEvento {
  return {
    titulo: "",
    descripcion: "",
    lugar: "",
    todoElDia: false,
    diaInicio: dia,
    horaInicio: "09:00",
    diaFin: dia,
    horaFin: "10:00",
    visibilidad: "interna",
    participantes: [],
  };
}

export function borradorEventoDe(e: Evento): BorradorEvento {
  return {
    titulo: e.titulo,
    descripcion: e.descripcion ?? "",
    lugar: e.lugar ?? "",
    todoElDia: e.todoElDia,
    diaInicio: diaBogota(e.inicio),
    horaInicio: e.todoElDia ? "09:00" : horaBogota(e.inicio),
    diaFin: diaBogota(e.fin),
    horaFin: e.todoElDia ? "10:00" : horaBogota(e.fin),
    visibilidad: e.visibilidad === "compartida" ? "compartida" : "interna",
    participantes: e.participantes.map((p) => ({ ...p })),
  };
}

type Resultado = { ok: true; evento: Evento } | { ok: false; error: string };

function mensaje(e: { message?: string } | null | undefined): string {
  const m = e?.message ?? "No se pudo guardar.";
  if (/failed to fetch|network|load failed/i.test(m)) {
    return "No hay conexión: el evento NO se guardó. Sigue escrito aquí; vuelve a intentar cuando tengas señal.";
  }
  if (/row-level security/i.test(m)) return "No tienes permiso para eso.";
  if (/eventos_fin_despues_de_inicio/.test(m)) return "El fin no puede ser antes del inicio.";
  return m;
}

const clave = (p: Participante) => (p.perfilId ? `p:${p.perfilId}` : `g:${p.grupoId}`);

export async function guardarEvento(supabase: SupabaseClient, original: Evento | null, b: BorradorEvento): Promise<Resultado> {
  if (!b.titulo.trim()) return { ok: false, error: "Falta el título." };
  if (!b.diaInicio || !b.diaFin) return { ok: false, error: "Elige el día de inicio y el de fin." };
  const inicio = instanteBogota(b.diaInicio, b.todoElDia ? "00:00" : b.horaInicio);
  const fin = instanteBogota(b.diaFin, b.todoElDia ? "00:00" : b.horaFin);
  if (fin < inicio) return { ok: false, error: "El fin no puede ser antes del inicio." };
  if (b.visibilidad === "compartida" && b.participantes.length === 0) {
    return { ok: false, error: "Elige con quién lo compartes, o déjalo interno (solo yo)." };
  }

  // Deja de ser compartido: primero se quita a los participantes (la base lo exige).
  if (original?.visibilidad === "compartida" && b.visibilidad !== "compartida") {
    const { error } = await supabase.from("evento_participantes").delete().eq("evento_id", original.id);
    if (error) return { ok: false, error: mensaje(error) };
  }

  const campos = {
    titulo: b.titulo.trim(),
    descripcion: b.descripcion.trim() || null,
    lugar: b.lugar.trim() || null,
    inicio,
    fin,
    todo_el_dia: b.todoElDia,
    visibilidad: b.visibilidad,
  };
  let id = original?.id ?? null;
  if (original) {
    const { error } = await supabase.from("eventos").update(campos).eq("id", original.id);
    if (error) return { ok: false, error: mensaje(error) };
  } else {
    const { data, error } = await supabase.from("eventos").insert(campos).select("id").single();
    if (error || !data) return { ok: false, error: mensaje(error) };
    id = data.id as string;
  }
  const eventoId = id!;

  if (b.visibilidad === "compartida") {
    const antes = new Map((original?.visibilidad === "compartida" ? original.participantes : []).map((p) => [clave(p), p]));
    const despues = new Map(b.participantes.map((p) => [clave(p), p]));
    for (const [k, p] of despues) {
      if (antes.has(k)) continue;
      const { error } = await supabase
        .from("evento_participantes")
        .insert({ evento_id: eventoId, perfil_id: p.perfilId, grupo_id: p.grupoId });
      if (error) return { ok: false, error: mensaje(error) };
    }
    for (const [k, p] of antes) {
      if (despues.has(k)) continue;
      const q = supabase.from("evento_participantes").delete().eq("evento_id", eventoId);
      const { error } = await (p.perfilId ? q.eq("perfil_id", p.perfilId) : q.eq("grupo_id", p.grupoId!));
      if (error) return { ok: false, error: mensaje(error) };
    }
  }

  return releerEvento(supabase, eventoId);
}

async function releerEvento(supabase: SupabaseClient, id: string): Promise<Resultado> {
  const { data, error } = await supabase.from("eventos").select(SELECT_EVENTO).eq("id", id).single();
  if (error || !data) return { ok: false, error: mensaje(error) };
  return { ok: true, evento: eventoDeFila(data) };
}

/** "Eliminar" archiva; "Recuperar" lo devuelve. Nunca se borra. */
export async function archivarEvento(supabase: SupabaseClient, id: string, archivado: boolean): Promise<Resultado> {
  const { error } = await supabase.from("eventos").update({ archivado }).eq("id", id);
  if (error) return { ok: false, error: mensaje(error) };
  return releerEvento(supabase, id);
}

export interface HistorialEvento {
  id: string;
  tipo: string;
  detalle: Record<string, unknown>;
  actorNombre: string | null;
  creadoEn: string;
}

export async function historialEvento(supabase: SupabaseClient, id: string): Promise<HistorialEvento[]> {
  const { data } = await supabase
    .from("evento_historial")
    .select("id, tipo, detalle, actor_nombre, creado_en")
    .eq("evento_id", id)
    .order("creado_en", { ascending: false });
  return (data ?? []).map((e) => ({
    id: e.id,
    tipo: e.tipo,
    detalle: (e.detalle ?? {}) as Record<string, unknown>,
    actorNombre: e.actor_nombre,
    creadoEn: e.creado_en,
  }));
}

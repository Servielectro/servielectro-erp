// Escrituras del tablero y la agenda, desde el navegador con la sesión del usuario. La
// base decide (RLS, reglas, dependencias, historial); acá solo se arma el envío y se
// devuelve el mensaje de la base tal cual, que ya está escrito para el usuario.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  faltaResponsable,
  SELECT_TAREA,
  SELECT_TAREA_SIN_54,
  tareaDeFila,
  type EstadoTarea,
  type Participante,
  type PrioridadTarea,
  type Tarea,
  type VisibilidadTarea,
} from "./tareas";

export interface BorradorTarea {
  titulo: string;
  descripcion: string;
  estado: EstadoTarea;
  prioridad: PrioridadTarea;
  visibilidad: VisibilidadTarea;
  /** "p:<id>" | "v:<id>" | "" */
  obra: string;
  fechaProgramada: string;
  hora: string;
  fechaLimite: string;
  asignados: string[];
  /** Solo en "compartida": personas y grupos. */
  participantes: Participante[];
  subtareas: { id: string | null; titulo: string; hecha: boolean; responsableId: string | null }[];
  dependencias: { bloqueanteId: string; tipo: "para_empezar" | "para_cerrar" }[];
  nota: string;
  /** Solo al crear: la sugerencia del técnico de la que sale la tarea. */
  sugerenciaId?: string | null;
}

export function borradorVacio(estado: EstadoTarea = "por_hacer"): BorradorTarea {
  return {
    titulo: "",
    descripcion: "",
    estado,
    prioridad: "media",
    visibilidad: "interna",
    obra: "",
    fechaProgramada: "",
    hora: "",
    fechaLimite: "",
    asignados: [],
    participantes: [],
    subtareas: [],
    dependencias: [],
    nota: "",
  };
}

export function borradorDe(t: Tarea): BorradorTarea {
  return {
    titulo: t.titulo,
    descripcion: t.descripcion ?? "",
    estado: t.estado,
    prioridad: t.prioridad,
    visibilidad: t.visibilidad,
    obra: t.proyectoId ? `p:${t.proyectoId}` : t.visitaId ? `v:${t.visitaId}` : "",
    fechaProgramada: t.fechaProgramada ?? "",
    hora: t.hora ?? "",
    fechaLimite: t.fechaLimite ?? "",
    asignados: [...t.asignados],
    participantes: t.participantes.map((p) => ({ ...p })),
    subtareas: t.subtareas.map((s) => ({ id: s.id, titulo: s.titulo, hecha: s.hecha, responsableId: s.responsableId })),
    dependencias: t.dependencias.map((d) => ({ ...d })),
    nota: "",
  };
}

type Resultado = { ok: true; tarea: Tarea } | { ok: false; error: string };

function mensaje(e: { message?: string } | null | undefined): string {
  const m = e?.message ?? "No se pudo guardar.";
  if (/failed to fetch|network|load failed/i.test(m)) {
    return "No hay conexión: la tarea NO se guardó. Sigue escrita aquí; vuelve a intentar cuando tengas señal.";
  }
  if (/row-level security/i.test(m)) return "No tienes permiso para eso.";
  return m;
}

/**
 * Crea o actualiza una tarea con sus hijos. Si algo falla, devuelve el error y lo que ya
 * quedó guardado no se deshace (la base no deja estados inválidos; el historial lo cuenta).
 * `soloMover`: el asignado que no es Operativo ni la creó solo cambia el estado.
 */
export async function guardarTarea(
  supabase: SupabaseClient,
  original: Tarea | null,
  b: BorradorTarea,
  opciones: { soloMover: boolean; ordenNueva?: number; conResponsable?: boolean },
): Promise<Resultado> {
  if (!b.titulo.trim()) return { ok: false, error: "Falta el título." };
  if (b.hora && !b.fechaProgramada) return { ok: false, error: "Para poner hora, elige también el día." };

  let id = original?.id ?? null;
  const clave = (p: Participante) => (p.perfilId ? `p:${p.perfilId}` : `g:${p.grupoId}`);

  // Deja de ser compartida: primero se quita a los participantes (la base no deja cambiarla
  // con participantes adentro; así nadie queda viendo una tarea que ya no es compartida).
  if (!opciones.soloMover && original?.visibilidad === "compartida" && b.visibilidad !== "compartida") {
    const { error } = await supabase.from("tarea_participantes").delete().eq("tarea_id", original.id);
    if (error) return { ok: false, error: mensaje(error) };
  }

  if (opciones.soloMover && original) {
    if (b.estado !== original.estado) {
      const { error } = await supabase.from("tareas").update({ estado: b.estado }).eq("id", original.id);
      if (error) return { ok: false, error: mensaje(error) };
    }
  } else {
    const campos = {
      titulo: b.titulo.trim(),
      descripcion: b.descripcion.trim() || null,
      estado: b.estado,
      prioridad: b.prioridad,
      visibilidad: b.visibilidad,
      proyecto_id: b.obra.startsWith("p:") ? b.obra.slice(2) : null,
      visita_id: b.obra.startsWith("v:") ? b.obra.slice(2) : null,
      fecha_programada: b.fechaProgramada || null,
      // Sin hora no se inventa 00:00: queda nula.
      hora: b.hora || null,
      fecha_limite: b.fechaLimite || null,
    };
    if (original) {
      const { error } = await supabase.from("tareas").update(campos).eq("id", original.id);
      if (error) return { ok: false, error: mensaje(error) };
    } else {
      const { data, error } = await supabase
        .from("tareas")
        .insert({ ...campos, orden: opciones.ordenNueva ?? 1000, sugerencia_id: b.sugerenciaId ?? null })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: mensaje(error) };
      id = data.id as string;
    }
  }
  const tareaId = id!;

  // Asignados (solo en equipo, y solo quien puede asignar: la base lo exige igual).
  if (!opciones.soloMover && b.visibilidad === "equipo") {
    const antes = new Set(original?.asignados ?? []);
    const despues = new Set(b.asignados);
    const nuevos = [...despues].filter((p) => !antes.has(p));
    const quitados = [...antes].filter((p) => !despues.has(p));
    if (nuevos.length) {
      const { error } = await supabase.from("tarea_asignados").insert(nuevos.map((p) => ({ tarea_id: tareaId, perfil_id: p })));
      if (error) return { ok: false, error: mensaje(error) };
    }
    for (const p of quitados) {
      const { error } = await supabase.from("tarea_asignados").delete().eq("tarea_id", tareaId).eq("perfil_id", p);
      if (error) return { ok: false, error: mensaje(error) };
    }
  }

  // Participantes (compartida): personas y grupos. Solo quien la creó (la base lo exige).
  if (!opciones.soloMover && b.visibilidad === "compartida") {
    const antes = new Map((original?.visibilidad === "compartida" ? original.participantes : []).map((p) => [clave(p), p]));
    const despues = new Map(b.participantes.map((p) => [clave(p), p]));
    for (const [k, p] of despues) {
      if (antes.has(k)) continue;
      const { error } = await supabase
        .from("tarea_participantes")
        .insert({ tarea_id: tareaId, perfil_id: p.perfilId, grupo_id: p.grupoId });
      if (error) return { ok: false, error: mensaje(error) };
    }
    for (const [k, p] of antes) {
      if (despues.has(k)) continue;
      const q = supabase.from("tarea_participantes").delete().eq("tarea_id", tareaId);
      const { error } = await (p.perfilId ? q.eq("perfil_id", p.perfilId) : q.eq("grupo_id", p.grupoId!));
      if (error) return { ok: false, error: mensaje(error) };
    }
  }

  // Subtareas: el asignado o participante también las marca.
  const conResponsable = opciones.conResponsable !== false;
  const previas = new Map((original?.subtareas ?? []).map((s) => [s.id, s]));
  let orden = 0;
  for (const s of b.subtareas) {
    orden += 1000;
    if (!s.id) {
      const fila: Record<string, unknown> = { tarea_id: tareaId, titulo: s.titulo, hecha: s.hecha, orden };
      if (conResponsable && s.responsableId) fila.responsable_id = s.responsableId;
      const { error } = await supabase.from("tarea_subtareas").insert(fila);
      if (error) return { ok: false, error: mensaje(error) };
    } else {
      const p = previas.get(s.id);
      previas.delete(s.id);
      if (!p) continue;
      const cambios: Record<string, unknown> = {};
      if (p.hecha !== s.hecha) cambios.hecha = s.hecha;
      if (p.titulo !== s.titulo) cambios.titulo = s.titulo;
      if (conResponsable && p.responsableId !== s.responsableId) cambios.responsable_id = s.responsableId;
      if (Object.keys(cambios).length) {
        const { error } = await supabase.from("tarea_subtareas").update(cambios).eq("id", s.id);
        if (error) return { ok: false, error: mensaje(error) };
      }
    }
  }
  for (const quitada of previas.keys()) {
    const { error } = await supabase.from("tarea_subtareas").delete().eq("id", quitada);
    if (error) return { ok: false, error: mensaje(error) };
  }

  // Dependencias.
  // (No hay política de update en tarea_dependencias: cambiar el tipo es quitar y volver a
  //  poner, y el historial registra las dos cosas.)
  if (!opciones.soloMover) {
    const antes = new Map((original?.dependencias ?? []).map((d) => [d.bloqueanteId, d.tipo]));
    const despues = new Map(b.dependencias.map((d) => [d.bloqueanteId, d.tipo]));
    for (const [bloqueante, tipoAntes] of antes) {
      if (despues.get(bloqueante) === tipoAntes) continue;
      const { error } = await supabase.from("tarea_dependencias").delete().eq("tarea_id", tareaId).eq("bloqueante_id", bloqueante);
      if (error) return { ok: false, error: mensaje(error) };
    }
    for (const [bloqueante, tipo] of despues) {
      if (antes.get(bloqueante) === tipo) continue;
      const { error } = await supabase.from("tarea_dependencias").insert({ tarea_id: tareaId, bloqueante_id: bloqueante, tipo });
      if (error) return { ok: false, error: mensaje(error) };
    }
  }

  // Nota de seguimiento: la única vía de escribir en el historial.
  if (b.nota.trim()) {
    const { error } = await supabase.rpc("fn_nota_tarea", { p_tarea_id: tareaId, p_nota: b.nota.trim() });
    if (error) return { ok: false, error: mensaje(error) };
  }

  return releer(supabase, tareaId);
}

async function releer(supabase: SupabaseClient, tareaId: string): Promise<Resultado> {
  let res = await supabase.from("tareas").select(SELECT_TAREA).eq("id", tareaId).single();
  if (faltaResponsable(res.error)) res = await supabase.from("tareas").select(SELECT_TAREA_SIN_54).eq("id", tareaId).single();
  if (res.error || !res.data) return { ok: false, error: mensaje(res.error) };
  return { ok: true, tarea: tareaDeFila(res.data) };
}

/** Mover de columna (arrastrar o marcar hecha): estado y orden. */
export async function moverTarea(
  supabase: SupabaseClient,
  id: string,
  estado: EstadoTarea,
  orden: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("tareas").update({ estado, orden }).eq("id", id);
  return error ? { ok: false, error: mensaje(error) } : { ok: true };
}

export async function archivarTarea(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("tareas").update({ archivada: true }).eq("id", id);
  return error ? { ok: false as const, error: mensaje(error) } : { ok: true as const };
}

/** Saca del archivo: lo que promete la confirmación de "Eliminar". */
export async function recuperarTarea(supabase: SupabaseClient, id: string): Promise<Resultado> {
  const { error } = await supabase.from("tareas").update({ archivada: false }).eq("id", id);
  if (error) return { ok: false, error: mensaje(error) };
  return releer(supabase, id);
}

export interface EventoTarea {
  id: string;
  tipo: string;
  detalle: Record<string, unknown>;
  nota: string | null;
  actorNombre: string | null;
  creadoEn: string;
}

export async function historialTarea(supabase: SupabaseClient, id: string): Promise<EventoTarea[]> {
  const { data } = await supabase
    .from("tarea_eventos")
    .select("id, tipo, detalle, nota, actor_nombre, creado_en")
    .eq("tarea_id", id)
    .order("creado_en", { ascending: false });
  return (data ?? []).map((e) => ({
    id: e.id,
    tipo: e.tipo,
    detalle: (e.detalle ?? {}) as Record<string, unknown>,
    nota: e.nota,
    actorNombre: e.actor_nombre,
    creadoEn: e.creado_en,
  }));
}

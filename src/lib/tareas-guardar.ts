// Escrituras del tablero y la agenda, desde el navegador con la sesión del usuario. La
// base decide (RLS, reglas, dependencias, historial); acá solo se arma el envío y se
// devuelve el mensaje de la base tal cual, que ya está escrito para el usuario.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SELECT_TAREA, tareaDeFila, type EstadoTarea, type PrioridadTarea, type Tarea, type VisibilidadTarea } from "./tareas";

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
  subtareas: { id: string | null; titulo: string; hecha: boolean }[];
  dependencias: { bloqueanteId: string; tipo: "para_empezar" | "para_cerrar" }[];
  nota: string;
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
    subtareas: t.subtareas.map((s) => ({ id: s.id, titulo: s.titulo, hecha: s.hecha })),
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
  opciones: { soloMover: boolean; ordenNueva?: number },
): Promise<Resultado> {
  if (!b.titulo.trim()) return { ok: false, error: "Falta el título." };
  if (b.hora && !b.fechaProgramada) return { ok: false, error: "Para poner hora, elige también el día." };

  let id = original?.id ?? null;

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
        .insert({ ...campos, orden: opciones.ordenNueva ?? 1000 })
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

  // Subtareas: el asignado también las marca.
  const previas = new Map((original?.subtareas ?? []).map((s) => [s.id, s]));
  let orden = 0;
  for (const s of b.subtareas) {
    orden += 1000;
    if (!s.id) {
      const { error } = await supabase.from("tarea_subtareas").insert({ tarea_id: tareaId, titulo: s.titulo, hecha: s.hecha, orden });
      if (error) return { ok: false, error: mensaje(error) };
    } else {
      const p = previas.get(s.id);
      previas.delete(s.id);
      if (p && (p.hecha !== s.hecha || p.titulo !== s.titulo)) {
        const { error } = await supabase.from("tarea_subtareas").update({ hecha: s.hecha, titulo: s.titulo }).eq("id", s.id);
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

  const { data, error } = await supabase.from("tareas").select(SELECT_TAREA).eq("id", tareaId).single();
  if (error || !data) return { ok: false, error: mensaje(error) };
  return { ok: true, tarea: tareaDeFila(data) };
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

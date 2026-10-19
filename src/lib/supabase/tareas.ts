import type { SupabaseClient } from "@supabase/supabase-js";
import { faltaResponsable, SELECT_TAREA, SELECT_TAREA_SIN_54, tareaDeFila, type Obra, type Tarea } from "@/lib/tareas";

/**
 * Dónde se trabaja la tarea:
 *   - operativo: el tablero de obra (solo "equipo": proyecto o visita, asignados).
 *   - planificacion: las tareas administrativas (interna y compartida con personas o grupos).
 * Una tarea nunca mezcla los dos.
 */
export type ModoTareas = "operativo" | "planificacion";

export interface GrupoCompartir {
  id: string;
  nombre: string;
  miembros: number | null;
  /** Miembros sin Planificación: no la van a ver. null si la 55 no está corrida. */
  sinPlanificacion: number | null;
}

export interface DatosTareas {
  yo: string;
  modo: ModoTareas;
  /** operativo: operativo/trabajar (crea de obra y asigna) · planificacion: planificacion/trabajar. */
  puedeAsignar: boolean;
  tareas: Tarea[];
  /** Las archivadas propias (o de obra), para "Archivadas" → Recuperar. */
  archivadas: Tarea[];
  obras: Obra[];
  personas: { id: string; nombre: string }[];
  grupos: GrupoCompartir[];
  /** false mientras la migración 54 no esté corrida: no se ofrece responsable de subtarea. */
  conResponsable: boolean;
  error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any>;

/** Pide tareas con el responsable de subtarea; si la 54 no está corrida, sin él. */
async function pedirTareas(supabase: Cliente, armar: (select: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const primero = await armar(SELECT_TAREA);
  if (!faltaResponsable(primero.error)) return { ...primero, conResponsable: true };
  const segundo = await armar(SELECT_TAREA_SIN_54);
  return { ...segundo, conResponsable: false };
}

export async function cargarGrupos(supabase: Cliente): Promise<GrupoCompartir[]> {
  const res = await supabase.rpc("fn_grupos_para_compartir");
  if (!res.error) {
    return ((res.data ?? []) as { id: string; nombre: string; miembros: number; sin_planificacion: number }[]).map((g) => ({
      id: g.id,
      nombre: g.nombre,
      miembros: g.miembros,
      sinPlanificacion: g.sin_planificacion,
    }));
  }
  // Sin la 55: los grupos que la RLS deja ver (los propios), sin cantidades.
  const directo = await supabase.from("grupos").select("id, nombre").eq("archivado", false).order("nombre");
  return ((directo.data ?? []) as { id: string; nombre: string }[]).map((g) => ({ ...g, miembros: null, sinPlanificacion: null }));
}

/**
 * Lo que necesitan el tablero y la agenda. Todo con la sesión del usuario: la RLS decide
 * qué tareas ve. Las obras: los proyectos salen de fn_proyectos_para_tareas() (solo id,
 * código y nombre; nunca de la tabla proyectos, que trae datos comerciales) y las visitas
 * de las que el usuario puede ver.
 */
export async function cargarDatosTareas(
  supabase: Cliente,
  yo: string,
  puedeAsignar: boolean,
  modo: ModoTareas = "operativo",
): Promise<DatosTareas> {
  const visibilidades = modo === "operativo" ? ["equipo"] : ["interna", "compartida"];
  const [tareasRes, archivadasRes, proyectosRes, visitasRes, personasRes, grupos] = await Promise.all([
    pedirTareas(supabase, (select) =>
      supabase.from("tareas").select(select).eq("archivada", false).in("visibilidad", visibilidades).order("orden"),
    ),
    pedirTareas(supabase, (select) =>
      supabase
        .from("tareas")
        .select(select)
        .eq("archivada", true)
        .in("visibilidad", visibilidades)
        .order("updated_at", { ascending: false })
        .limit(100),
    ),
    supabase.rpc("fn_proyectos_para_tareas"),
    supabase.from("visitas").select("id, titulo, cliente_nombre").order("fecha_programada", { ascending: false }).limit(200),
    !puedeAsignar
      ? Promise.resolve({ data: [], error: null })
      : modo === "operativo"
        ? supabase.rpc("fn_personas_asignables")
        : supabase.rpc("fn_personas_planificacion"),
    modo === "planificacion" && puedeAsignar ? cargarGrupos(supabase) : Promise.resolve([] as GrupoCompartir[]),
  ]);

  const obras: Obra[] = [
    ...((proyectosRes.data ?? []) as { id: string; codigo: string; nombre: string }[]).map((p) => ({
      clave: `p:${p.id}`,
      nombre: p.codigo ? `${p.codigo} · ${p.nombre}` : p.nombre,
    })),
    ...((visitasRes.data ?? []) as { id: string; titulo: string; cliente_nombre: string | null }[]).map((v) => ({
      clave: `v:${v.id}`,
      nombre: v.cliente_nombre ? `${v.titulo} · ${v.cliente_nombre}` : v.titulo,
    })),
  ];

  return {
    yo,
    modo,
    puedeAsignar,
    tareas: (tareasRes.data ?? []).map(tareaDeFila),
    archivadas: archivadasRes.error ? [] : (archivadasRes.data ?? []).map(tareaDeFila),
    obras,
    personas: (personasRes.data ?? []) as { id: string; nombre: string }[],
    grupos,
    conResponsable: tareasRes.conResponsable,
    error: tareasRes.error
      ? /tarea_participantes|compartida/i.test(tareasRes.error.message)
        ? "Falta correr la migración 53 en la base."
        : /tareas|does not exist|schema cache/i.test(tareasRes.error.message)
          ? "Falta correr la migración 50 en la base."
          : tareasRes.error.message
      : null,
  };
}

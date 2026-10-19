import type { SupabaseClient } from "@supabase/supabase-js";
import { SELECT_TAREA, tareaDeFila, type Obra, type Tarea } from "@/lib/tareas";

export interface DatosTareas {
  yo: string;
  /** operativo/trabajar: crea tareas de equipo y asigna. */
  puedeAsignar: boolean;
  tareas: Tarea[];
  obras: Obra[];
  personas: { id: string; nombre: string }[];
  error: string | null;
}

/**
 * Lo que necesitan el tablero y la agenda. Todo con la sesión del usuario: la RLS decide
 * qué tareas ve. Las obras: los proyectos salen de fn_proyectos_para_tareas() (solo id,
 * código y nombre; nunca de la tabla proyectos, que trae datos comerciales) y las visitas
 * de las que el usuario puede ver.
 */
export async function cargarDatosTareas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  yo: string,
  puedeAsignar: boolean,
): Promise<DatosTareas> {
  const [tareasRes, proyectosRes, visitasRes, personasRes] = await Promise.all([
    supabase.from("tareas").select(SELECT_TAREA).eq("archivada", false).order("orden"),
    supabase.rpc("fn_proyectos_para_tareas"),
    supabase.from("visitas").select("id, titulo, cliente_nombre").order("fecha_programada", { ascending: false }).limit(200),
    puedeAsignar ? supabase.rpc("fn_personas_asignables") : Promise.resolve({ data: [], error: null }),
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
    puedeAsignar,
    tareas: (tareasRes.data ?? []).map(tareaDeFila),
    obras,
    personas: (personasRes.data ?? []) as { id: string; nombre: string }[],
    error: tareasRes.error
      ? /tareas|does not exist|schema cache/i.test(tareasRes.error.message)
        ? "Falta correr la migración 50 en la base."
        : tareasRes.error.message
      : null,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Proyectos (migración 63). Dos lecturas distintas, a propósito:
//   - getProyectosNombres: solo id, código, nombre y estado, por fn_proyectos_nombres(). La
//     usan Operativo y RRHH, que no pueden leer la tabla (trae cliente, cotización y contrato).
//   - la tabla proyectos: solo el módulo Proyectos o Comercial (RLS proyectos_select).

export type EstadoProyecto = "EN_EJECUCION" | "SUSPENDIDO" | "CERRADO";

export const ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  EN_EJECUCION: "En ejecución",
  SUSPENDIDO: "Suspendido",
  CERRADO: "Cerrado",
};

export interface ProyectoNombre {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoProyecto;
}

/** Null si la función no existe todavía (migración 63 sin correr) o no hay permiso. */
export async function getProyectosNombres(supabase: SupabaseClient): Promise<ProyectoNombre[] | null> {
  const { data, error } = await supabase.rpc("fn_proyectos_nombres");
  if (error) return null;
  return (data ?? []) as ProyectoNombre[];
}

export interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoProyecto;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  cliente_id: string | null;
  cotizacion_aprobada_id: string | null;
  created_at: string;
}

export const COLUMNAS_PROYECTO =
  "id, codigo, nombre, estado, descripcion, fecha_inicio, fecha_fin_estimada, cliente_id, cotizacion_aprobada_id, created_at";

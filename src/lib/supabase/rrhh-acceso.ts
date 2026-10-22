import type { SupabaseClient } from "@supabase/supabase-js";

// Quién puede qué en las pantallas de RRHH (migración 64). Todo sale de funciones de la base:
//   - veTodo: RRHH "trabajar" (fn_rrhh_ve_todo). "Consultar" NO alcanza para ver lo ajeno.
//   - apruebaPermisos / apruebaAbonos: estar en rrhh_aprobadores (hoy, solo Jhojan).
// Las pantallas usan esto para mostrar u ocultar botones; quien protege los datos es la RLS.

export interface AccesoRrhh {
  yo: string;
  veTodo: boolean;
  apruebaPermisos: boolean;
  apruebaAbonos: boolean;
  personas: { id: string; nombre: string }[];
}

export async function getAccesoRrhh(supabase: SupabaseClient, yo: string): Promise<AccesoRrhh> {
  const [veTodo, permisos, abonos, personas] = await Promise.all([
    supabase.rpc("fn_rrhh_ve_todo"),
    supabase.rpc("fn_es_aprobador_rrhh", { p_que: "permisos" }),
    supabase.rpc("fn_es_aprobador_rrhh", { p_que: "abonos" }),
    supabase.rpc("fn_personas_rrhh"),
  ]);
  return {
    yo,
    veTodo: veTodo.data === true,
    apruebaPermisos: permisos.data === true,
    apruebaAbonos: abonos.data === true,
    personas: (personas.data ?? []) as { id: string; nombre: string }[],
  };
}

/** Primer día de la quincena (1 o 16) de una fecha AAAA-MM-DD. */
export function inicioQuincena(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${a}-${m}-${Number(d) <= 15 ? "01" : "16"}`;
}

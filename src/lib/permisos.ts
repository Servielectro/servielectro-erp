import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Lectura de permisos del usuario actual (Fase 2a). Todo sale de las funciones
// fn_tiene_permiso / fn_mis_permisos de la base: acá no hay reglas propias.
//
// Ocultar módulos en la home y el menú es comodidad. Lo que protege las pantallas
// es requierePermiso() en cada layout/página del servidor, y lo que protege los
// datos es la RLS.

export type NivelPermiso = "consultar" | "trabajar" | "responsable";

export interface PermisoModulo {
  nivel: NivelPermiso;
  veDatosSensibles: boolean;
}

export type MisPermisos = Record<string, PermisoModulo>;

export async function getMisPermisos(): Promise<MisPermisos> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mis_permisos");
  // Si falla, sin permisos: mejor no mostrar nada que mostrar de más.
  if (error || !data) return {};
  const permisos: MisPermisos = {};
  for (const fila of data as {
    modulo_id: string;
    nivel: NivelPermiso;
    ve_datos_sensibles: boolean;
  }[]) {
    permisos[fila.modulo_id] = {
      nivel: fila.nivel,
      veDatosSensibles: fila.ve_datos_sensibles,
    };
  }
  return permisos;
}

export async function tienePermiso(
  modulo: string,
  nivelMinimo: NivelPermiso,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_tiene_permiso", {
    p_modulo: modulo,
    p_nivel_minimo: nivelMinimo,
  });
  return !error && data === true;
}

/** Para layouts y páginas: sin el permiso, de vuelta al inicio. */
export async function requierePermiso(modulo: string, nivelMinimo: NivelPermiso) {
  if (!(await tienePermiso(modulo, nivelMinimo))) redirect("/");
}

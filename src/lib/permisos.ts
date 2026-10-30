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

/**
 * Qué muestra el menú global. Cada entrada se muestra solo si el usuario puede ABRIR esa
 * pantalla con el mismo nivel que exige su layout: /tecnico pide tecnico/trabajar, así que
 * alguien con tecnico/consultar no ve la entrada (si la viera, lo devolvería al inicio).
 */
export function accesosDeMenu(permisos: MisPermisos) {
  const alMenos = (modulo: string, nivel: NivelPermiso) => {
    const p = permisos[modulo];
    if (!p) return false;
    const rango = { consultar: 1, trabajar: 2, responsable: 3 } as const;
    return rango[p.nivel] >= rango[nivel];
  };
  return {
    modulos: Object.keys(permisos),
    baseDatos: permisos.comercial?.nivel === "responsable",
    campoTecnico: alMenos("tecnico", "trabajar"),
    planificacion: alMenos("planificacion", "trabajar"),
    configResponsable: alMenos("configuracion", "responsable"),
    administrativoTrabajar: alMenos("administrativo", "trabajar"),
    sgsstTrabajar: alMenos("sgsst", "trabajar"),
  };
}

/**
 * Permisos por sección (migración 122). Las secciones viven en la base (modulo_secciones); el rol
 * puede tener recortadas algunas. Devuelve las rutas de las que esta persona NO ve, y la de cada
 * sección para saber a cuál pertenece una ruta. Si la 122 no está, nada se oculta.
 */
export async function seccionesOcultas(): Promise<{ ocultas: string[]; todas: string[] }> {
  const supabase = await createClient();
  const [todasRes, misRes] = await Promise.all([
    supabase.from("modulo_secciones").select("href"),
    supabase.rpc("fn_mis_secciones"),
  ]);
  if (todasRes.error || misRes.error) return { ocultas: [], todas: [] };
  const todas = ((todasRes.data ?? []) as { href: string }[]).map((s) => s.href);
  const mias = new Set(((misRes.data ?? []) as { href: string }[]).map((s) => s.href));
  return { ocultas: todas.filter((h) => !mias.has(h)), todas };
}

/** La sección (su ruta) a la que pertenece una ruta: la más específica que la contenga. */
export function seccionDeRuta(ruta: string, todas: string[]): string | null {
  const candidatas = todas.filter((h) => ruta === h || ruta.startsWith(`${h}/`));
  return candidatas.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Para layouts y páginas: sin el permiso, de vuelta al inicio. */
export async function requierePermiso(modulo: string, nivelMinimo: NivelPermiso) {
  if (!(await tienePermiso(modulo, nivelMinimo))) redirect("/");
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Usuario de demostración (migraciones 116 a 118). La base decide quién es demo (fn_es_demo), borra
// a las 5 horas lo que crea y no le deja cambiar lo que no creó. Aquí, solo lo de pantalla.

/** Jhojan: en Técnico y Operativo el demo ve SOLO la visita de Miguel. */
const TECNICO_VISIBLE_EN_DEMO = "miguel";
/** Un id que no existe: si no se encuentra a Miguel, el demo no ve ninguna visita (mejor que todas). */
export const NINGUNO = "00000000-0000-0000-0000-000000000000";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El técnico cuyas visitas ve el demo: el único que se llama Miguel. Si hay cero o varios, ninguno. */
export async function tecnicoVisibleEnDemo(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.rpc("fn_tecnicos_asignables");
  const miguel = ((data ?? []) as { id: string; nombre: string }[]).filter((t) => sinTildes(t.nombre).startsWith(TECNICO_VISIBLE_EN_DEMO));
  return miguel.length === 1 ? miguel[0].id : NINGUNO;
}

export async function esDemo(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("fn_es_demo");
  return !error && data === true;
}

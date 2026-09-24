"use server";

import { createClient } from "@/lib/supabase/server";
import type { Categoria } from "@/lib/pricing";

export async function actualizarCategoriaEnLote(
  itemIds: string[],
  categoria: Categoria,
): Promise<{ ok: true; actualizados: number } | { ok: false; error: string }> {
  if (itemIds.length === 0) {
    return { ok: false, error: "No hay ítems seleccionados" };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("items_catalogo")
    .update({ categoria }, { count: "exact" })
    .in("id", itemIds);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, actualizados: count ?? itemIds.length };
}

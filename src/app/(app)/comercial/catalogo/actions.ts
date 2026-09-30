"use server";

import { createClient } from "@/lib/supabase/server";
import type { Categoria } from "@/lib/pricing";
import { tienePermiso } from "@/lib/permisos";

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

/**
 * Carga manual de precios en lote (pantalla Catálogo → Cargar precios). Cada precio es
 * un registro NUEVO en items_precios_historico, con fecha y usuario: nunca se pisa el
 * anterior, así el historial de precios queda completo.
 */
export async function guardarPreciosLote(
  precios: { itemId: string; valor: number }[],
): Promise<{ ok: true; guardados: number } | { ok: false; error: string }> {
  if (!(await tienePermiso("comercial", "trabajar"))) {
    return { ok: false, error: "No tienes permiso para cargar precios" };
  }
  const validos = precios.filter((p) => p.itemId && Number.isFinite(p.valor) && p.valor > 0);
  if (validos.length === 0) return { ok: false, error: "No hay precios para guardar" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("items_precios_historico").insert(
    validos.map((p) => ({
      item_id: p.itemId,
      valor_compra_iva: p.valor,
      fuente: "MANUAL",
      observaciones: "Carga manual en lote",
      created_by: user?.id ?? null,
    })),
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, guardados: validos.length };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Categoria } from "@/lib/pricing";

export interface CatalogoItem {
  id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  categoria: Categoria;
  proveedor: string | null;
  referencia: string | null;
  factorRentabilidadLinea: number;
  valorCompraIva: number | null;
  precioActualizadoEn: string | null;
}

export async function getCatalogoActivo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<CatalogoItem[]> {
  const { data, error } = await supabase
    .from("v_items_catalogo_con_precio")
    .select(
      "id, codigo, descripcion, unidad, categoria, proveedor, referencia, factor_rentabilidad_linea, valor_compra_iva, precio_actualizado_en",
    )
    .eq("activo", true)
    .order("descripcion");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    codigo: row.codigo,
    descripcion: row.descripcion,
    unidad: row.unidad,
    categoria: row.categoria,
    proveedor: row.proveedor,
    referencia: row.referencia,
    factorRentabilidadLinea: Number(row.factor_rentabilidad_linea),
    valorCompraIva:
      row.valor_compra_iva === null ? null : Number(row.valor_compra_iva),
    precioActualizadoEn: row.precio_actualizado_en,
  }));
}

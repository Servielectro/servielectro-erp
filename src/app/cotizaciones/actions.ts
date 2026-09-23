"use server";

import { createClient } from "@/lib/supabase/server";
import type { Categoria } from "@/lib/pricing";

export interface NuevoItemCatalogoInput {
  codigo: string;
  descripcion: string;
  unidad: string;
  categoria: Categoria;
  proveedor: string;
  referencia: string;
  valorCompraIva: number;
  factorRentabilidadLinea: number;
  fecha: string; // yyyy-mm-dd
}

export interface NuevoItemCatalogoResult {
  id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  categoria: Categoria;
  proveedor: string | null;
  referencia: string | null;
  factorRentabilidadLinea: number;
}

export async function crearItemCatalogo(
  input: NuevoItemCatalogoInput,
): Promise<
  { ok: true; item: NuevoItemCatalogoResult } | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("fn_crear_item_catalogo", {
      p_codigo: input.codigo,
      p_descripcion: input.descripcion,
      p_unidad: input.unidad,
      p_categoria: input.categoria,
      p_proveedor: input.proveedor || null,
      p_referencia: input.referencia || null,
      p_valor_compra_iva: input.valorCompraIva,
      p_factor_rentabilidad_linea: input.factorRentabilidadLinea,
      p_fecha: input.fecha,
    })
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  const item = data as {
    id: string;
    codigo: string;
    descripcion: string;
    unidad: string;
    categoria: Categoria;
    proveedor: string | null;
    referencia: string | null;
    factor_rentabilidad_linea: number;
  };

  return {
    ok: true,
    item: {
      id: item.id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      unidad: item.unidad,
      categoria: item.categoria,
      proveedor: item.proveedor,
      referencia: item.referencia,
      factorRentabilidadLinea: Number(item.factor_rentabilidad_linea),
    },
  };
}

export interface LineaGuardarInput {
  categoria: Categoria;
  itemCatalogoId: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  valorCompraUnitario: number;
  factorRentabilidadLinea: number;
}

export interface GuardarCotizacionInput {
  clienteNombre: string;
  clienteNit: string;
  clienteDireccion: string;
  clienteEmail: string;
  clienteContacto: string;
  descripcion: string;
  comercial: string;
  esquemaIva: "IVA_FULL" | "IVA_AIU";
  factorRecargoProyecto: number;
  pctAdmin: number;
  pctImprevistos: number;
  pctUtilidadAiu: number;
  ivaPct: number;
  lineas: LineaGuardarInput[];
}

export async function guardarCotizacion(
  input: GuardarCotizacionInput,
): Promise<
  | { ok: true; cotizacionId: string; codigo: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_guardar_cotizacion_completa", {
    p_cliente_nombre: input.clienteNombre,
    p_cliente_id: null,
    p_esquema_iva: input.esquemaIva,
    p_descripcion: input.descripcion,
    p_factor_recargo_proyecto: input.factorRecargoProyecto,
    p_pct_admin: input.pctAdmin,
    p_pct_imprevistos: input.pctImprevistos,
    p_pct_utilidad_aiu: input.pctUtilidadAiu,
    p_iva_pct: input.ivaPct,
    p_lineas: input.lineas.map((l) => ({
      categoria: l.categoria,
      item_catalogo_id: l.itemCatalogoId ?? "",
      descripcion: l.descripcion,
      unidad: l.unidad,
      cantidad: l.cantidad,
      valor_compra_unitario: l.valorCompraUnitario,
      factor_rentabilidad_linea: l.factorRentabilidadLinea,
    })),
    p_comercial: input.comercial || null,
    p_cliente_nit: input.clienteNit || null,
    p_cliente_direccion: input.clienteDireccion || null,
    p_cliente_email: input.clienteEmail || null,
    p_cliente_contacto: input.clienteContacto || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const cotizacionId = data as string;

  const { data: cotizacion, error: errorCodigo } = await supabase
    .from("cotizaciones")
    .select("codigo")
    .eq("id", cotizacionId)
    .single();

  if (errorCodigo) {
    return { ok: false, error: errorCodigo.message };
  }

  return { ok: true, cotizacionId, codigo: cotizacion.codigo as string };
}

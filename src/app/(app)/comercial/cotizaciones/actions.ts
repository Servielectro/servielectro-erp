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
  descripcionLarga: string | null;
  unidad: string;
  cantidad: number;
  valorCompraUnitario: number;
  factorRentabilidadLinea: number;
}

export interface HitoGuardarInput {
  nombre: string;
  porcentaje: number;
}

export interface PolizaGuardarInput {
  polizaId: string | null;
  nombre: string;
}

export interface GuardarCotizacionInput {
  clienteId: string | null;
  clienteNombre: string;
  clienteNit: string;
  clienteDireccion: string;
  clienteEmail: string;
  clienteContacto: string;
  descripcion: string;
  comercial: string;
  esquemaIva: "IVA_FULL" | "IVA_AIU";
  pctAdmin: number;
  pctImprevistos: number;
  pctUtilidadAiu: number;
  pctAdminGasto: number;
  pctComision: number;
  lineas: LineaGuardarInput[];
  hitos: HitoGuardarInput[];
  polizas: PolizaGuardarInput[];
  diasEjecucion: number | null;
}

export async function crearPoliza(
  nombre: string,
): Promise<
  { ok: true; poliza: { id: string; nombre: string } } | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("polizas_catalogo")
    .insert({ nombre: nombre.trim() })
    .select("id, nombre")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, poliza: { id: data.id, nombre: data.nombre } };
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
    p_cliente_id: input.clienteId,
    p_esquema_iva: input.esquemaIva,
    p_descripcion: input.descripcion,
    p_pct_admin: input.pctAdmin,
    p_pct_imprevistos: input.pctImprevistos,
    p_pct_utilidad_aiu: input.pctUtilidadAiu,
    p_pct_admin_gasto: input.pctAdminGasto,
    p_pct_comision: input.pctComision,
    p_lineas: input.lineas.map((l) => ({
      categoria: l.categoria,
      item_catalogo_id: l.itemCatalogoId ?? "",
      descripcion: l.descripcion,
      descripcion_larga: l.descripcionLarga ?? "",
      unidad: l.unidad,
      cantidad: l.cantidad,
      valor_compra_unitario: l.valorCompraUnitario,
      factor_rentabilidad_linea: l.factorRentabilidadLinea,
    })),
    p_hitos:
      input.hitos.length > 0
        ? input.hitos.map((h) => ({
            nombre: h.nombre,
            porcentaje: h.porcentaje,
          }))
        : null,
    p_comercial: input.comercial || null,
    p_cliente_nit: input.clienteNit || null,
    p_cliente_direccion: input.clienteDireccion || null,
    p_cliente_email: input.clienteEmail || null,
    p_cliente_contacto: input.clienteContacto || null,
    p_polizas:
      input.polizas.length > 0
        ? input.polizas.map((p) => ({
            poliza_id: p.polizaId ?? "",
            nombre: p.nombre,
          }))
        : null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const cotizacionId = data as string;

  // Días de ejecución (migración 26) van aparte del RPC de guardado: es un dato del
  // documento, no del cálculo, y así no hubo que reescribir fn_guardar_cotizacion_completa.
  // Si falla, la cotización ya quedó guardada: se avisa, no se pierde nada más.
  if (input.diasEjecucion) {
    const { error: errorDias } = await supabase
      .from("cotizaciones")
      .update({ dias_ejecucion: input.diasEjecucion })
      .eq("id", cotizacionId);
    if (errorDias) {
      console.error("No se pudieron guardar los días de ejecución:", errorDias);
    }
  }

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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Categoria, EsquemaIva } from "@/lib/pricing";

export interface CotizacionListado {
  id: string;
  codigo: string;
  descripcion: string;
  estado: string;
  esquemaIva: EsquemaIva;
  comercial: string | null;
  clienteNombre: string;
  fechaEmision: string;
  totalCotizacion: number | null;
}

export async function getCotizacionesListado(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<CotizacionListado[]> {
  const { data, error } = await supabase
    .from("v_cotizaciones_listado")
    .select(
      "id, codigo, descripcion, estado, esquema_iva, comercial, cliente_nombre, fecha_emision, total_cotizacion",
    );

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    codigo: row.codigo,
    descripcion: row.descripcion,
    estado: row.estado,
    esquemaIva: row.esquema_iva,
    comercial: row.comercial,
    clienteNombre: row.cliente_nombre,
    fechaEmision: row.fecha_emision,
    totalCotizacion:
      row.total_cotizacion === null ? null : Number(row.total_cotizacion),
  }));
}

export interface CotizacionItemDetalle {
  id: string;
  categoria: Categoria;
  descripcion: string;
  descripcionLarga: string | null;
  unidad: string;
  cantidad: number;
  valorCompraUnitario: number;
  factorRentabilidadLinea: number;
  valorVentaUnitario: number;
  valorCalculoUnitario: number;
}

export interface HitoDetalle {
  id: string;
  orden: number;
  nombre: string;
  porcentaje: number;
  valorProgramado: number;
  estado: string;
}

export interface PolizaDetalle {
  id: string;
  polizaId: string | null;
  nombre: string;
  descripcion: string | null;
}

export interface CotizacionDetalle {
  id: string;
  codigo: string;
  descripcion: string;
  estado: string;
  esquemaIva: EsquemaIva;
  comercial: string | null;
  factorRecargoProyecto: number;
  pctAdmin: number;
  pctImprevistos: number;
  pctUtilidadAiu: number;
  pctAdminGasto: number;
  pctComision: number;
  ivaPct: number;
  fechaEmision: string;
  hitos: HitoDetalle[];
  polizas: PolizaDetalle[];
  cliente: {
    id: string;
    nombre: string;
    nit: string | null;
    direccion: string | null;
    email: string | null;
    contacto: string | null;
    telefono: string | null;
  };
  items: CotizacionItemDetalle[];
  totales: {
    subtotalCompra: number;
    subtotalVenta: number;
    subtotalCalculo: number;
    valorAdmin: number;
    valorImprevistos: number;
    valorUtilidadAiu: number;
    subtotalGeneral: number;
    ivaBaseMotivo: string;
    valorIva: number;
    totalCotizacion: number;
  } | null;
  capas: {
    gastoAdmin: number;
    gastoRenta: number;
    gastoIca: number;
    gastoComision: number;
    totalGastos: number;
    utilidadTotal: number;
    pctUtilidadTotal: number;
    impuestosATransferir: number;
  } | null;
}

export async function getCotizacionDetalle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  id: string,
): Promise<CotizacionDetalle | null> {
  const { data: cotizacion, error } = await supabase
    .from("cotizaciones")
    .select(
      "id, codigo, descripcion, estado, esquema_iva, comercial, factor_recargo_proyecto, pct_admin, pct_imprevistos, pct_utilidad_aiu, pct_admin_gasto_interno, pct_comision_comercial, iva_pct, fecha_emision, clientes(id, nombre, nit, direccion, email, contacto, telefono)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!cotizacion) return null;

  const { data: items, error: errorItems } = await supabase
    .from("cotizacion_items")
    .select(
      "id, categoria, descripcion, descripcion_larga, unidad, cantidad, valor_compra_unitario, factor_rentabilidad_linea, valor_venta_unitario, valor_calculo_unitario",
    )
    .eq("cotizacion_id", id)
    .order("orden");

  if (errorItems) throw errorItems;

  const { data: hitos } = await supabase
    .from("v_hitos_cotizacion")
    .select("id, orden, nombre, porcentaje, valor_programado, estado")
    .eq("cotizacion_id", id)
    .order("orden");

  const { data: polizas } = await supabase
    .from("v_cotizacion_polizas")
    .select("id, poliza_id, nombre, descripcion")
    .eq("cotizacion_id", id)
    .order("orden");

  const { data: totales } = await supabase
    .from("v_cotizacion_totales_iva")
    .select(
      "subtotal_compra, subtotal_venta, subtotal_calculo, valor_admin, valor_imprevistos, valor_utilidad_aiu, subtotal_general, iva_base_motivo, valor_iva, total_cotizacion",
    )
    .eq("cotizacion_id", id)
    .maybeSingle();

  const { data: capas } = await supabase
    .from("v_capas_utilidad")
    .select(
      "gasto_admin, gasto_renta, gasto_ica, gasto_comision, total_gastos, utilidad_total, pct_utilidad_total, impuestos_a_transferir",
    )
    .eq("cotizacion_id", id)
    .maybeSingle();

  const cliente = Array.isArray(cotizacion.clientes)
    ? cotizacion.clientes[0]
    : cotizacion.clientes;

  return {
    id: cotizacion.id,
    codigo: cotizacion.codigo,
    descripcion: cotizacion.descripcion,
    estado: cotizacion.estado,
    esquemaIva: cotizacion.esquema_iva,
    comercial: cotizacion.comercial,
    factorRecargoProyecto: Number(cotizacion.factor_recargo_proyecto),
    pctAdmin: Number(cotizacion.pct_admin),
    pctImprevistos: Number(cotizacion.pct_imprevistos),
    pctUtilidadAiu: Number(cotizacion.pct_utilidad_aiu),
    pctAdminGasto: Number(cotizacion.pct_admin_gasto_interno),
    pctComision: Number(cotizacion.pct_comision_comercial),
    ivaPct: Number(cotizacion.iva_pct),
    fechaEmision: cotizacion.fecha_emision,
    hitos: (hitos ?? []).map((h) => ({
      id: h.id,
      orden: h.orden,
      nombre: h.nombre,
      porcentaje: Number(h.porcentaje),
      valorProgramado: Number(h.valor_programado),
      estado: h.estado,
    })),
    polizas: (polizas ?? []).map((p) => ({
      id: p.id,
      polizaId: p.poliza_id,
      nombre: p.nombre,
      descripcion: p.descripcion,
    })),
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      nit: cliente.nit,
      direccion: cliente.direccion,
      email: cliente.email,
      contacto: cliente.contacto,
      telefono: cliente.telefono,
    },
    items: (items ?? []).map((it) => ({
      id: it.id,
      categoria: it.categoria,
      descripcion: it.descripcion,
      descripcionLarga: it.descripcion_larga,
      unidad: it.unidad,
      cantidad: Number(it.cantidad),
      valorCompraUnitario: Number(it.valor_compra_unitario),
      factorRentabilidadLinea: Number(it.factor_rentabilidad_linea),
      valorVentaUnitario: Number(it.valor_venta_unitario),
      valorCalculoUnitario: Number(it.valor_calculo_unitario),
    })),
    totales: totales
      ? {
          subtotalCompra: Number(totales.subtotal_compra),
          subtotalVenta: Number(totales.subtotal_venta),
          subtotalCalculo: Number(totales.subtotal_calculo),
          valorAdmin: Number(totales.valor_admin),
          valorImprevistos: Number(totales.valor_imprevistos),
          valorUtilidadAiu: Number(totales.valor_utilidad_aiu),
          subtotalGeneral: Number(totales.subtotal_general),
          ivaBaseMotivo: totales.iva_base_motivo,
          valorIva: Number(totales.valor_iva),
          totalCotizacion: Number(totales.total_cotizacion),
        }
      : null,
    capas: capas
      ? {
          gastoAdmin: Number(capas.gasto_admin),
          gastoRenta: Number(capas.gasto_renta),
          gastoIca: Number(capas.gasto_ica),
          gastoComision: Number(capas.gasto_comision),
          totalGastos: Number(capas.total_gastos),
          utilidadTotal: Number(capas.utilidad_total),
          pctUtilidadTotal: Number(capas.pct_utilidad_total),
          impuestosATransferir: Number(capas.impuestos_a_transferir),
        }
      : null,
  };
}

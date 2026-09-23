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
  unidad: string;
  cantidad: number;
  valorCompraUnitario: number;
  factorRentabilidadLinea: number;
  valorVentaUnitario: number;
  valorCalculoUnitario: number;
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
  ivaPct: number;
  fechaEmision: string;
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
}

export async function getCotizacionDetalle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  id: string,
): Promise<CotizacionDetalle | null> {
  const { data: cotizacion, error } = await supabase
    .from("cotizaciones")
    .select(
      "id, codigo, descripcion, estado, esquema_iva, comercial, factor_recargo_proyecto, pct_admin, pct_imprevistos, pct_utilidad_aiu, iva_pct, fecha_emision, clientes(id, nombre, nit, direccion, email, contacto, telefono)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!cotizacion) return null;

  const { data: items, error: errorItems } = await supabase
    .from("cotizacion_items")
    .select(
      "id, categoria, descripcion, unidad, cantidad, valor_compra_unitario, factor_rentabilidad_linea, valor_venta_unitario, valor_calculo_unitario",
    )
    .eq("cotizacion_id", id)
    .order("orden");

  if (errorItems) throw errorItems;

  const { data: totales } = await supabase
    .from("v_cotizacion_totales_iva")
    .select(
      "subtotal_compra, subtotal_venta, subtotal_calculo, valor_admin, valor_imprevistos, valor_utilidad_aiu, subtotal_general, iva_base_motivo, valor_iva, total_cotizacion",
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
    ivaPct: Number(cotizacion.iva_pct),
    fechaEmision: cotizacion.fecha_emision,
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
  };
}

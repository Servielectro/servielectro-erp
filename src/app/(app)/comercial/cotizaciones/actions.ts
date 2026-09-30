"use server";

import { createClient } from "@/lib/supabase/server";
import type { Categoria } from "@/lib/pricing";

export interface NuevoItemCatalogoInput {
  codigo: string;
  /** Nombre corto: buscador y columna Ítem del documento. */
  nombreCorto: string;
  /** Descripción para el cliente: columna Descripción del documento. */
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

  // fn_crear_item_catalogo pone el mismo texto como nombre corto y descripción; el
  // nombre corto se corrige aparte (evita reescribir la función). Si esto fallara, el
  // ítem queda igual de usable, con la descripción como nombre.
  const creado = data as { id: string };
  const nombreCorto = input.nombreCorto.trim();
  if (nombreCorto && nombreCorto !== input.descripcion) {
    const { error: errNombre } = await supabase
      .from("items_catalogo")
      .update({ nombre_corto: nombreCorto })
      .eq("id", creado.id);
    if (errNombre) console.error("No se pudo fijar el nombre corto:", errNombre);
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
  clienteTelefono: string;
  oportunidadId: string | null;
  descripcion: string;
  comercial: string;
  esquemaIva: "IVA_FULL" | "IVA_AIU";
  pctAdmin: number;
  pctImprevistos: number;
  pctUtilidadAiu: number;
  pctAdminGasto: number;
  pctComision: number;
  lineas: LineaGuardarInput[];
  // Precios escritos en la cotización que hay que llevar al catálogo.
  preciosCatalogo: { itemId: string; nombre: string; valor: number }[];
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
  | {
      ok: true;
      cotizacionId: string;
      codigo: string;
      avisoOportunidad: string | null;
      preciosGuardados: string[]; // nombres de los ítems cuyo precio quedó en el catálogo
      avisoPrecios: string | null;
    }
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
    .select("codigo, cliente_id")
    .eq("id", cotizacionId)
    .single();

  if (errorCodigo) {
    return { ok: false, error: errorCodigo.message };
  }

  // El RPC no recibe teléfono: se actualiza en el cliente aparte (no es parte del cálculo).
  if (input.clienteTelefono) {
    const { error: errTel } = await supabase
      .from("clientes")
      .update({ telefono: input.clienteTelefono })
      .eq("id", cotizacion.cliente_id);
    if (errTel) console.error("No se pudo guardar el teléfono del cliente:", errTel);
  }

  let avisoOportunidad: string | null = null;
  if (input.oportunidadId) {
    avisoOportunidad = await asociarAOportunidad(supabase, input.oportunidadId, cotizacionId);
  }

  const { guardados: preciosGuardados, aviso: avisoPrecios } = await guardarPreciosEnCatalogo(
    supabase,
    input.preciosCatalogo,
    cotizacion.codigo as string,
  );

  return {
    ok: true,
    cotizacionId,
    codigo: cotizacion.codigo as string,
    avisoOportunidad,
    preciosGuardados,
    avisoPrecios,
  };
}

/**
 * Precio escrito en la línea → historial de precios del ítem, con fecha y usuario.
 * Es un registro nuevo, nunca pisa el anterior: el historial queda completo. Si falla,
 * la cotización ya está guardada: se avisa sin deshacer nada.
 */
async function guardarPreciosEnCatalogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  precios: { itemId: string; nombre: string; valor: number }[],
  codigoCotizacion: string,
): Promise<{ guardados: string[]; aviso: string | null }> {
  const validos = precios.filter((p) => p.itemId && p.valor > 0);
  if (validos.length === 0) return { guardados: [], aviso: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("items_precios_historico").insert(
    validos.map((p) => ({
      item_id: p.itemId,
      valor_compra_iva: p.valor,
      fuente: "MANUAL",
      observaciones: `Cargado desde la cotización ${codigoCotizacion}`,
      created_by: user?.id ?? null,
    })),
  );
  if (error) {
    return {
      guardados: [],
      aviso: `La cotización se guardó, pero los precios no quedaron en el catálogo (${error.message}).`,
    };
  }
  return { guardados: validos.map((p) => p.nombre), aviso: null };
}

/**
 * Amarre CRM ↔ cotizador: la cotización guardada desde "Cotizar" queda asociada al
 * negocio (su total pasa a ser el valor real) y el negocio avanza a "enviada" si
 * todavía estaba antes. Nunca lo hace retroceder (una nueva versión en negociación
 * solo cambia la cotización asociada). Si falla, la cotización ya quedó guardada: se
 * devuelve un aviso en vez de un error.
 */
async function asociarAOportunidad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  oportunidadId: string,
  cotizacionId: string,
): Promise<string | null> {
  const { data: op } = await supabase
    .from("oportunidades")
    .select("etapa_id, tipo_pipeline, estado")
    .eq("id", oportunidadId)
    .maybeSingle();
  if (!op) return "No se encontró el negocio para asociar la cotización";

  const destino = op.tipo_pipeline === "renovacion" ? "renovacion_propuesta_enviada" : "cotizacion_enviada";
  const { data: etapas } = await supabase
    .from("etapas_config")
    .select("id, orden, resultado")
    .in("id", [op.etapa_id, destino]);
  const orden = new Map((etapas ?? []).map((e) => [e.id as string, e.orden as number]));
  const actualAbierta = !(etapas ?? []).find((e) => e.id === op.etapa_id)?.resultado;
  const avanzar =
    op.estado === "activa" &&
    actualAbierta &&
    (orden.get(op.etapa_id) ?? 0) < (orden.get(destino) ?? 0);

  const { error } = await supabase
    .from("oportunidades")
    .update(avanzar ? { cotizacion_id: cotizacionId, etapa_id: destino } : { cotizacion_id: cotizacionId })
    .eq("id", oportunidadId);
  if (error) return `La cotización se guardó, pero no se pudo asociar al negocio (${error.message})`;
  return null;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  diasDesde,
  hoyColombia,
  semaforo,
  type EstadoOportunidad,
  type EtapaConfig,
  type MotivoPerdida,
  type Semaforo,
  type TipoContacto,
  type TipoPipeline,
  type ViaAprobacion,
} from "@/lib/crm";
import { grupoDe, type FilaCrm } from "@/lib/crm-filtros";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export async function getEtapas(supabase: Db): Promise<EtapaConfig[]> {
  const { data, error } = await supabase
    .from("etapas_config")
    .select("id, tipo_pipeline, nombre, orden, dias_alerta, dias_estancada, resultado")
    .order("orden");
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    tipoPipeline: e.tipo_pipeline,
    nombre: e.nombre,
    orden: e.orden,
    diasAlerta: e.dias_alerta,
    diasEstancada: e.dias_estancada,
    resultado: e.resultado,
  }));
}

export interface TarjetaOportunidad {
  id: string;
  nombre: string;
  clienteNombre: string;
  etapaId: string;
  estado: EstadoOportunidad;
  // Valor que manda: el de la cotización asociada si existe; si no, el estimado.
  valor: number | null;
  valorEsCotizado: boolean;
  diasEnEtapa: number;
  semaforo: Semaforo;
  fechaReactivacion: string | null;
  fechaEstimadaDecision: string | null;
  proximoContacto: string | null; // fecha programada pendiente más cercana
  contactoVencido: boolean;
  sinSeguimiento: boolean; // activa y sin ningún contacto programado pendiente
  reactivacionVencida: boolean;
  fechaCierre: string | null;
  motivoPerdida: MotivoPerdida | null;
}

/**
 * El valor real es el total de la cotización asociada; el estimado solo cuenta
 * mientras todavía no hay cotización (etapas tempranas).
 */
function valorQueManda(totalCotizacion: number | undefined, estimado: unknown) {
  if (totalCotizacion !== undefined) return { valor: totalCotizacion, valorEsCotizado: true };
  return {
    valor: estimado === null || estimado === undefined ? null : Number(estimado),
    valorEsCotizado: false,
  };
}

/** Valor que manda: el total de la cotización vinculada; si no hay, el estimado. */
async function totalesCotizaciones(supabase: Db, ids: string[]) {
  const totales = new Map<string, number>();
  if (ids.length === 0) return totales;
  const { data } = await supabase
    .from("v_cotizacion_totales_iva")
    .select("cotizacion_id, total_cotizacion")
    .in("cotizacion_id", ids);
  for (const t of data ?? []) totales.set(t.cotizacion_id, Number(t.total_cotizacion));
  return totales;
}

/**
 * Todo lo del tablero de un pipeline: activas, aplazadas y las cerradas de los
 * últimos 90 días (para ver qué se ganó y qué se perdió sin llenar la pantalla).
 */
export async function getTablero(
  supabase: Db,
  tipo: TipoPipeline,
  etapas: EtapaConfig[],
): Promise<TarjetaOportunidad[]> {
  const hace90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("oportunidades")
    .select(
      "id, nombre, etapa_id, estado, valor_estimado, cotizacion_id, fecha_reactivacion, fecha_estimada_decision, fecha_cierre, motivo_perdida, clientes(nombre)",
    )
    .eq("tipo_pipeline", tipo)
    .or(`estado.neq.cerrada,fecha_cierre.gte."${hace90}"`)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const filas = data ?? [];
  const ids = filas.map((o) => o.id);
  if (ids.length === 0) return [];

  const [historialRes, contactosRes, totales] = await Promise.all([
    supabase
      .from("oportunidad_etapas_historial")
      .select("oportunidad_id, fecha_entrada")
      .in("oportunidad_id", ids)
      .is("fecha_salida", null),
    supabase
      .from("oportunidad_contactos")
      .select("oportunidad_id, fecha_programada")
      .in("oportunidad_id", ids)
      .is("fecha_realizada", null)
      .not("fecha_programada", "is", null),
    totalesCotizaciones(
      supabase,
      filas.map((o) => o.cotizacion_id).filter((x): x is string => Boolean(x)),
    ),
  ]);

  const entrada = new Map<string, string>();
  for (const h of historialRes.data ?? []) entrada.set(h.oportunidad_id, h.fecha_entrada);

  const proximo = new Map<string, string>();
  for (const c of contactosRes.data ?? []) {
    const actual = proximo.get(c.oportunidad_id);
    if (!actual || c.fecha_programada < actual) proximo.set(c.oportunidad_id, c.fecha_programada);
  }

  const hoy = hoyColombia();
  const etapaPorId = new Map(etapas.map((e) => [e.id, e]));

  return filas.map((o) => {
    const dias = diasDesde(entrada.get(o.id) ?? new Date().toISOString());
    const cliente = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes;
    const prox = proximo.get(o.id) ?? null;
    return {
      id: o.id,
      nombre: o.nombre,
      clienteNombre: (cliente as { nombre?: string } | null)?.nombre ?? "—",
      etapaId: o.etapa_id,
      estado: o.estado,
      ...valorQueManda(
        o.cotizacion_id ? totales.get(o.cotizacion_id) : undefined,
        o.valor_estimado,
      ),
      diasEnEtapa: dias,
      semaforo: o.estado === "activa" ? semaforo(dias, etapaPorId.get(o.etapa_id)) : "verde",
      fechaReactivacion: o.fecha_reactivacion,
      fechaEstimadaDecision: o.fecha_estimada_decision,
      proximoContacto: prox,
      contactoVencido: prox !== null && prox < hoy,
      sinSeguimiento: o.estado === "activa" && prox === null,
      reactivacionVencida: o.estado === "aplazada" && !!o.fecha_reactivacion && o.fecha_reactivacion <= hoy,
      fechaCierre: o.fecha_cierre,
      motivoPerdida: o.motivo_perdida,
    };
  });
}

export interface OportunidadDetalle {
  id: string;
  tipoPipeline: TipoPipeline;
  nombre: string;
  cliente: { id: string; nombre: string };
  etapaId: string;
  estado: EstadoOportunidad;
  fechaReactivacion: string | null;
  valorEstimado: number | null;
  cotizacionId: string | null;
  valorCotizacion: number | null;
  viaAprobacion: ViaAprobacion | null;
  requiereExpensaExtraordinaria: boolean | null;
  fechaEstimadaDecision: string | null;
  /** Migración 74. undefined = la columna todavía no existe (no se muestra ni se guarda). */
  origenLead?: string | null;
  motivoPerdida: MotivoPerdida | null;
  motivoPerdidaDetalle: string | null;
  competidorGanador: string | null;
  etapaAlPerder: string | null;
  fechaCierre: string | null;
  createdAt: string;
  // Momento de la consulta: los "días en etapa" se calculan contra esto, igual en
  // servidor y cliente (sin desfase de hidratación).
  consultadoEn: number;
  historial: {
    id: string;
    etapaId: string;
    estado: EstadoOportunidad;
    fechaEntrada: string;
    fechaSalida: string | null;
    valor: number | null;
  }[];
  contactos: {
    id: string;
    tipo: TipoContacto;
    conQuien: string | null;
    nota: string | null;
    fechaProgramada: string | null;
    fechaRealizada: string | null;
  }[];
  cotizacionesCliente: {
    id: string;
    codigo: string;
    descripcion: string;
    estado: string;
    total: number | null;
  }[];
}

export async function getOportunidadDetalle(
  supabase: Db,
  id: string,
): Promise<OportunidadDetalle | null> {
  const { data: o, error } = await supabase
    .from("oportunidades")
    .select(
      "id, tipo_pipeline, nombre, etapa_id, estado, fecha_reactivacion, valor_estimado, cotizacion_id, via_aprobacion, requiere_expensa_extraordinaria, fecha_estimada_decision, motivo_perdida, motivo_perdida_detalle, competidor_ganador, etapa_al_perder, fecha_cierre, created_at, clientes(id, nombre)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!o) return null;

  const cliente = (Array.isArray(o.clientes) ? o.clientes[0] : o.clientes) as {
    id: string;
    nombre: string;
  };

  const [historialRes, contactosRes, cotizacionesRes, totales, origenRes] = await Promise.all([
    supabase
      .from("oportunidad_etapas_historial")
      .select("id, etapa_id, estado, fecha_entrada, fecha_salida, valor")
      .eq("oportunidad_id", id)
      .order("fecha_entrada"),
    supabase
      .from("oportunidad_contactos")
      .select("id, tipo, con_quien, nota, fecha_programada, fecha_realizada")
      .eq("oportunidad_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("cotizaciones")
      .select("id, codigo, descripcion, estado")
      .eq("cliente_id", cliente.id)
      .order("created_at", { ascending: false }),
    totalesCotizaciones(supabase, o.cotizacion_id ? [o.cotizacion_id] : []),
    // Aparte, para que el detalle no se caiga mientras no corra la migración 74.
    supabase.from("oportunidades").select("origen_lead").eq("id", id).maybeSingle(),
  ]);
  const origenLead = origenRes.error ? undefined : ((origenRes.data as { origen_lead: string | null } | null)?.origen_lead ?? null);
  const cotizacionesCliente = (cotizacionesRes.data ?? []) as {
    id: string;
    codigo: string;
    descripcion: string;
    estado: string;
  }[];
  const totalesCliente = await totalesCotizaciones(
    supabase,
    cotizacionesCliente.map((c) => c.id),
  );

  return {
    id: o.id,
    tipoPipeline: o.tipo_pipeline,
    nombre: o.nombre,
    cliente,
    etapaId: o.etapa_id,
    estado: o.estado,
    fechaReactivacion: o.fecha_reactivacion,
    valorEstimado: o.valor_estimado === null ? null : Number(o.valor_estimado),
    cotizacionId: o.cotizacion_id,
    valorCotizacion: o.cotizacion_id ? (totales.get(o.cotizacion_id) ?? null) : null,
    viaAprobacion: o.via_aprobacion,
    requiereExpensaExtraordinaria: o.requiere_expensa_extraordinaria,
    fechaEstimadaDecision: o.fecha_estimada_decision,
    origenLead,
    motivoPerdida: o.motivo_perdida,
    motivoPerdidaDetalle: o.motivo_perdida_detalle,
    competidorGanador: o.competidor_ganador,
    etapaAlPerder: o.etapa_al_perder,
    fechaCierre: o.fecha_cierre,
    createdAt: o.created_at,
    consultadoEn: Date.now(),
    historial: (historialRes.data ?? []).map((h) => ({
      id: h.id,
      etapaId: h.etapa_id,
      estado: h.estado,
      fechaEntrada: h.fecha_entrada,
      fechaSalida: h.fecha_salida,
      valor: h.valor === null ? null : Number(h.valor),
    })),
    contactos: (contactosRes.data ?? []).map((c) => ({
      id: c.id,
      tipo: c.tipo,
      conQuien: c.con_quien,
      nota: c.nota,
      fechaProgramada: c.fecha_programada,
      fechaRealizada: c.fecha_realizada,
    })),
    cotizacionesCliente: cotizacionesCliente.map((c) => ({
      ...c,
      total: totalesCliente.get(c.id) ?? null,
    })),
  };
}

/**
 * Todos los negocios de un pipeline (sin el corte de 90 días del tablero), con lo que piden los
 * filtros: valor que manda, fechas, responsable, origen y última actividad (el contacto hecho
 * más reciente o el último cambio de etapa). `conOrigen` es false mientras no corra la
 * migración 74: entonces no se pide la columna y el filtro de origen no se muestra.
 */
export async function getListaCrm(
  supabase: Db,
  tipo: TipoPipeline,
  etapas: EtapaConfig[],
): Promise<{ filas: FilaCrm[]; conOrigen: boolean }> {
  const columnas =
    "id, nombre, etapa_id, estado, valor_estimado, cotizacion_id, fecha_estimada_decision, created_at, responsable_id, proyecto_id, cliente_id, clientes(nombre)";
  let conOrigen = true;
  const pedir = (cols: string) => supabase.from("oportunidades").select(cols).eq("tipo_pipeline", tipo).order("created_at", { ascending: false });
  let res = await pedir(`${columnas}, origen_lead`);
  if (res.error && /origen_lead/.test(res.error.message)) {
    conOrigen = false;
    res = await pedir(columnas);
  }
  if (res.error) throw res.error;
  const datos = (res.data ?? []) as unknown as {
    id: string;
    nombre: string;
    etapa_id: string;
    estado: EstadoOportunidad;
    valor_estimado: number | null;
    cotizacion_id: string | null;
    fecha_estimada_decision: string | null;
    created_at: string;
    responsable_id: string | null;
    proyecto_id: string | null;
    cliente_id: string;
    clientes: { nombre: string } | { nombre: string }[] | null;
    origen_lead?: string | null;
  }[];
  const ids = datos.map((o) => o.id);
  if (!ids.length) return { filas: [], conOrigen };

  const [contactosRes, historialRes, totales] = await Promise.all([
    supabase.from("oportunidad_contactos").select("oportunidad_id, fecha_realizada").in("oportunidad_id", ids).not("fecha_realizada", "is", null),
    supabase.from("oportunidad_etapas_historial").select("oportunidad_id, fecha_entrada").in("oportunidad_id", ids),
    totalesCotizaciones(supabase, datos.map((o) => o.cotizacion_id).filter((x): x is string => Boolean(x))),
  ]);
  const ultima = new Map<string, string>();
  const anotar = (id: string, iso: string | null) => {
    if (!iso) return;
    const actual = ultima.get(id);
    if (!actual || iso > actual) ultima.set(id, iso);
  };
  for (const c of contactosRes.data ?? []) anotar(c.oportunidad_id, c.fecha_realizada);
  for (const h of historialRes.data ?? []) anotar(h.oportunidad_id, h.fecha_entrada);

  const etapaPorId = new Map(etapas.map((e) => [e.id, e]));
  const dia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const filas = datos.map((o): FilaCrm => {
    const etapa = etapaPorId.get(o.etapa_id);
    const cliente = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes;
    const v = valorQueManda(o.cotizacion_id ? totales.get(o.cotizacion_id) : undefined, o.valor_estimado);
    return {
      id: o.id,
      nombre: o.nombre,
      clienteId: o.cliente_id,
      clienteNombre: cliente?.nombre ?? "—",
      etapaId: o.etapa_id,
      etapaNombre: etapa?.nombre ?? o.etapa_id,
      estado: o.estado,
      grupo: grupoDe({ etapaId: o.etapa_id, estado: o.estado, resultado: etapa?.resultado ?? null, proyectoId: o.proyecto_id }),
      valor: v.valor,
      valorEsCotizado: v.valorEsCotizado,
      creado: dia(o.created_at),
      objetivoCierre: o.fecha_estimada_decision,
      ultimaActividad: dia(ultima.get(o.id) ?? o.created_at),
      responsableId: o.responsable_id,
      origen: o.origen_lead ?? null,
      abierta: o.estado !== "cerrada",
    };
  });
  return { filas, conOrigen };
}

/** Id y nombre de los responsables comerciales (migración 74). Vacío si todavía no corrió. */
export async function getResponsablesCrm(supabase: Db): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await supabase.rpc("fn_crm_responsables");
  if (error) return [];
  return (data ?? []) as { id: string; nombre: string }[];
}

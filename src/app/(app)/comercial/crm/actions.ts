"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import {
  MOTIVOS_PERDIDA,
  type MotivoPerdida,
  type TipoContacto,
  type TipoPipeline,
  type ViaAprobacion,
} from "@/lib/crm";

// Las reglas duras (motivo obligatorio al perder, fecha al aplazar, etapa del pipeline
// correcto, cierre automático, historial) las hace cumplir la base con triggers y checks.
// Acá solo se valida lo mínimo para dar un mensaje claro antes de ir a la base.

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function puedeTrabajar() {
  return tienePermiso("comercial", "trabajar");
}

const SIN_PERMISO = "No tienes permiso para trabajar en Comercial";

function refrescar(id?: string) {
  revalidatePath("/comercial/crm");
  if (id) revalidatePath(`/comercial/crm/${id}`);
}

function mensaje(error: { message: string }) {
  // Los raise exception de los triggers llegan tal cual: ya están en español.
  return error.message;
}

function etapaInicial(tipo: TipoPipeline, conCotizacion: boolean) {
  if (tipo === "renovacion") return conCotizacion ? "renovacion_propuesta_enviada" : "renovacion_proxima";
  return conCotizacion ? "cotizacion_enviada" : "solicitud";
}

export async function crearOportunidad(input: {
  tipoPipeline: TipoPipeline;
  nombre: string;
  clienteId: string | null;
  valorEstimado: number | null;
  cotizacionId: string | null;
  viaAprobacion: ViaAprobacion | null;
}): Promise<Resultado<{ id: string }>> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "Falta el nombre del negocio" };
  // El cliente se elige de la lista o se crea en la ventana «+ Nuevo cliente» (que no
  // duplica NIT): acá ya no se crean clientes por nombre.
  if (!input.clienteId) {
    return { ok: false, error: "Elige el cliente de la lista o créalo con «+ Nuevo cliente»" };
  }
  const clienteId = input.clienteId;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("oportunidades")
    .insert({
      tipo_pipeline: input.tipoPipeline,
      nombre,
      cliente_id: clienteId,
      // Con cotización ya hecha, el negocio entra donde realmente está: enviada.
      etapa_id: etapaInicial(input.tipoPipeline, Boolean(input.cotizacionId)),
      cotizacion_id: input.cotizacionId,
      valor_estimado: input.cotizacionId ? null : input.valorEstimado,
      via_aprobacion: input.viaAprobacion,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mensaje(error) };

  refrescar();
  return { ok: true, id: data.id };
}

/** Mover a una etapa abierta (las de cierre van por marcarGanada / marcarPerdida). */
export async function moverEtapa(id: string, etapaId: string): Promise<Resultado> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({ etapa_id: etapaId, estado: "activa" })
    .eq("id", id);
  if (error) return { ok: false, error: mensaje(error) };
  refrescar(id);
  return { ok: true };
}

export async function marcarGanada(id: string, etapaGanada: string): Promise<Resultado> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({ etapa_id: etapaGanada })
    .eq("id", id);
  if (error) return { ok: false, error: mensaje(error) };
  refrescar(id);
  return { ok: true };
}

export async function marcarPerdida(
  id: string,
  etapaPerdida: string,
  motivo: MotivoPerdida,
  detalle: string,
  competidor: string,
): Promise<Resultado> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  if (!MOTIVOS_PERDIDA.some((m) => m.id === motivo)) {
    return { ok: false, error: "Elige el motivo de la pérdida" };
  }
  if (motivo === "otro" && !detalle.trim()) {
    return { ok: false, error: "Con el motivo \"Otro\" hay que escribir cuál fue" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({
      etapa_id: etapaPerdida,
      motivo_perdida: motivo,
      motivo_perdida_detalle: detalle.trim() || null,
      competidor_ganador: competidor.trim() || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: mensaje(error) };
  refrescar(id);
  return { ok: true };
}

export async function aplazar(id: string, fechaReactivacion: string): Promise<Resultado> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaReactivacion)) {
    return { ok: false, error: "Elige la fecha en que hay que retomarlo" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({ estado: "aplazada", fecha_reactivacion: fechaReactivacion })
    .eq("id", id);
  if (error) return { ok: false, error: mensaje(error) };
  refrescar(id);
  return { ok: true };
}

export async function reactivar(id: string): Promise<Resultado> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({ estado: "activa" })
    .eq("id", id);
  if (error) return { ok: false, error: mensaje(error) };
  refrescar(id);
  return { ok: true };
}

/** Datos del pronóstico y del negocio (no toca etapa ni estado). */
export async function actualizarDatos(
  id: string,
  datos: {
    nombre: string;
    valorEstimado: number | null;
    cotizacionId: string | null;
    viaAprobacion: ViaAprobacion | null;
    requiereExpensaExtraordinaria: boolean | null;
    fechaEstimadaDecision: string | null;
  },
): Promise<Resultado> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  if (!datos.nombre.trim()) return { ok: false, error: "Falta el nombre del negocio" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({
      nombre: datos.nombre.trim(),
      valor_estimado: datos.valorEstimado,
      cotizacion_id: datos.cotizacionId,
      via_aprobacion: datos.viaAprobacion,
      requiere_expensa_extraordinaria: datos.requiereExpensaExtraordinaria,
      fecha_estimada_decision: datos.fechaEstimadaDecision,
    })
    .eq("id", id);
  if (error) return { ok: false, error: mensaje(error) };
  refrescar(id);
  return { ok: true };
}

export async function agregarContacto(
  oportunidadId: string,
  input: {
    tipo: TipoContacto;
    conQuien: string;
    nota: string;
    // "hecho" = ya pasó (se registra ahora); si no, es un seguimiento programado.
    hecho: boolean;
    fechaProgramada: string | null;
  },
): Promise<Resultado> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  if (!input.hecho && !input.fechaProgramada) {
    return { ok: false, error: "Elige para cuándo queda el seguimiento" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("oportunidad_contactos").insert({
    oportunidad_id: oportunidadId,
    tipo: input.tipo,
    con_quien: input.conQuien.trim() || null,
    nota: input.nota.trim() || null,
    fecha_programada: input.hecho ? null : input.fechaProgramada,
    fecha_realizada: input.hecho ? new Date().toISOString() : null,
  });
  if (error) return { ok: false, error: mensaje(error) };
  refrescar(oportunidadId);
  return { ok: true };
}

export async function completarContacto(
  oportunidadId: string,
  contactoId: string,
): Promise<Resultado> {
  if (!(await puedeTrabajar())) return { ok: false, error: SIN_PERMISO };
  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidad_contactos")
    .update({ fecha_realizada: new Date().toISOString() })
    .eq("id", contactoId)
    .eq("oportunidad_id", oportunidadId);
  if (error) return { ok: false, error: mensaje(error) };
  refrescar(oportunidadId);
  return { ok: true };
}

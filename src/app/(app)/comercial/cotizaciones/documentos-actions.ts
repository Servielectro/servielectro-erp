"use server";

import { createClient } from "@/lib/supabase/server";
import type { ResultadoExtraccionRut } from "@/lib/documentos/extraer-rut";

// El archivo del RUT NUNCA viaja en estas llamadas: sube directo a Storage y se lee con
// src/lib/rut (useLecturaRut + leerRutSubido). Aquí solo se registra y se confirma.

export interface SubirRutResult {
  ok: true;
  documentoId: string;
  clienteId: string;
  resultado: ResultadoExtraccionRut;
}

export interface SubirRutError {
  ok: false;
  error: string;
}

export interface CamposConfirmadosRut {
  nit: string;
  dv: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: string;
  municipio: string;
  departamento: string;
  correo: string;
  telefono: string;
  tipoContribuyente: "NATURAL" | "JURIDICA" | null;
  responsableIva: boolean | null;
  representanteLegal: string;
  responsabilidades: string[]; // códigos crudos de la casilla 53
}

/**
 * Se llama cuando Jhojan revisa el panel y confirma (con las correcciones que haya
 * hecho). Recién acá se actualiza el cliente — antes de esto no se toca su registro.
 */
export async function confirmarRut(
  documentoId: string,
  clienteId: string,
  campos: CamposConfirmadosRut,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión no válida." };
  }

  const { error: errorCliente } = await supabase
    .from("clientes")
    .update({
      nit: campos.nit || null,
      direccion: campos.direccion || null,
      municipio: campos.municipio || null,
      departamento: campos.departamento || null,
      email: campos.correo || null,
      telefono: campos.telefono || null,
      ...(campos.representanteLegal ? { contacto: campos.representanteLegal } : {}),
      tipo_contribuyente: campos.tipoContribuyente,
      responsable_iva: campos.responsableIva,
      nombre: campos.razonSocial || undefined,
    })
    .eq("id", clienteId);
  if (errorCliente) {
    return { ok: false, error: errorCliente.message };
  }

  const { error: errorDocumento } = await supabase
    .from("documentos")
    .update({
      estado: "CONFIRMADO",
      valores_confirmados_json: campos,
      confirmado_por: user.id,
      confirmado_en: new Date().toISOString(),
    })
    .eq("id", documentoId);
  if (errorDocumento) {
    return { ok: false, error: errorDocumento.message };
  }

  return { ok: true };
}

export interface RutLeidoSinCliente {
  storagePath: string;
  nombreArchivo: string;
  extraccion: unknown;
  costoEstimadoUsd: number | null;
}


/**
 * Cotización (cliente elegido por nombre): el RUT YA subió desde el celular (src/lib/rut) y ya se
 * leyó; aquí solo se resuelve el cliente y se registra el documento por confirmar. Nada de archivo
 * en esta llamada (el límite de 1 MB rechazaba los PDF y las fotos).
 */
export async function registrarRutLeido(
  clienteNombre: string,
  storagePath: string,
  nombreArchivo: string,
  resultado: ResultadoExtraccionRut,
): Promise<{ ok: true; documentoId: string; clienteId: string } | SubirRutError> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  if (!clienteNombre.trim()) return { ok: false, error: "Falta el nombre del cliente." };
  const { data: clienteId, error: errorCliente } = await supabase.rpc("fn_buscar_o_crear_cliente", { p_nombre: clienteNombre });
  if (errorCliente || !clienteId) return { ok: false, error: `No se pudo resolver el cliente: ${errorCliente?.message ?? "error desconocido"}` };
  const { data: documento, error } = await supabase
    .from("documentos")
    .insert({
      tipo_documento: "RUT",
      cliente_id: clienteId,
      storage_path: storagePath,
      nombre_archivo: nombreArchivo,
      subido_por: user.id,
      extraccion_json: resultado.extraccion,
      costo_estimado_usd: resultado.costoEstimadoUsd,
    })
    .select("id")
    .single();
  if (error || !documento) return { ok: false, error: `El RUT se leyó pero no se pudo registrar: ${error?.message}` };
  return { ok: true, documentoId: documento.id, clienteId };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { extraerRut, type ResultadoExtraccionRut } from "@/lib/documentos/extraer-rut";

const BUCKET = "documentos-clientes";

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

/**
 * Resuelve (o crea) el cliente por nombre, sube el RUT a Storage y lo manda a leer con IA.
 * No confirma nada todavía — el resultado se muestra en el panel de confirmación.
 */
export async function subirYLeerRut(
  formData: FormData,
): Promise<SubirRutResult | SubirRutError> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };
  }

  const archivo = formData.get("archivo");
  const clienteNombre = formData.get("clienteNombre");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }
  if (typeof clienteNombre !== "string" || !clienteNombre.trim()) {
    return { ok: false, error: "Falta el nombre del cliente." };
  }

  const tiposPermitidos = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (archivo.type && !tiposPermitidos.includes(archivo.type)) {
    return {
      ok: false,
      error: `Tipo de archivo no soportado (${archivo.type}). Subí un PDF o una foto (JPG/PNG).`,
    };
  }

  const { data: clienteId, error: errorCliente } = await supabase.rpc(
    "fn_buscar_o_crear_cliente",
    { p_nombre: clienteNombre },
  );
  if (errorCliente || !clienteId) {
    return {
      ok: false,
      error: `No se pudo resolver el cliente: ${errorCliente?.message ?? "error desconocido"}`,
    };
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const nombreArchivo = archivo.name || "rut";
  const storagePath = `clientes/${clienteId}/rut/${Date.now()}-${nombreArchivo}`;

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: archivo.type || "application/octet-stream",
      upsert: false,
    });
  if (errorSubida) {
    return { ok: false, error: `No se pudo guardar el archivo: ${errorSubida.message}` };
  }

  const { data: documento, error: errorDocumento } = await supabase
    .from("documentos")
    .insert({
      tipo_documento: "RUT",
      cliente_id: clienteId,
      storage_path: storagePath,
      nombre_archivo: nombreArchivo,
      subido_por: user.id,
    })
    .select("id")
    .single();
  if (errorDocumento || !documento) {
    return {
      ok: false,
      error: `El archivo se guardó pero no se pudo registrar: ${errorDocumento?.message}`,
    };
  }

  let resultado: ResultadoExtraccionRut;
  try {
    resultado = await extraerRut(buffer, nombreArchivo);
  } catch (err) {
    // El archivo y el registro ya quedaron guardados — Jhojan puede completar a mano.
    const mensaje = err instanceof Error ? err.message : "Error desconocido leyendo el RUT";
    return {
      ok: false,
      error: `El archivo se guardó, pero no se pudo leer automáticamente (${mensaje}). Completá los datos a mano.`,
    };
  }

  await supabase
    .from("documentos")
    .update({
      extraccion_json: resultado.extraccion,
      costo_estimado_usd: resultado.costoEstimadoUsd,
    })
    .eq("id", documento.id);

  return { ok: true, documentoId: documento.id, clienteId, resultado };
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
      contacto: campos.telefono || null,
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

"use server";

import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { nitBase } from "@/lib/clientes/nit";
import type { ClienteResumen } from "@/lib/supabase/clientes";
import type {
  CamposConfirmadosRut,
  RutLeidoSinCliente,
} from "@/app/(app)/comercial/cotizaciones/documentos-actions";

const COLUMNAS = "id, nombre, nit, direccion, email, contacto, telefono";

/**
 * Un NIT, un cliente: busca por NIT comparable (sin puntos ni dígito de verificación).
 * Se hace en el servidor de la app para que funcione aunque la migración 31 (índice
 * único en la base) todavía no se haya corrido.
 */
async function buscarPorNit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nit: string | null,
): Promise<ClienteResumen | null> {
  const base = nitBase(nit);
  if (!base) return null;
  const { data } = await supabase.from("clientes").select(COLUMNAS).not("nit", "is", null);
  return ((data ?? []) as ClienteResumen[]).find((c) => nitBase(c.nit) === base) ?? null;
}

export async function crearCliente(input: {
  nombre: string;
  nit: string;
  direccion: string;
  email: string;
  contacto: string;
  telefono: string;
  rut?: { campos: CamposConfirmadosRut; archivo: RutLeidoSinCliente } | null;
}): Promise<
  { ok: true; cliente: ClienteResumen; yaExistia: boolean } | { ok: false; error: string }
> {
  if (!(await tienePermiso("comercial", "trabajar"))) {
    return { ok: false, error: "No tienes permiso para crear clientes" };
  }
  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "Falta el nombre del cliente" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ya existe ese NIT: se usa el existente, nunca se crea un duplicado.
  const existente = await buscarPorNit(supabase, input.nit);
  if (existente) return { ok: true, cliente: existente, yaExistia: true };

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nombre,
      nit: input.nit.trim() || null,
      direccion: input.direccion.trim() || null,
      email: input.email.trim() || null,
      contacto: input.contacto.trim() || null,
      telefono: input.telefono.trim() || null,
      ...(input.rut
        ? {
            municipio: input.rut.campos.municipio || null,
            departamento: input.rut.campos.departamento || null,
            tipo_contribuyente: input.rut.campos.tipoContribuyente,
            responsable_iva: input.rut.campos.responsableIva,
          }
        : {}),
    })
    .select(COLUMNAS)
    .single();

  if (error) {
    // El índice único (migración 31) rechazó un NIT repetido entre la búsqueda y el
    // insert: se devuelve el existente.
    if (error.code === "23505") {
      const otro = await buscarPorNit(supabase, input.nit);
      if (otro) return { ok: true, cliente: otro, yaExistia: true };
    }
    return { ok: false, error: error.message };
  }

  // El RUT leído en la ventana queda registrado y confirmado en el cliente nuevo.
  if (input.rut) {
    const { error: errDoc } = await supabase.from("documentos").insert({
      tipo_documento: "RUT",
      cliente_id: data.id,
      storage_path: input.rut.archivo.storagePath,
      nombre_archivo: input.rut.archivo.nombreArchivo,
      estado: "CONFIRMADO",
      extraccion_json: input.rut.archivo.extraccion,
      valores_confirmados_json: input.rut.campos,
      costo_estimado_usd: input.rut.archivo.costoEstimadoUsd,
      subido_por: user?.id ?? null,
      confirmado_por: user?.id ?? null,
      confirmado_en: new Date().toISOString(),
    });
    if (errDoc) console.error("Cliente creado, pero el RUT no quedó registrado:", errDoc);
  }

  return { ok: true, cliente: data as ClienteResumen, yaExistia: false };
}

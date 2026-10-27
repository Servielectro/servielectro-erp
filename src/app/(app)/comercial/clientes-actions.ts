"use server";

import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { nitBase } from "@/lib/clientes/nit";
import type { ClienteResumen } from "@/lib/supabase/clientes";

/** Lo leído del RUT que ya subió el celular (src/lib/rut): se registra como RUT del cliente. */
export interface RutParaCliente {
  storagePath: string;
  nombreArchivo: string;
  extraccion: unknown;
  costoEstimadoUsd: number | null;
}

/** Lo que viene del RUT (propuesta revisada en la ventana) además de los campos de siempre. */
export interface DatosFiscalesCliente {
  tipoDocumento: string | null;
  tipoPersona: "natural" | "juridica" | null;
  dv: string | null;
  municipio: string | null;
  departamento: string | null;
  municipioDane: string | null;
  responsabilidadesRut: string[];
  declaranteRenta: boolean | null;
}

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
  rut?: RutParaCliente | null;
  fiscales?: DatosFiscalesCliente | null;
  ubicacion?: { latitud: number; longitud: number; precisionM: number | null } | null;
  responsableIva?: boolean | null;
}): Promise<
  { ok: true; cliente: ClienteResumen; yaExistia: boolean } | { ok: false; error: string }
> {
  // Crean clientes Comercial y Administrativo (migración 70), y quien asigna visitas.
  if (!(await tienePermiso("comercial", "trabajar")) && !(await tienePermiso("administrativo", "trabajar")) && !(await tienePermiso("operativo", "trabajar"))) {
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

  const u = input.ubicacion;
  const ubicacionValida =
    u && Number.isFinite(u.latitud) && Number.isFinite(u.longitud) &&
    Math.abs(u.latitud) <= 90 && Math.abs(u.longitud) <= 180;
  const columnasUbicacion = ubicacionValida
    ? {
        latitud: u!.latitud,
        longitud: u!.longitud,
        ubicacion_precision_m: u!.precisionM,
        ubicacion_tomada_en: new Date().toISOString(),
      }
    : {};

  const fila = {
      nombre,
      nit: input.nit.trim() || null,
      direccion: input.direccion.trim() || null,
      email: input.email.trim() || null,
      contacto: input.contacto.trim() || null,
      telefono: input.telefono.trim() || null,
      ...(input.fiscales
        ? {
            tipo_documento: input.fiscales.tipoDocumento,
            tipo_persona: input.fiscales.tipoPersona,
            tipo_contribuyente: input.fiscales.tipoPersona === "natural" ? "NATURAL" : input.fiscales.tipoPersona === "juridica" ? "JURIDICA" : null,
            dv: input.fiscales.dv,
            municipio: input.fiscales.municipio,
            departamento: input.fiscales.departamento,
            municipio_dane: input.fiscales.municipioDane,
            declarante_renta: input.fiscales.declaranteRenta,
          }
        : {}),
      // Lo que quedó en el formulario (leído del RUT o marcado a mano).
      responsable_iva: input.responsableIva ?? null,
  };
  // Códigos de la casilla 53: TODOS los leídos, estén o no en el catálogo (migración 80).
  const columnasRut = input.fiscales?.responsabilidadesRut.length ? { responsabilidades_rut: input.fiscales.responsabilidadesRut } : {};

  let { data, error } = await supabase
    .from("clientes")
    .insert({ ...fila, ...columnasUbicacion, ...columnasRut })
    .select(COLUMNAS)
    .single();
  // Si la migración 32 (columnas de ubicación) no se corrió, el cliente se guarda igual
  // sin la ubicación: no se pierde el alta por eso.
  // Si falta alguna migración de columnas opcionales (32 ubicación, 39 responsabilidades),
  // el cliente se guarda igual sin ellas: no se pierde el alta por eso.
  if (error && /latitud|longitud|ubicacion|responsabilidades_rut/.test(error.message)) {
    console.error("Columnas opcionales no guardadas (¿falta la migración 32 o 40?):", error.message);
    ({ data, error } = await supabase.from("clientes").insert(fila).select(COLUMNAS).single());
  }

  if (error) {
    // El índice único (migración 31) rechazó un NIT repetido entre la búsqueda y el
    // insert: se devuelve el existente.
    if (error.code === "23505") {
      const otro = await buscarPorNit(supabase, input.nit);
      if (otro) return { ok: true, cliente: otro, yaExistia: true };
    }
    return { ok: false, error: error.message };
  }

  if (!data) return { ok: false, error: "No se pudo crear el cliente" };

  // El RUT leído en la ventana queda registrado y confirmado en el cliente nuevo.
  if (input.rut) {
    const { error: errDoc } = await supabase.from("documentos").insert({
      tipo_documento: "RUT",
      cliente_id: data.id,
      storage_path: input.rut.storagePath,
      nombre_archivo: input.rut.nombreArchivo,
      estado: "CONFIRMADO",
      extraccion_json: input.rut.extraccion,
      valores_confirmados_json: { ...fila, ...columnasRut },
      costo_estimado_usd: input.rut.costoEstimadoUsd,
      subido_por: user?.id ?? null,
      confirmado_por: user?.id ?? null,
      confirmado_en: new Date().toISOString(),
    });
    if (errDoc) console.error("Cliente creado, pero el RUT no quedó registrado:", errDoc);
  }

  return { ok: true, cliente: data as ClienteResumen, yaExistia: false };
}

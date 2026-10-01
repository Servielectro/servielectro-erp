"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { BUCKET_RRHH, TIPOS_PLANTILLA } from "@/lib/rrhh";

// Plantillas de documentos de RRHH. Además de este chequeo en el servidor, la base exige
// el mismo permiso por RLS (migración 35): consultar = ver/descargar, trabajar = subir.
// El archivo .docx lo sube el navegador directo a Storage con la sesión del usuario (el
// envío por acción del servidor tiene límite de 1 MB); acá solo se registra.


type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function crearPlantilla(
  nombre: string,
  tipo: string,
): Promise<Resultado<{ id: string }>> {
  if (!(await tienePermiso("rrhh", "trabajar"))) {
    return { ok: false, error: "No tienes permiso para subir plantillas de RRHH" };
  }
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "Falta el nombre de la plantilla" };
  if (!TIPOS_PLANTILLA.some((t) => t.id === tipo)) return { ok: false, error: "Tipo no válido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plantillas_documento")
    .insert({ nombre: limpio, tipo })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Ya existe una plantilla con ese nombre: súbele una versión nueva" : error.message,
    };
  }
  return { ok: true, id: data.id as string };
}

/** Registra el archivo ya subido como versión nueva y la deja vigente (la anterior queda en el historial). */
export async function publicarVersion(input: {
  plantillaId: string;
  storagePath: string;
  nombreArchivo: string;
  tamanoBytes: number;
  notas: string;
}): Promise<Resultado> {
  if (!(await tienePermiso("rrhh", "trabajar"))) {
    return { ok: false, error: "No tienes permiso para subir plantillas de RRHH" };
  }
  if (!input.storagePath.startsWith(`plantillas/${input.plantillaId}/`)) {
    return { ok: false, error: "Ruta de archivo no válida" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_publicar_version_plantilla", {
    p_plantilla_id: input.plantillaId,
    p_storage_path: input.storagePath,
    p_nombre_archivo: input.nombreArchivo,
    p_tamano_bytes: input.tamanoBytes,
    p_notas: input.notas || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rrhh/plantillas");
  return { ok: true };
}

/** Enlace temporal (60 s) para descargar una versión, con el nombre original del archivo. */
export async function enlaceDescarga(versionId: string): Promise<Resultado<{ url: string }>> {
  if (!(await tienePermiso("rrhh", "consultar"))) {
    return { ok: false, error: "No tienes permiso para ver plantillas de RRHH" };
  }
  const supabase = await createClient();
  const { data: v, error } = await supabase
    .from("plantilla_versiones")
    .select("storage_path, nombre_archivo")
    .eq("id", versionId)
    .maybeSingle();
  if (error || !v) return { ok: false, error: error?.message ?? "Versión no encontrada" };
  const { data, error: errUrl } = await supabase.storage
    .from(BUCKET_RRHH)
    .createSignedUrl(v.storage_path, 60, { download: v.nombre_archivo });
  if (errUrl || !data) return { ok: false, error: errUrl?.message ?? "No se pudo generar el enlace" };
  return { ok: true, url: data.signedUrl };
}

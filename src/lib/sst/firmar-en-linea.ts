import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "@/lib/tecnico/captura";
import type { Ubicacion } from "@/lib/tecnico/db";
import { dispositivoActual } from "@/lib/sst/local";
import { descartarImagenFirma } from "@/lib/sst/firma-huerfana";

export interface DatosFirmaEnLinea {
  formatoId: string;
  rol: "tecnico" | "responsable_sst" | "sst_cliente" | "otro";
  nombre: string;
  documento: string;
  cargo: string | null;
  empresa: string | null;
}

/**
 * Registra una firma CON SEÑAL (pantalla del acta, portal del cliente, convocado). Un solo camino para
 * los tres, con las dos reglas que no se pueden romper en un documento firmado:
 *  1. La imagen sube primero (la última firma de un acta con cierre automático la sella al entrar, y
 *     sellada ya no recibe la imagen). Si la base RECHAZA la fila, la imagen se borra: no queda
 *     ninguna firma a medias en Storage.
 *  2. Solo devuelve ok si la fila quedó en la base. Cualquier otra cosa es un error con el mensaje de
 *     la base tal cual, para mostrarlo grande; la pantalla NO debe quedar como firmada.
 */
export async function registrarFirmaEnLinea(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  d: DatosFirmaEnLinea,
  png: Blob,
  gps: Ubicacion,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const firmaId = crypto.randomUUID();
  const ruta = `formatos/${d.formatoId}/firma-${firmaId}.png`;
  const huella = await sha256(png);
  const subida = await supabase.storage.from("sgsst").upload(ruta, png, { contentType: "image/png", upsert: false });
  if (subida.error) return { ok: false, error: `No se pudo guardar la imagen de la firma: ${subida.error.message}. La firma NO quedó registrada.` };
  // Sin .select(): la fila la completa la base (hash, quién, cuándo) y el RETURNING rebotaría por RLS.
  const { error } = await supabase.from("sst_formato_firmas").insert({
    id: firmaId,
    formato_id: d.formatoId,
    rol: d.rol,
    nombre: d.nombre,
    documento: d.documento,
    cargo: d.cargo,
    empresa: d.empresa,
    imagen_path: ruta,
    imagen_sha256: huella,
    firmada_en_dispositivo: new Date().toISOString(),
    dispositivo: dispositivoActual() || null,
    gps_estado: gps.estado,
    lat: gps.lat,
    lng: gps.lng,
    hash_contenido: "lo-pone-la-base",
  });
  if (error) {
    await descartarImagenFirma(d.formatoId, firmaId).catch(() => undefined);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

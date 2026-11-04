"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hayClaveSecreta } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Borra la imagen de una firma que la base RECHAZÓ (la fila de sst_formato_firmas no entró).
 *
 * La imagen se sube antes que la fila a propósito: la última firma de un acta con cierre automático
 * (migración 139) la sella al entrar, y con el acta sellada el bucket ya no acepta la imagen. Así que
 * si la fila rebota, la imagen queda sola en Storage. El bucket sgsst no deja borrar desde la app;
 * esto lo hace con la clave secreta, y solo así de acotado:
 *   - quien llama tiene sesión;
 *   - la ruta es exactamente formatos/{formato}/firma-{firma}.png (los dos son UUID);
 *   - NO existe ninguna fila de sst_formato_firmas con ese id ni que apunte a esa imagen.
 * El id de la firma lo generó el dispositivo que firmó, así que nadie más tiene una firma en curso
 * con ese nombre de archivo. Si algo no cuadra, no se borra nada.
 */
export async function descartarImagenFirma(formatoId: string, firmaId: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!UUID.test(formatoId) || !UUID.test(firmaId)) return { ok: false, motivo: "datos no válidos" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: "sin sesión" };
  if (!hayClaveSecreta()) return { ok: false, motivo: "sin clave del servidor" };

  const ruta = `formatos/${formatoId}/firma-${firmaId}.png`;
  const admin = createAdminClient();
  const [porId, porRuta] = await Promise.all([
    admin.from("sst_formato_firmas").select("id").eq("id", firmaId).limit(1),
    admin.from("sst_formato_firmas").select("id").eq("imagen_path", ruta).limit(1),
  ]);
  if (porId.error || porRuta.error) return { ok: false, motivo: (porId.error ?? porRuta.error)!.message };
  if (porId.data?.length || porRuta.data?.length) return { ok: false, motivo: "la firma sí está registrada: no se borra" };
  const { error: errBorrar } = await admin.storage.from("sgsst").remove([ruta]);
  if (errBorrar) return { ok: false, motivo: errBorrar.message };
  return { ok: true };
}

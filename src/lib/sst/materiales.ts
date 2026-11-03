// Material de capacitación SG-SST (migraciones 20261103120000 y 130): la presentación de inducción
// y lo que venga. El acuse de lectura (abrir/cerrar) lo escribe la base con SU hora, por funciones.

import type { SupabaseClient } from "@supabase/supabase-js";
import { docComparable } from "./plantillas";

export const BUCKET_MATERIALES = "sgsst";

export interface Material {
  id: string;
  codigo: string;
  nombre: string;
  version: number;
  path: string;
  minutos_lectura: number | null;
  obligatorio: boolean;
}

export interface Lectura {
  id: string;
  material_id: string;
  persona: string;
  documento: string;
  abierto_en: string;
  cerrado_en: string | null;
  segundos: number | null;
}

export const COLUMNAS_LECTURA = "id, material_id, persona, documento, abierto_en, cerrado_en, segundos";

/** "4 min 12 s" */
export function duracion(segundos: number | null): string {
  if (segundos === null) return "sin cerrar";
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}

/** Las lecturas cerradas de una persona (por cédula) de un material. */
export function lecturasDe(lecturas: Lectura[], materialId: string, documento: string): Lectura[] {
  const d = docComparable(documento);
  return lecturas.filter((l) => l.material_id === materialId && docComparable(l.documento) === d && l.cerrado_en);
}

/** Los materiales obligatorios que esta persona todavía no ha abierto y cerrado en esta sesión. */
export function materialesSinLeer(materiales: Material[], lecturas: Lectura[], documento: string): Material[] {
  return materiales.filter((m) => m.obligatorio && lecturasDe(lecturas, m.id, documento).length === 0);
}

/**
 * Cierra la lectura aunque la página se esté yendo (se bloqueó el celular, se cerró la pestaña):
 * fetch con keepalive directo a la función, con el token de la sesión.
 */
export function cerrarAlSalir(lecturaId: string, token: string) {
  void fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/fn_sst_material_cerrar`, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ p_lectura: lecturaId }),
  }).catch(() => {});
}

export async function urlFirmada(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_MATERIALES).createSignedUrl(path, 60 * 60);
  if (error || !data) throw new Error(`No se pudo abrir el material: ${error?.message ?? "sin enlace"}`);
  return data.signedUrl;
}


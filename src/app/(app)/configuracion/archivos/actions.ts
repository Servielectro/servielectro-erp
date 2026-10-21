"use server";

import { tienePermiso } from "@/lib/permisos";
import { hayClaveSecreta } from "@/lib/supabase/admin";
import {
  borrarHuerfanos,
  buscarHuerfanos,
  type CarpetaHuerfana,
  type ResultadoBorrado,
} from "@/lib/mantenimiento/archivos-huerfanos";

// Limpieza de archivos huérfanos: solo configuracion/responsable. El permiso se verifica ANTES
// de usar la clave de servicio (igual que crear usuarios).

async function puede(): Promise<string | null> {
  if (!(await tienePermiso("configuracion", "responsable"))) return "Esto requiere ser responsable de Configuración.";
  if (!hayClaveSecreta()) return "Falta configurar la clave secreta de Supabase en Vercel (SUPABASE_SECRET_KEY).";
  return null;
}

export async function revisarHuerfanos(): Promise<{ ok: true; carpetas: CarpetaHuerfana[] } | { ok: false; error: string }> {
  const no = await puede();
  if (no) return { ok: false, error: no };
  try {
    return { ok: true, carpetas: await buscarHuerfanos() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function limpiarHuerfanos(
  visitaIds: string[],
): Promise<{ ok: true; resultados: ResultadoBorrado[] } | { ok: false; error: string }> {
  const no = await puede();
  if (no) return { ok: false, error: no };
  try {
    return { ok: true, resultados: await borrarHuerfanos(visitaIds) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

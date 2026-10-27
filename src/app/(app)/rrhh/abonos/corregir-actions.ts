"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { confirmarConContrasena, consumirConfirmacion } from "@/lib/seguridad/reautenticar";
import type { CampoAbono } from "@/lib/correcciones";

// CORREGIR un abono desembolsado (migración 84): lo aprobado o la fecha del desembolso, con
// motivo y con la contraseña cada vez (el mismo mecanismo de eliminar, migración 62). La base
// hace la corrección y el rastro juntos (fn_corregir_abono) y exige la marca de la contraseña;
// la marca se gasta SIEMPRE después del intento, salga bien o mal.
export async function corregirAbono(
  abonoId: string,
  campo: CampoAbono,
  valorNuevo: string,
  motivo: string,
  contrasena: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!motivo.trim()) return { ok: false, error: "Escribe el motivo de la corrección." };
  if (!valorNuevo.trim()) return { ok: false, error: "Escribe el valor correcto." };
  const conf = await confirmarConContrasena(contrasena);
  if (!conf.ok) return conf;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_corregir_abono", {
      p_abono: abonoId,
      p_campo: campo,
      p_valor_nuevo: valorNuevo.trim(),
      p_motivo: motivo.trim(),
    });
    if (error) return { ok: false, error: error.message };
  } finally {
    await consumirConfirmacion(conf.perfilId);
  }
  revalidatePath("/rrhh/abonos");
  revalidatePath("/tecnico/abonos");
  return { ok: true };
}

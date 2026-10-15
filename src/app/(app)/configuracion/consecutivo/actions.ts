"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";

// El permiso se revisa acá y otra vez en la base (fn_ajustar_consecutivo exige
// configuracion/responsable, un motivo, y no deja bajar por debajo de lo ya emitido).

export async function ajustarConsecutivo(input: {
  anio: number;
  ultimoNumero: number;
  motivo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await tienePermiso("configuracion", "responsable"))) {
    return { ok: false, error: "Solo un responsable de Configuración puede cambiar el consecutivo." };
  }
  if (!Number.isInteger(input.ultimoNumero) || input.ultimoNumero < 0) {
    return { ok: false, error: "El número debe ser un entero de 0 en adelante." };
  }
  if (!input.motivo.trim()) {
    return { ok: false, error: "Escribe el motivo del cambio: queda en el historial." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_ajustar_consecutivo", {
    p_anio: input.anio,
    p_ultimo_numero: input.ultimoNumero,
    p_motivo: input.motivo.trim(),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/configuracion/consecutivo");
  return { ok: true };
}

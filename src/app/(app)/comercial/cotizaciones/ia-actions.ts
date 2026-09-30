"use server";

import { createClient } from "@/lib/supabase/server";
import {
  describirEquipo,
  EquipoNoEncontradoError,
} from "@/lib/catalogo/describir-equipo";

export type ResultadoDescribirEquipo =
  | { ok: true; descripcion: string; fuentes: string[] }
  | { ok: false; error: string };

/**
 * Busca en la web la referencia de un EQUIPO y devuelve una descripción
 * propuesta para la cotización.
 *
 * El texto NO se guarda: vuelve a la pantalla para que Jhojan lo lea y decida.
 * Guardar el ítem sigue siendo un acto manual suyo.
 */
export async function describirEquipoConIA(input: {
  nombre: string;
  referencia: string;
  categoria: string;
}): Promise<ResultadoDescribirEquipo> {
  // Exige sesión. Sin esto, cualquiera con la URL gastaría los créditos de IA.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión vencida. Vuelve a entrar." };
  }

  // Solo equipos. Materiales y mano de obra no tienen ficha técnica que buscar,
  // y la IA terminaría inventando características.
  if (input.categoria !== "EQUIPO") {
    return {
      ok: false,
      error: "La búsqueda automática solo aplica a equipos.",
    };
  }

  try {
    const { descripcion, fuentes } = await describirEquipo(
      input.nombre,
      input.referencia,
    );
    return { ok: true, descripcion, fuentes };
  } catch (e) {
    if (e instanceof EquipoNoEncontradoError) {
      return { ok: false, error: e.message };
    }
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "No se pudo obtener la descripción. Escríbela a mano.",
    };
  }
}

"use server";

import { createClient } from "@/lib/supabase/server";

// Copia de seguridad manual — el plan actual de Supabase (Free) no incluye respaldos
// automáticos ni "restaurar a una fecha anterior" (eso solo existe desde el plan Pro
// para atrás, con PITR como add-on pago aparte). Mientras tanto, esta exportación es
// la red de seguridad real: un volcado completo de las tablas de negocio que Jhojan
// puede guardar y, si hace falta, usar para reconstruir a mano.
const TABLAS_EXPORTABLES = [
  "clientes",
  "cotizaciones",
  "cotizacion_items",
  "hitos_cobro",
  "cotizacion_polizas",
  "items_catalogo",
  "items_precios_historico",
  "configuracion_empresa",
  "polizas_catalogo",
] as const;

export interface ExportarBaseResultado {
  ok: boolean;
  error?: string;
  generadoEn?: string;
  tablas?: Record<string, unknown[]>;
}

export async function exportarBaseDatos(): Promise<ExportarBaseResultado> {
  const supabase = await createClient();
  const tablas: Record<string, unknown[]> = {};

  for (const tabla of TABLAS_EXPORTABLES) {
    const { data, error } = await supabase.from(tabla).select("*");
    if (error) {
      return { ok: false, error: `${tabla}: ${error.message}` };
    }
    tablas[tabla] = data ?? [];
  }

  return { ok: true, generadoEn: new Date().toISOString(), tablas };
}

export interface ImportarBaseResultado {
  ok: boolean;
  error?: string;
  insertados?: Record<string, number>;
}

// Importación SEGURA a propósito: solo agrega filas que no existan todavía (por id),
// nunca actualiza ni borra nada existente. Sirve para recuperar datos perdidos a partir
// de una exportación anterior, no para "restaurar" la base a un estado pasado completo
// (eso pisaría cambios hechos después del export, y no es lo que se ofrece acá).
export async function importarBaseDatos(
  contenido: string,
): Promise<ImportarBaseResultado> {
  let parsed: { tablas?: Record<string, unknown[]> };
  try {
    parsed = JSON.parse(contenido);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido" };
  }

  if (!parsed.tablas) {
    return { ok: false, error: "El archivo no tiene el formato esperado" };
  }

  const supabase = await createClient();
  const insertados: Record<string, number> = {};

  for (const tabla of TABLAS_EXPORTABLES) {
    const filas = parsed.tablas[tabla];
    if (!Array.isArray(filas) || filas.length === 0) continue;

    const { data, error } = await supabase
      .from(tabla)
      .upsert(filas, { onConflict: "id", ignoreDuplicates: true })
      .select("id");

    if (error) {
      return { ok: false, error: `${tabla}: ${error.message}` };
    }
    insertados[tabla] = data?.length ?? 0;
  }

  return { ok: true, insertados };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";

// Exportar y restaurar tocan toda la base de Comercial: solo responsables del módulo.
const SIN_PERMISO = "No tienes permiso de responsable en Comercial";

// Copia de seguridad manual — el plan actual de Supabase (Free) no incluye respaldos
// automáticos ni "restaurar a una fecha anterior" (eso solo existe desde el plan Pro
// para adelante, con PITR como add-on pago aparte). Esta es la red de seguridad real:
// cada exportación queda guardada en el bucket "respaldos" con fecha y hora exactas, y
// "Restaurar" solo puede elegir entre esos puntos reales — nunca una fecha inventada.
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

const BUCKET = "respaldos";

interface ContenidoRespaldo {
  generadoEn: string;
  tablas: Record<string, unknown[]>;
}

function nombreArchivo(fecha: Date): string {
  // 2026-09-25T14-30-05 — colones fuera del nombre por compatibilidad con Storage/OS.
  return `backup-${fecha.toISOString().replace(/:/g, "-").split(".")[0]}.json`;
}

export interface ExportarBaseResultado {
  ok: boolean;
  error?: string;
  generadoEn?: string;
  nombreArchivo?: string;
  tablas?: Record<string, unknown[]>;
}

export async function exportarBaseDatos(): Promise<ExportarBaseResultado> {
  if (!(await tienePermiso("comercial", "responsable"))) {
    return { ok: false, error: SIN_PERMISO };
  }
  const supabase = await createClient();
  const tablas: Record<string, unknown[]> = {};

  for (const tabla of TABLAS_EXPORTABLES) {
    const { data, error } = await supabase.from(tabla).select("*");
    if (error) {
      return { ok: false, error: `${tabla}: ${error.message}` };
    }
    tablas[tabla] = data ?? [];
  }

  const generadoEn = new Date();
  const nombre = nombreArchivo(generadoEn);
  const contenido: ContenidoRespaldo = {
    generadoEn: generadoEn.toISOString(),
    tablas,
  };

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(nombre, JSON.stringify(contenido), {
      contentType: "application/json",
      upsert: false,
    });

  if (errorSubida) {
    // La exportación en sí (el archivo que se descarga) sigue sirviendo aunque no se
    // haya podido guardar la copia en el servidor — se avisa, no se bloquea.
    return {
      ok: true,
      generadoEn: contenido.generadoEn,
      nombreArchivo: nombre,
      tablas,
      error: `Se generó el archivo pero no se pudo guardar una copia en el servidor (${errorSubida.message}) — igual guardá el descargado.`,
    };
  }

  return {
    ok: true,
    generadoEn: contenido.generadoEn,
    nombreArchivo: nombre,
    tablas,
  };
}

export interface RespaldoListado {
  nombre: string;
  creadoEn: string | null;
  tamanioBytes: number | null;
}

export interface ListarRespaldosResultado {
  ok: boolean;
  error?: string;
  respaldos?: RespaldoListado[];
}

export async function listarRespaldos(): Promise<ListarRespaldosResultado> {
  if (!(await tienePermiso("comercial", "responsable"))) {
    return { ok: false, error: SIN_PERMISO };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).list("", {
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    respaldos: (data ?? [])
      .filter((f) => f.name.endsWith(".json"))
      .map((f) => ({
        nombre: f.name,
        creadoEn: f.created_at ?? null,
        tamanioBytes: f.metadata?.size ?? null,
      })),
  };
}

export interface PrevisualizacionTabla {
  tabla: string;
  total: number;
  existentes: number;
  nuevos: number;
}

export interface PrevisualizarResultado {
  ok: boolean;
  error?: string;
  generadoEn?: string;
  tablas?: PrevisualizacionTabla[];
}

async function leerContenido(
  contenido: string,
): Promise<{ ok: true; datos: ContenidoRespaldo } | { ok: false; error: string }> {
  try {
    const datos = JSON.parse(contenido) as Partial<ContenidoRespaldo>;
    if (!datos.tablas) {
      return { ok: false, error: "El archivo no tiene el formato esperado" };
    }
    return { ok: true, datos: datos as ContenidoRespaldo };
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido" };
  }
}

// Cuenta, por tabla, cuántas filas del archivo ya existen (se van a REEMPLAZAR) y
// cuántas son nuevas (se van a AGREGAR) — para mostrar antes de pedir confirmación.
// No aplica ningún cambio todavía.
export async function previsualizarContenido(
  contenido: string,
): Promise<PrevisualizarResultado> {
  if (!(await tienePermiso("comercial", "responsable"))) {
    return { ok: false, error: SIN_PERMISO };
  }
  const leido = await leerContenido(contenido);
  if (!leido.ok) return { ok: false, error: leido.error };

  const supabase = await createClient();
  const resultado: PrevisualizacionTabla[] = [];

  for (const tabla of TABLAS_EXPORTABLES) {
    const filas = leido.datos.tablas[tabla];
    if (!Array.isArray(filas) || filas.length === 0) continue;

    const ids = filas
      .map((f) => (f as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string");

    let existentes = 0;
    if (ids.length > 0) {
      const { count } = await supabase
        .from(tabla)
        .select("id", { count: "exact", head: true })
        .in("id", ids);
      existentes = count ?? 0;
    }

    resultado.push({
      tabla,
      total: filas.length,
      existentes,
      nuevos: filas.length - existentes,
    });
  }

  return { ok: true, generadoEn: leido.datos.generadoEn, tablas: resultado };
}

export interface AplicarRespaldoResultado {
  ok: boolean;
  error?: string;
  resultados?: Record<string, number>;
}

// Aplica el contenido de verdad: filas cuyo id ya existe se ACTUALIZAN (reemplazan),
// filas nuevas se agregan. Se llama solo después de que el usuario confirmó explícitamente
// viendo el resultado de previsualizarContenido.
export async function aplicarContenido(
  contenido: string,
): Promise<AplicarRespaldoResultado> {
  if (!(await tienePermiso("comercial", "responsable"))) {
    return { ok: false, error: SIN_PERMISO };
  }
  const leido = await leerContenido(contenido);
  if (!leido.ok) return { ok: false, error: leido.error };

  const supabase = await createClient();
  const resultados: Record<string, number> = {};

  for (const tabla of TABLAS_EXPORTABLES) {
    const filas = leido.datos.tablas[tabla];
    if (!Array.isArray(filas) || filas.length === 0) continue;

    const { data, error } = await supabase
      .from(tabla)
      .upsert(filas, { onConflict: "id" })
      .select("id");

    if (error) {
      return { ok: false, error: `${tabla}: ${error.message}` };
    }
    resultados[tabla] = data?.length ?? 0;
  }

  return { ok: true, resultados };
}

export interface ObtenerRespaldoResultado {
  ok: boolean;
  error?: string;
  contenido?: string;
}

export async function obtenerContenidoRespaldo(
  nombre: string,
): Promise<ObtenerRespaldoResultado> {
  if (!(await tienePermiso("comercial", "responsable"))) {
    return { ok: false, error: SIN_PERMISO };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(nombre);

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo leer el archivo" };
  }

  return { ok: true, contenido: await data.text() };
}

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ConfiguracionEmpresa {
  textoDespachoAprobacion: string | null;
  bancoNombre: string | null;
  bancoTipoCuenta: string | null;
  bancoNumeroCuenta: string | null;
  bancoTitular: string | null;
  textoGarantia: string | null;
  textoValidezOferta: string | null;
}

export async function getConfiguracionEmpresa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<ConfiguracionEmpresa | null> {
  const { data, error } = await supabase
    .from("configuracion_empresa")
    .select(
      "texto_despacho_aprobacion, banco_nombre, banco_tipo_cuenta, banco_numero_cuenta, banco_titular, texto_garantia, texto_validez_oferta",
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    textoDespachoAprobacion: data.texto_despacho_aprobacion,
    bancoNombre: data.banco_nombre,
    bancoTipoCuenta: data.banco_tipo_cuenta,
    bancoNumeroCuenta: data.banco_numero_cuenta,
    bancoTitular: data.banco_titular,
    textoGarantia: data.texto_garantia,
    textoValidezOferta: data.texto_validez_oferta,
  };
}

export interface PolizaCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  pctDefault: number | null;
  vigenciaMesesDefault: number | null;
}

export async function getPolizasCatalogo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<PolizaCatalogo[]> {
  const { data, error } = await supabase
    .from("polizas_catalogo")
    .select("id, nombre, descripcion, pct_default, vigencia_meses_default")
    .eq("activo", true)
    .order("orden");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    pctDefault: row.pct_default === null ? null : Number(row.pct_default),
    vigenciaMesesDefault: row.vigencia_meses_default,
  }));
}

export interface ValorAgregadoCatalogo {
  id: string;
  titulo: string;
  texto: string;
}

/** Tolerante: si la migración 30 no se corrió, devuelve lista vacía en vez de romper. */
export async function getValoresAgregadosCatalogo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<ValorAgregadoCatalogo[]> {
  const { data, error } = await supabase
    .from("valores_agregados_catalogo")
    .select("id, titulo, texto")
    .eq("activo", true)
    .order("orden")
    .order("titulo");
  if (error) {
    console.error("No se pudo cargar el catálogo de valores agregados:", error);
    return [];
  }
  return (data ?? []) as ValorAgregadoCatalogo[];
}

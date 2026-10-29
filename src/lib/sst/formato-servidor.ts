import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUMNAS_PLANTILLA, type Ambito, type Plantilla } from "./plantillas";

export interface FirmaRegistrada {
  id: string;
  rol: string;
  nombre: string;
  documento: string;
  cargo: string | null;
  empresa: string | null;
  url: string | null;
  firmada_en_dispositivo: string;
  recibida_en: string;
  registrada_por: string;
  registrada_por_nombre: string | null;
  dispositivo: string | null;
  gps_estado: string | null;
  lat: number | null;
  lng: number | null;
  hash_contenido: string;
}

export interface FormatoCompleto {
  id: string;
  plantilla: Plantilla;
  proyecto: string | null;
  lugar: string | null;
  fecha: string;
  respuestas: Record<string, unknown>;
  /** Migración 83: quién estuvo en la obra (firman todos). null en formatos de antes. */
  tecnicos_en_obra: { nombre: string; documento: string }[] | null;
  /** Migración 85: SG-SST o acta de Proyectos. */
  ambito: Ambito;
  estado: "borrador" | "firmado" | "aprobado" | "anulado";
  creado_por_nombre: string | null;
  creado_en: string;
  sellado_en: string | null;
  hash_contenido: string | null;
  aprobado_en: string | null;
  aprobado_por_nombre: string | null;
  anulado_en: string | null;
  motivo_anulacion: string | null;
  archivos: Record<string, { id: string; url: string | null }[]>;
  firmas: FirmaRegistrada[];
  /** null = todavía no sellado; true/false = lo que dice fn_sst_formato_integro. */
  integro: boolean | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** Todo lo del formato, con enlaces de 10 minutos a fotos y firmas. Null si no existe o no se ve. */
export async function leerFormato(supabase: Db, id: string): Promise<FormatoCompleto | null> {
  const { data: f } = await supabase
    .from("sst_formatos")
    .select("id, plantilla_id, proyecto_id, lugar, fecha, respuestas, tecnicos_en_obra, ambito, estado, creado_por, creado_en, sellado_en, hash_contenido, aprobado_por, aprobado_en, anulado_en, motivo_anulacion")
    .eq("id", id)
    .maybeSingle();
  if (!f) return null;
  const [plantillaRes, archivosRes, firmasRes, personalRes, proyectosRes, integroRes] = await Promise.all([
    supabase.from("sst_plantillas").select(COLUMNAS_PLANTILLA).eq("id", f.plantilla_id).single(),
    supabase.from("sst_formato_archivos").select("id, campo_id, path").eq("formato_id", id).order("created_at"),
    supabase
      .from("sst_formato_firmas")
      .select("id, rol, nombre, documento, cargo, empresa, imagen_path, firmada_en_dispositivo, recibida_en, registrada_por, dispositivo, gps_estado, lat, lng, hash_contenido")
      .eq("formato_id", id)
      .order("recibida_en"),
    supabase.rpc("fn_sst_personal"),
    f.proyecto_id ? supabase.rpc("fn_proyectos_nombres") : Promise.resolve({ data: [] }),
    f.hash_contenido ? supabase.rpc("fn_sst_formato_integro", { p_formato_id: id }) : Promise.resolve({ data: null }),
  ]);
  const nombres = new Map<string, string>();
  for (const p of (personalRes.data ?? []) as { perfil_id: string | null; nombre: string }[]) if (p.perfil_id) nombres.set(p.perfil_id, p.nombre);
  let proyecto = ((proyectosRes.data ?? []) as { id: string; codigo: string; nombre: string }[]).find((p) => p.id === f.proyecto_id);
  // SG-SST sin Proyectos (migración 105): el nombre de la obra de un acta firmada, y nada más.
  if (!proyecto && f.proyecto_id) {
    const { data } = await supabase.rpc("fn_sgsst_obras_de_actas");
    proyecto = ((data ?? []) as { id: string; codigo: string; nombre: string }[]).find((p) => p.id === f.proyecto_id);
  }

  const archivos = (archivosRes.data ?? []) as { id: string; campo_id: string; path: string }[];
  const firmas = (firmasRes.data ?? []) as (Omit<FirmaRegistrada, "url" | "registrada_por_nombre"> & { imagen_path: string })[];
  const rutas = [...archivos.map((a) => a.path), ...firmas.map((x) => x.imagen_path)];
  const enlaces = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from("sgsst").createSignedUrls(rutas, 600);
    for (const e of data ?? []) if (e.path && e.signedUrl) enlaces.set(e.path, e.signedUrl);
  }
  const porCampo: FormatoCompleto["archivos"] = {};
  for (const a of archivos) (porCampo[a.campo_id] ??= []).push({ id: a.id, url: enlaces.get(a.path) ?? null });

  return {
    id: f.id,
    plantilla: plantillaRes.data as Plantilla,
    proyecto: proyecto ? `${proyecto.codigo} · ${proyecto.nombre}` : null,
    lugar: f.lugar,
    fecha: f.fecha,
    respuestas: f.respuestas ?? {},
    tecnicos_en_obra: f.tecnicos_en_obra ?? null,
    ambito: f.ambito ?? "sgsst",
    estado: f.estado,
    creado_por_nombre: nombres.get(f.creado_por) ?? null,
    creado_en: f.creado_en,
    sellado_en: f.sellado_en,
    hash_contenido: f.hash_contenido,
    aprobado_en: f.aprobado_en,
    aprobado_por_nombre: f.aprobado_por ? (nombres.get(f.aprobado_por) ?? null) : null,
    anulado_en: f.anulado_en,
    motivo_anulacion: f.motivo_anulacion,
    archivos: porCampo,
    firmas: firmas.map((x) => ({ ...x, url: enlaces.get(x.imagen_path) ?? null, registrada_por_nombre: nombres.get(x.registrada_por) ?? null })),
    integro: f.hash_contenido ? ((integroRes.data as boolean | null) ?? null) : null,
  };
}

export function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));
}

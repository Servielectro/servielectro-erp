"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tipoPorNombre } from "@/lib/licitaciones/etapas";

// Los documentos del proceso según Datos Abiertos (dmgg-8hin, verificado el 2026-11-07):
//   · la llave es `proceso` = id_del_portafolio de p6dx (CO1.BDOS…), no el id_del_proceso (CO1.REQ…);
//   · trae nombre, extensión, tamaño, fecha de carga, número de contrato y url_descarga_documento;
//   · NO dice qué es cada archivo: el tipo se deduce del nombre (tipo_deducido = true);
//   · va ~1 día atrás de SECOP.
// Se guarda la REFERENCIA y el enlace. El archivo no.
//
// ─── NO «ARREGLAR» LA DESCARGA ────────────────────────────────────────────────────────────────
// community.secop.gov.co responde 403 a la descarga automática (firewall Azure Application Gateway,
// visto el 2026-11-07). Es un control antibot de Colombia Compra Eficiente. NO se rodea: ni con
// otro user-agent, ni con un proxy, ni desde otra IP, ni haciendo que el navegador del usuario
// descargue por detrás, aunque los documentos sean públicos. Decisión del responsable del proyecto.
// El camino aprobado: la persona abre el documento en SECOP y lo sube a la ficha (Documentos.tsx).
// Si Colombia Compra llega a dar acceso programático, se usa ESE acceso, con sus condiciones.
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// Escribe con la sesión de quien lo pide: la RLS de licitacion_documentos exige trabajar en
// Oportunidades, y se revisa aquí antes de llamar a nadie.

type Resultado = { ok: true; encontrados: number; nuevos: number; portafolio: string } | { ok: false; error: string };

const DATOS = "https://www.datos.gov.co/resource";
const ID_PROCESO = /^CO1\.REQ\.\d+$/;
const ID_PORTAFOLIO = /^CO1\.BDOS\.\d+$/;

interface FilaDmgg {
  id_documento?: string;
  proceso?: string;
  n_mero_de_contrato?: string;
  nombre_archivo?: string;
  descripci_n?: string;
  extensi_n?: string;
  tamanno_archivo?: string;
  fecha_carga?: string;
  url_descarga_documento?: { url?: string } | string;
}

async function socrata<T>(dataset: string, params: Record<string, string>): Promise<T[]> {
  const u = new URL(`${DATOS}/${dataset}.json`);
  u.search = new URLSearchParams(params).toString();
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`Datos Abiertos respondió ${r.status} (${dataset}).`);
  return (await r.json()) as T[];
}

export async function traerDocumentosSecop(licitacionId: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data: nivel } = await supabase.rpc("fn_permiso_seccion", { p_modulo: "licitaciones", p_seccion: "oportunidades" });
  if (nivel !== "trabajar" && nivel !== "responsable") return { ok: false, error: "Traer documentos es de quien trabaja Oportunidades." };

  const { data: l, error } = await supabase.from("licitaciones").select("id, id_del_proceso, secop").eq("id", licitacionId).maybeSingle();
  if (error || !l) return { ok: false, error: error?.message ?? "No se encontró la licitación." };
  const fila = l as { id: string; id_del_proceso: string; secop: Record<string, unknown> | null };
  if (!fila.secop) return { ok: false, error: "Esta licitación no vino del radar de SECOP: no hay de dónde traer documentos." };

  try {
    // El portafolio: del último barrido (desde la 147 lo trae) o, si no, de p6dx.
    let portafolio = typeof fila.secop.id_del_portafolio === "string" ? fila.secop.id_del_portafolio : "";
    if (!ID_PORTAFOLIO.test(portafolio)) {
      if (!ID_PROCESO.test(fila.id_del_proceso)) return { ok: false, error: `Identificador de proceso inesperado: ${fila.id_del_proceso}` };
      const p = await socrata<{ id_del_portafolio?: string }>("p6dx-8zbt", {
        $select: "id_del_portafolio",
        $where: `id_del_proceso = '${fila.id_del_proceso}'`,
        $limit: "1",
      });
      portafolio = p[0]?.id_del_portafolio ?? "";
      if (!ID_PORTAFOLIO.test(portafolio)) return { ok: false, error: "SECOP no trae el portafolio de este proceso: no se pueden buscar sus documentos." };
    }

    const docs = await socrata<FilaDmgg>("dmgg-8hin", {
      $where: `proceso = '${portafolio}'`,
      $order: "fecha_carga",
      $limit: "2000",
    });
    const { data: ya } = await supabase.from("licitacion_documentos").select("secop_id_documento").eq("licitacion_id", fila.id);
    const existentes = new Set(((ya ?? []) as { secop_id_documento: number | null }[]).map((d) => String(d.secop_id_documento)));

    const filas = docs
      .filter((d) => /^\d+$/.test(d.id_documento ?? "") && (d.nombre_archivo ?? "").trim())
      .map((d) => {
        const url = typeof d.url_descarga_documento === "string" ? d.url_descarga_documento : d.url_descarga_documento?.url ?? null;
        const contrato = (d.n_mero_de_contrato ?? "").trim() || null;
        return {
          licitacion_id: fila.id,
          secop_id_documento: Number(d.id_documento),
          nombre_original: d.nombre_archivo!.trim(),
          tipo: contrato ? "ejecucion" : tipoPorNombre(d.nombre_archivo!),
          tipo_deducido: true,
          url_origen: url && url.startsWith("https://community.secop.gov.co/") ? url : null,
          extension: (d.extensi_n ?? "").toLowerCase() || null,
          tamano_secop: /^\d+$/.test(d.tamanno_archivo ?? "") ? Number(d.tamanno_archivo) : null,
          cargado_en_secop: d.fecha_carga?.slice(0, 10) ?? null,
          secop_contrato: contrato,
          notas: d.descripci_n && d.descripci_n !== d.nombre_archivo ? d.descripci_n.slice(0, 500) : null,
        };
      });
    const nuevas = filas.filter((f) => !existentes.has(String(f.secop_id_documento)));
    if (nuevas.length) {
      // Sin .select(): la fila no se pide de vuelta (ver insert-sin-returning). Ignora repetidos.
      const { error: e } = await supabase
        .from("licitacion_documentos")
        .upsert(nuevas, { onConflict: "licitacion_id,secop_id_documento", ignoreDuplicates: true });
      if (e) return { ok: false, error: `No se pudieron guardar: ${e.message}` };
    }
    revalidatePath(`/licitaciones/oportunidades/${fila.id}`);
    return { ok: true, encontrados: filas.length, nuevos: nuevas.length, portafolio };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo consultar Datos Abiertos." };
  }
}

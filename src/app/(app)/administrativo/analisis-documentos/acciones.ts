"use server";

import { createClient } from "@/lib/supabase/server";
import { generarConIA, type ParteIA } from "@/lib/ia/ia";
import { textoDeDocx } from "@/lib/documentos/docx-texto";
import { ESQUEMA_LECTURA, INSTRUCCIONES_LECTURA, type LecturaContrato } from "@/lib/documentos/lectura-contrato";

// Lee UN documento de obra con IA y guarda la lectura (migración 102). El archivo se baja de
// Storage con la sesión de quien pide: si no lo puede ver, la base no lo entrega. Un escaneado de
// 20 páginas tarda; la página que llama tiene maxDuration de 300 s.

export type ResultadoLectura = { ok: true } | { ok: false; error: string };

const POR_PROVEEDOR_MS = 140_000;

export async function leerDocumento(documentoId: string): Promise<ResultadoLectura> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida: vuelve a entrar." };

  const { data: doc, error: e1 } = await supabase
    .from("proyecto_documentos")
    .select("id, nombre, nombre_archivo, path, mime")
    .eq("id", documentoId)
    .maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  if (!doc) return { ok: false, error: "No encuentro ese documento (o no tienes permiso para verlo)." };

  const { data: blob, error: e2 } = await supabase.storage.from("documentos-proyectos").download(doc.path);
  if (e2 || !blob) return { ok: false, error: `No se pudo abrir el archivo: ${e2?.message ?? "no encontrado"}` };
  const buffer = Buffer.from(await blob.arrayBuffer());

  const partes: ParteIA[] = [{ texto: `Documento: ${doc.nombre} (${doc.nombre_archivo}).` }];
  if (doc.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const texto = textoDeDocx(buffer);
    if (!texto) return { ok: false, error: "No pude sacar el texto de ese Word." };
    partes.push({ texto: `Texto completo del documento (Word, sin páginas: usa pagina null):\n\n${texto}` });
  } else if (doc.mime === "application/pdf" || doc.mime.startsWith("image/")) {
    partes.push({ archivo: { mime: doc.mime, base64: buffer.toString("base64"), nombre: doc.nombre_archivo } });
  } else {
    return { ok: false, error: "Ese tipo de archivo no se puede leer (sirven PDF, Word .docx y fotos). Un .doc viejo: guárdalo como .docx o PDF y súbelo." };
  }

  let lectura: LecturaContrato;
  let r: Awaited<ReturnType<typeof generarConIA>>;
  try {
    r = await generarConIA(
      { para: "leer el documento", instrucciones: INSTRUCCIONES_LECTURA, partes, esquemaJson: ESQUEMA_LECTURA, nombreEsquema: "lectura_contrato" },
      POR_PROVEEDOR_MS,
    );
    lectura = JSON.parse(r.texto) as LecturaContrato;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "La IA no devolvió una lectura válida." };
  }
  if (!lectura || typeof lectura !== "object" || Array.isArray(lectura)) return { ok: false, error: "La IA no devolvió una lectura válida." };

  const { error: e3 } = await supabase.from("documento_lecturas").insert({
    documento_id: doc.id,
    lectura,
    proveedor: r.proveedor,
    modelo: r.modelo,
    tokens_entrada: r.tokensEntrada,
    tokens_salida: r.tokensSalida,
  });
  if (e3) return { ok: false, error: `Se leyó pero no se pudo guardar: ${e3.message}` };
  return { ok: true };
}

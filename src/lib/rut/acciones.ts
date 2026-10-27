"use server";

import { PDFDocument } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { proveedoresConfigurados } from "@/lib/ia/ia";
import { extraerRut, type ResultadoExtraccionRut } from "@/lib/documentos/extraer-rut";

// Lectura del RUT, en dos pasos que la pantalla maneja (2026-10-27):
//   1. El celular sube el archivo DIRECTO a Storage (nunca dentro de esta llamada: el límite de
//      1 MB de las acciones del servidor rechazaba los PDF y las fotos, "Body exceeded 1 MB").
//   2. Esta acción lo baja de Storage, recorta el PDF a sus primeras páginas y lo lee con UN
//      proveedor. La pantalla llama proveedor por proveedor para decir con cuál está intentando
//      y pasar al siguiente si el primero falla o no contesta en 20 s.

const BUCKET = "documentos-clientes";
// Del RUT importa la hoja 1 (identificación, ubicación, responsabilidades) y la de representación
// legal, que suele venir de segunda o tercera: 3 páginas bastan y pesan mucho menos que el documento entero.
const PAGINAS_MAX = 3;

/** Los proveedores con clave cargada, en orden (solo nombres). */
export async function proveedoresRut(): Promise<("OpenAI" | "Gemini")[]> {
  return proveedoresConfigurados();
}

/** Lo justo para la IA: un PDF de 6 hojas va con 3. Si no se puede recortar, va entero. */
async function recortar(buffer: Buffer, nombre: string): Promise<{ buffer: Buffer; paginas: number | null; enviadas: number | null }> {
  if (!nombre.toLowerCase().endsWith(".pdf")) return { buffer, paginas: null, enviadas: null };
  try {
    const original = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const total = original.getPageCount();
    if (total <= PAGINAS_MAX) return { buffer, paginas: total, enviadas: total };
    const corto = await PDFDocument.create();
    const copiadas = await corto.copyPages(original, Array.from({ length: PAGINAS_MAX }, (_, i) => i));
    copiadas.forEach((p) => corto.addPage(p));
    return { buffer: Buffer.from(await corto.save()), paginas: total, enviadas: PAGINAS_MAX };
  } catch {
    return { buffer, paginas: null, enviadas: null };
  }
}

export type LecturaRut =
  | { ok: true; resultado: ResultadoExtraccionRut; proveedor: "OpenAI" | "Gemini"; segundos: number; paginas: string | null }
  | { ok: false; error: string };

/** Lee con UN proveedor el RUT que el celular ya subió a Storage. */
export async function leerRutSubido(storagePath: string, nombreArchivo: string, proveedor: "OpenAI" | "Gemini"): Promise<LecturaRut> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida: vuelve a entrar." };
  if (!/^(pendientes|clientes)\//.test(storagePath)) return { ok: false, error: "Ruta de archivo no válida." };

  // Con la sesión de quien lee: si no puede ver ese archivo, la base no lo entrega.
  const { data: blob, error: errBajar } = await supabase.storage.from(BUCKET).download(storagePath);
  if (errBajar || !blob) return { ok: false, error: `No se pudo abrir el archivo subido: ${errBajar?.message ?? "no encontrado"}` };

  const inicio = Date.now();
  const { buffer, paginas, enviadas } = await recortar(Buffer.from(await blob.arrayBuffer()), nombreArchivo);
  try {
    const resultado = await extraerRut(buffer, nombreArchivo, proveedor);
    return {
      ok: true,
      resultado,
      proveedor: resultado.proveedor,
      segundos: Math.round((Date.now() - inicio) / 1000),
      paginas: paginas && enviadas && paginas > enviadas ? `se leyeron las primeras ${enviadas} de ${paginas} páginas` : null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido leyendo el RUT" };
  }
}

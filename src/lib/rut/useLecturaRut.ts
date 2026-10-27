"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerRutSubido, proveedoresRut } from "./acciones";
import type { ResultadoExtraccionRut } from "@/lib/documentos/extraer-rut";

const BUCKET = "documentos-clientes";

export type FaseLectura =
  | { fase: "inactivo" }
  | { fase: "subiendo"; segundos: number }
  | { fase: "leyendo"; proveedor: string; numero: number; de: number; segundos: number; fallosPrevios: string[] }
  | { fase: "error"; mensaje: string };

export interface RutLeido {
  storagePath: string;
  nombreArchivo: string;
  resultado: ResultadoExtraccionRut;
  proveedor: string;
  nota: string | null;
}

function mimePorNombre(nombre: string): string | null {
  const ext = nombre.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return null;
}

/** Una foto del RUT: lado mayor 2000 px en JPEG (legible y liviana). Si no se puede, va tal cual. */
async function achicarFoto(f: File): Promise<File> {
  try {
    const img = await createImageBitmap(f);
    const escala = Math.min(1, 2000 / Math.max(img.width, img.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d")?.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    img.close();
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}

/**
 * La lectura del RUT, igual en todos los sitios donde se crea o corrige un cliente:
 *   1. el archivo sube DIRECTO a Storage (las fotos, achicadas);
 *   2. se lee proveedor por proveedor (tope de 20 s cada uno en el servidor), diciendo con cuál
 *      se está intentando y por qué se pasó al siguiente;
 *   3. si fallan todos, lo dice; lo que la persona ya escribió no se toca.
 * `cancelar` deja seguir a mano en cualquier momento (la respuesta que llegue tarde se ignora).
 */
export function useLecturaRut() {
  const [estado, setEstado] = useState<FaseLectura>({ fase: "inactivo" });
  const turno = useRef(0);
  const desde = useRef(0);

  // Reloj: los segundos que lleva, para que no parezca colgado.
  useEffect(() => {
    if (estado.fase !== "subiendo" && estado.fase !== "leyendo") return;
    const t = setInterval(() => {
      setEstado((e) => (e.fase === "subiendo" || e.fase === "leyendo" ? { ...e, segundos: Math.round((Date.now() - desde.current) / 1000) } : e));
    }, 1000);
    return () => clearInterval(t);
  }, [estado.fase]);

  const cancelar = useCallback(() => {
    turno.current++;
    setEstado({ fase: "inactivo" });
  }, []);

  const leer = useCallback(async (original: File, destino: { clienteId?: string | null }): Promise<RutLeido | null> => {
    const mio = ++turno.current;
    const vigente = () => mio === turno.current;
    if (!mimePorNombre(original.name)) {
      setEstado({ fase: "error", mensaje: `“${original.name}” no es un PDF ni una foto. Sube el RUT en PDF o como foto.` });
      return null;
    }
    const archivo = original.type.startsWith("image/") && !/heic|heif/i.test(original.type) ? await achicarFoto(original) : original;
    desde.current = Date.now();
    setEstado({ fase: "subiendo", segundos: 0 });

    const supabase = createClient();
    const yo = (await supabase.auth.getUser()).data.user?.id;
    if (!yo) {
      setEstado({ fase: "error", mensaje: "Tu sesión se cerró: vuelve a entrar." });
      return null;
    }
    const nombre = archivo.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = destino.clienteId ? `clientes/${destino.clienteId}/rut/${Date.now()}-${nombre}` : `pendientes/${yo}/${Date.now()}-${nombre}`;
    const { error: eSubida } = await supabase.storage.from(BUCKET).upload(storagePath, archivo, { contentType: mimePorNombre(archivo.name) ?? undefined, upsert: false });
    if (!vigente()) return null;
    if (eSubida) {
      setEstado({ fase: "error", mensaje: `No se pudo subir el archivo: ${eSubida.message}. Llena los datos a mano.` });
      return null;
    }

    let proveedores: string[] = [];
    try {
      proveedores = await proveedoresRut();
    } catch {
      proveedores = [];
    }
    if (!vigente()) return null;
    if (!proveedores.length) {
      setEstado({ fase: "error", mensaje: "No hay ningún servicio de lectura configurado en el servidor. Llena los datos a mano." });
      return null;
    }

    const fallos: string[] = [];
    for (let i = 0; i < proveedores.length; i++) {
      const p = proveedores[i] as "OpenAI" | "Gemini";
      desde.current = Date.now();
      setEstado({ fase: "leyendo", proveedor: p, numero: i + 1, de: proveedores.length, segundos: 0, fallosPrevios: [...fallos] });
      let r: Awaited<ReturnType<typeof leerRutSubido>>;
      try {
        r = await leerRutSubido(storagePath, archivo.name, p);
      } catch (e) {
        r = { ok: false, error: e instanceof Error ? e.message : "no respondió" };
      }
      if (!vigente()) return null;
      if (r.ok) {
        setEstado({ fase: "inactivo" });
        return { storagePath, nombreArchivo: archivo.name, resultado: r.resultado, proveedor: r.proveedor, nota: r.paginas };
      }
      fallos.push(r.error.replace(/^No se pudo leer el RUT con IA \((.*)\)\. Llena los datos a mano\.$/, "$1"));
    }
    setEstado({
      fase: "error",
      mensaje: `No se pudo leer el RUT: ${fallos.join("; ")}. Llena los datos a mano: lo que ya escribiste se conserva. El archivo quedó guardado.`,
    });
    return null;
  }, []);

  return { estado, leer, cancelar, limpiar: () => setEstado({ fase: "inactivo" }) };
}

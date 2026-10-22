"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { comprimirFoto } from "@/lib/tecnico/captura";
import { nombreSeguro } from "@/lib/rrhh";
import { BUCKET_SOPORTES, MAX_BYTES_SOPORTE, MIME_SOPORTE } from "@/lib/rrhh-registros";

/**
 * Sube un archivo al bucket privado de RRHH. Las fotos se comprimen igual que las de las
 * visitas (lado mayor 1280 px, sin EXIF). Quién puede subir a qué carpeta lo decide la base
 * (fn_rrhh_soporte_subible): si no puede, Storage lo rechaza. Nunca reemplaza (upsert: false).
 */
export async function subirSoporte(carpeta: string, archivo: File): Promise<{ path: string; mime: string; bytes: number; nombre: string }> {
  const esImagen = archivo.type.startsWith("image/") && archivo.type !== "image/heic";
  let cuerpo: Blob = archivo;
  let mime = archivo.type || "application/octet-stream";
  if (esImagen) {
    cuerpo = await comprimirFoto(archivo);
    mime = "image/jpeg";
  }
  if (!MIME_SOPORTE.includes(mime)) throw new Error("Ese tipo de archivo no se acepta: sube una foto o un PDF.");
  if (cuerpo.size > MAX_BYTES_SOPORTE) throw new Error("El archivo pesa más de 10 MB.");
  const base = nombreSeguro(archivo.name.replace(/\.[^.]+$/, "")) || "archivo";
  const extension = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : (mime.split("/")[1] ?? "bin");
  const path = `${carpeta}/${Date.now()}-${base}.${extension}`;
  const { error } = await createClient().storage.from(BUCKET_SOPORTES).upload(path, cuerpo, { contentType: mime, upsert: false });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return { path, mime, bytes: cuerpo.size, nombre: archivo.name };
}

/** Abre un archivo privado con un enlace de 5 minutos. Si la base no deja leerlo, lo dice. */
export function AbrirArchivo({
  path,
  children,
  className,
  descargar,
  onAbierto,
}: {
  path: string;
  children: React.ReactNode;
  className?: string;
  /** Nombre con el que se descarga; sin esto, se abre en otra pestaña. */
  descargar?: string;
  onAbierto?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={abriendo}
        onClick={async () => {
          setError(null);
          setAbriendo(true);
          // La pestaña se abre ya (con el clic), si no el navegador del celular la bloquea.
          const ventana = descargar ? null : window.open("", "_blank");
          try {
            const { data, error: e } = await createClient()
              .storage.from(BUCKET_SOPORTES)
              .createSignedUrl(path, 300, descargar ? { download: descargar } : undefined);
            if (e || !data) throw new Error(e?.message ?? "sin enlace");
            if (ventana) ventana.location.href = data.signedUrl;
            else window.location.href = data.signedUrl;
            onAbierto?.();
          } catch (e) {
            ventana?.close();
            setError(`No se pudo abrir: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            setAbriendo(false);
          }
        }}
        className={className ?? "inline-flex min-h-9 items-center font-semibold text-[#A82323] underline disabled:opacity-50"}
      >
        {abriendo ? "Abriendo…" : children}
      </button>
      {error && <span className="block text-xs text-red-700">{error}</span>}
    </>
  );
}

/** Selector de archivo con cámara: "Tomar foto" o "Elegir archivo" (foto o PDF). */
export function ElegirArchivo({
  onElegido,
  deshabilitado,
  textoFoto = "📷 Tomar foto",
  textoArchivo = "Elegir archivo",
  soloPdf,
}: {
  onElegido: (archivo: File) => void;
  deshabilitado?: boolean;
  textoFoto?: string;
  textoArchivo?: string;
  soloPdf?: boolean;
}) {
  const clase =
    "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-slate-400 px-3 text-sm font-semibold";
  const al = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onElegido(f);
  };
  return (
    <div className={`flex gap-2 ${deshabilitado ? "pointer-events-none opacity-40" : ""}`}>
      {!soloPdf && (
        <label className={clase}>
          {textoFoto}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={al} />
        </label>
      )}
      <label className={clase}>
        {textoArchivo}
        <input type="file" accept={soloPdf ? "application/pdf,image/*" : "image/*,application/pdf"} className="hidden" onChange={al} />
      </label>
    </div>
  );
}

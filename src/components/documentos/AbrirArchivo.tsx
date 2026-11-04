"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Ver y descargar un archivo de un bucket privado. El enlace se firma AL TOCAR, con la sesión de
 * quien mira (en el portal, la política portal_cliente_descarga solo deja firmar lo publicado),
 * y dura 2 minutos. Así un enlace copiado no queda vivo.
 */
export function AbrirArchivo({ bucket, path, titulo }: { bucket: string; path: string; titulo: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : "";
  const nombreDescarga = `${titulo.replace(/[\\/:*?"<>|]+/g, " ").trim() || "documento"}${ext}`;

  async function firmar(descargar: boolean): Promise<string> {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 120, descargar ? { download: nombreDescarga } : undefined);
    if (error || !data?.signedUrl) throw new Error("No se pudo abrir el documento. Si sigue pasando, avísale a Servielectro.");
    return data.signedUrl;
  }

  async function ver() {
    setError(null);
    setOcupado(true);
    // La pestaña se abre YA (dentro del toque): si se abre después de esperar la firma, el
    // celular la bloquea como ventana emergente.
    const pestana = window.open("", "_blank");
    try {
      const url = await firmar(false);
      if (pestana) pestana.location.href = url;
      else window.location.href = url;
    } catch (e) {
      pestana?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function descargar() {
    setError(null);
    setOcupado(true);
    try {
      // Con "download" el servidor responde como adjunto: el navegador lo guarda y no sale de aquí.
      window.location.href = await firmar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={ocupado} onClick={() => void ver()} className="min-h-12 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-400">
          Ver
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void descargar()}
          className="min-h-12 rounded-lg border-2 border-slate-900 px-3 text-sm font-semibold text-slate-900 disabled:border-slate-300 disabled:text-slate-400"
        >
          Descargar
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

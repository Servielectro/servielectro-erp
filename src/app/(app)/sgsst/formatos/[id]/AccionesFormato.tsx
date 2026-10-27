"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Aprobar (firmado → aprobado) y anular con motivo: solo la gestión SST. Nada se borra. */
export function AccionesFormato({ id, estado, gestiona }: { id: string; estado: string; gestiona: boolean }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (estado === "anulado") return null;
  if (!gestiona) return <p className="text-sm text-slate-500">Aprobar o anular un formato lo hace la gestión SST.</p>;

  const cambiar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("sst_formatos").update(cambios).eq("id", id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: el formato cambió o no tienes permiso.");
      setAnulando(false);
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      {estado === "firmado" && (
        <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: "aprobado" })} className="min-h-11 w-full rounded-md bg-green-700 text-sm font-semibold text-white disabled:opacity-40">
          Aprobar (revisado)
        </button>
      )}
      {estado === "borrador" && <p className="text-sm text-slate-600">Se aprueba cuando esté firmado y cerrado en sitio.</p>}
      {anulando ? (
        <div className="space-y-1">
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Por qué se anula (queda en el registro)" className="w-full rounded-md border border-slate-300 px-2 py-1 text-base" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAnulando(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
              Cancelar
            </button>
            <button type="button" disabled={pendiente || !motivo.trim()} onClick={() => cambiar({ estado: "anulado", motivo_anulacion: motivo.trim() })} className="min-h-11 flex-1 rounded-md bg-red-700 text-sm font-semibold text-white disabled:opacity-40">
              Anular
            </button>
          </div>
          {!motivo.trim() && <p className="text-xs text-slate-500">Escribe por qué se anula.</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setAnulando(true)} className="min-h-11 w-full rounded-md border border-red-300 text-sm text-red-800">
          Anular formato (no se borra: queda con el motivo)
        </button>
      )}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

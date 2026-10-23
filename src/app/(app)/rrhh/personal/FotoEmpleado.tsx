"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_PERSONAL, subirSoporte } from "@/components/rrhh/archivos";

/** Foto de la ficha (Subir foto / Quitar). Quitar no borra el archivo: deja de usarlo. */
export function FotoEmpleado({ empleadoId, url }: { empleadoId: string; url: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cambiar = (path: string | null) =>
    empezar(async () => {
      setError(null);
      const { error: e } = await createClient().from("empleados").update({ foto_path: path }).eq("id", empleadoId);
      if (e) return setError(e.message);
      router.refresh();
    });
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- enlace firmado de Storage, temporal
        <img src={url} alt="Foto" className="h-20 w-20 rounded-lg object-cover" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-200 text-2xl text-slate-500">👤</div>
      )}
      <label className={`cursor-pointer text-xs font-semibold text-[#A82323] underline ${pendiente ? "opacity-40" : ""}`}>
        {pendiente ? "Subiendo…" : "Subir foto"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            empezar(async () => {
              setError(null);
              try {
                const s = await subirSoporte(`personal/${empleadoId}/foto`, f, BUCKET_PERSONAL);
                const { error: er } = await createClient().from("empleados").update({ foto_path: s.path }).eq("id", empleadoId);
                if (er) throw new Error(er.message);
                router.refresh();
              } catch (x) {
                setError(x instanceof Error ? x.message : String(x));
              }
            });
          }}
        />
      </label>
      {url && (
        <button type="button" disabled={pendiente} onClick={() => cambiar(null)} className="text-xs text-slate-600 underline">
          Quitar
        </button>
      )}
      {error && <p className="max-w-24 text-xs text-red-700">{error}</p>}
    </div>
  );
}

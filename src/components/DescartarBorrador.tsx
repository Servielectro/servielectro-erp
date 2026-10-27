"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * "Descartar borrador" (migración 92): para lo que nunca llegó a ser prueba — sin firmas, sin
 * archivos, y solo quien lo creó. Se elimina de verdad. Es una acción distinta de "Anular" (que
 * conserva el registro con su motivo) y se llama distinto a propósito. La base vuelve a
 * comprobar todo: si entre tanto alguien firmó, lo rechaza con el motivo.
 */
export function DescartarBorrador({
  funcion,
  id,
  que,
  volverA,
}: {
  funcion: "fn_descartar_formato" | "fn_descartar_reunion";
  id: string;
  /** "el acta", "el formato", "la reunión" */
  que: string;
  volverA: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function descartar() {
    if (
      !window.confirm(
        `Descartar ${que}: como no tiene firmas ni archivos, se elimina de verdad y no queda en ninguna lista.\n\nSi ya sirvió para algo, mejor anúlalo con motivo.\n\n¿Descartar?`,
      )
    )
      return;
    empezar(async () => {
      setError(null);
      const { error: e } = await createClient().rpc(funcion, funcion === "fn_descartar_formato" ? { p_formato_id: id } : { p_reunion_id: id });
      if (e) return setError(e.message);
      router.replace(volverA);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
      <button
        type="button"
        onClick={descartar}
        disabled={pendiente}
        className="min-h-11 w-full rounded-md border border-slate-400 text-sm font-semibold text-slate-800 disabled:opacity-40"
      >
        {pendiente ? "Descartando…" : "Descartar borrador (no tiene firmas ni archivos)"}
      </button>
      <p className="text-xs text-slate-500">Para borradores de prueba o hechos por error. Se elimina; no es lo mismo que anular.</p>
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

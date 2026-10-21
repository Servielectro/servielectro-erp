"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cerrarVisita } from "../../actions";

/**
 * "Dar por terminada" (obra en curso) o "Cerrar" (visita firmada). Pide confirmación con una
 * nota opcional: es final y no se deshace. Quién y cuándo los pone la base (migración 60).
 */
export function CierreVisita({ visitaId, modo }: { visitaId: string; modo: "terminar_obra" | "cerrar_firmada" }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const titulo = modo === "terminar_obra" ? "Dar por terminada" : "Cerrar visita";

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="min-h-11 rounded-lg border-2 border-slate-900 px-4 text-sm font-semibold text-slate-900"
      >
        {titulo}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm">
      <p className="font-semibold text-amber-950">{titulo}: es final, no se deshace.</p>
      {modo === "terminar_obra" && (
        <p className="text-amber-900">
          Después de cerrarla, el técnico ya no puede subir nada de esta obra. Si le quedó algo sin señal (fotos o el
          reporte del último día), que sincronice antes.
        </p>
      )}
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={2}
        placeholder={modo === "terminar_obra" ? "Nota (opcional), ej.: entregada con la visita del 30/10" : "Nota (opcional)"}
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base"
      />
      {error && <p className="rounded-md bg-red-100 px-2 py-1 text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={pendiente}
          className="min-h-11 rounded-lg border border-slate-400 px-4 font-medium"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const r = await cerrarVisita(visitaId, nota);
              if (!r.ok) return setError(r.error);
              setAbierto(false);
              router.refresh();
            })
          }
          className="min-h-11 flex-1 rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:opacity-50"
        >
          {pendiente ? "Cerrando…" : `Sí, ${titulo.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

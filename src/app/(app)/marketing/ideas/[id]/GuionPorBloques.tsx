"use client";

import { useState } from "react";
import type { BloqueGuion } from "@/lib/marketing";

/** El guion para leer mientras se graba, con el cartel destacado, y para editar bloque por bloque. */
export function GuionPorBloques({
  bloques,
  editable,
  sucia,
  pendiente,
  onCambio,
  onGuardar,
}: {
  bloques: BloqueGuion[];
  editable: boolean;
  sucia: boolean;
  pendiente: boolean;
  onCambio: (b: BloqueGuion[]) => void;
  onGuardar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const cambiar = (i: number, cambios: Partial<BloqueGuion>) => onCambio(bloques.map((b, j) => (j === i ? { ...b, ...cambios } : b)));

  return (
    <section className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Guion</h2>
        {editable && (
          <button type="button" onClick={() => setEditando((v) => !v)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
            {editando ? "Ver para grabar" : "Editar guion"}
          </button>
        )}
      </div>

      {!editando &&
        (bloques.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no tiene guion.</p>
        ) : (
          <ol className="space-y-3">
            {bloques.map((b, i) => (
              <li key={i} className="space-y-1.5">
                {b.bloque && <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{b.bloque}</p>}
                {b.texto && <p className="whitespace-pre-wrap text-base text-slate-900">{b.texto}</p>}
                {b.cartel && (
                  <p className="rounded-lg bg-brand-red px-3 py-2 text-lg font-bold text-white">
                    <span className="mr-2 text-xs font-semibold uppercase">Cartel</span>
                    {b.cartel}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ))}

      {editando && (
        <>
          <ol className="space-y-3">
            {bloques.map((b, i) => (
              <li key={i} className="space-y-1.5 rounded-lg border border-slate-200 p-2">
                <div className="flex items-end gap-2">
                  <label className="block flex-1 text-xs font-semibold text-slate-700">
                    Bloque {i + 1}
                    <input value={b.bloque} onChange={(e) => cambiar(i, { bloque: e.target.value })} placeholder="Ej.: Gancho" className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal" />
                  </label>
                  <button type="button" aria-label={`Quitar bloque ${i + 1}`} onClick={() => onCambio(bloques.filter((_, j) => j !== i))} className="min-h-11 min-w-11 rounded-lg border border-slate-300 text-slate-500">
                    ✕
                  </button>
                </div>
                <label className="block text-xs font-semibold text-slate-700">
                  Lo que se dice
                  <textarea rows={4} value={b.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
                </label>
                <label className="block text-xs font-semibold text-red-800">
                  Cartel rojo (si en este bloque se corta al cartel)
                  <input value={b.cartel} onChange={(e) => cambiar(i, { cartel: e.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border-2 border-red-300 px-3 text-base font-normal text-slate-900" />
                </label>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => onCambio([...bloques, { bloque: "", texto: "", cartel: "" }])} className="min-h-11 w-full rounded-lg border border-dashed border-slate-400 text-sm text-slate-700">
            + Bloque
          </button>
          <button type="button" disabled={pendiente || !sucia} onClick={onGuardar} className="min-h-11 w-full rounded-lg bg-brand-red text-sm font-semibold text-white disabled:opacity-40">
            {pendiente ? "Guardando…" : sucia ? "Guardar guion" : "Sin cambios"}
          </button>
        </>
      )}
    </section>
  );
}

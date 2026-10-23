"use client";

import { useState } from "react";
import { PESTANAS } from "@/lib/personal";

/**
 * Las pestañas de un empleado que todavía no se guardó. Como en NEXGO, solo Datos funciona hasta
 * guardar. Pero apagadas EN SILENCIO parecían rotas (Jhojan, en la tablet: "el resto no deja hacer
 * nada con el botón"), y un `title` no se ve con el dedo. Por eso: candado y "al guardar" en cada
 * una, y tocarla dice qué hacer.
 */
export function PestanasNuevo() {
  const [aviso, setAviso] = useState<string | null>(null);
  const otras = PESTANAS.filter((p) => p.id !== "datos").map((p) => p.nombre);
  return (
    <div className="mb-3">
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1" aria-label="Pestañas de la ficha">
        {PESTANAS.map((p) =>
          p.id === "datos" ? (
            <span key={p.id} aria-current="page" className="flex min-h-11 shrink-0 items-center rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-semibold text-white">
              {p.nombre}
            </span>
          ) : (
            <button
              key={p.id}
              type="button"
              aria-disabled="true"
              onClick={() => setAviso(`“${p.nombre}” se habilita al guardar los datos.`)}
              className="flex min-h-11 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-3 text-xs font-semibold text-slate-500"
            >
              <span>🔒 {p.nombre}</span>
              <span className="text-xs font-normal text-slate-400">al guardar</span>
            </button>
          ),
        )}
      </nav>
      {aviso && (
        <p role="status" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">{aviso}</span> Primero llena y guarda los datos de esta pestaña; al guardar se habilitan {otras.slice(0, -1).join(", ")} y{" "}
          {otras.at(-1)}.
        </p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";

/** Barra de la vista previa: volver e imprimir. No sale en el papel. */
export function BarraDocumento({ volver, borrador }: { volver: string; borrador: boolean }) {
  return (
    <div className="sticky top-0 z-10 bg-white/95 shadow print:hidden">
      <div className="mx-auto flex max-w-[21cm] flex-wrap items-center justify-between gap-2 px-3 py-2">
        <Link href={volver} className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800">
          ← Volver
        </Link>
        <span className="hidden text-xs text-slate-600 sm:inline">{borrador ? "Vista previa · borrador sin firmar" : "Vista previa del documento"}</span>
        <button type="button" onClick={() => window.print()} className="flex min-h-11 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white">
          Imprimir / Guardar PDF
        </button>
      </div>
    </div>
  );
}

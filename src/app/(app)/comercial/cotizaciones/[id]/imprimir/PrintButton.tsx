"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white print:hidden"
    >
      Imprimir / Guardar PDF
    </button>
  );
}

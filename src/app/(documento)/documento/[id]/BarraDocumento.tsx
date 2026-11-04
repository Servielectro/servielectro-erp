"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Barra de la vista previa: volver e imprimir. No sale en el papel.
 * `autoImprimir` («Descargar PDF»): abre sola la ventana de impresión cuando las imágenes (logo y
 * firmas) ya cargaron, para que el PDF no salga con las firmas en blanco.
 */
export function BarraDocumento({ volver, borrador, autoImprimir }: { volver: string; borrador: boolean; autoImprimir?: boolean }) {
  const [pidiendo, setPidiendo] = useState(!!autoImprimir);

  useEffect(() => {
    if (!autoImprimir) return;
    let hecho = false;
    const imprimir = () => {
      if (hecho) return;
      hecho = true;
      setPidiendo(false);
      window.print();
    };
    const imagenes = [...document.images].filter((i) => !i.complete);
    let faltan = imagenes.length;
    const una = () => {
      faltan -= 1;
      if (faltan <= 0) setTimeout(imprimir, 150);
    };
    imagenes.forEach((i) => {
      i.addEventListener("load", una, { once: true });
      i.addEventListener("error", una, { once: true });
    });
    const t = setTimeout(imprimir, faltan ? 6000 : 300);
    return () => {
      clearTimeout(t);
      imagenes.forEach((i) => {
        i.removeEventListener("load", una);
        i.removeEventListener("error", una);
      });
    };
  }, [autoImprimir]);

  return (
    <div className="sticky top-0 z-10 bg-white/95 shadow print:hidden">
      <div className="mx-auto flex max-w-[21cm] flex-wrap items-center justify-between gap-2 px-3 py-2">
        <Link href={volver} className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800">
          ← Volver
        </Link>
        <span className="hidden text-xs text-slate-600 sm:inline">{borrador ? "Vista previa · borrador sin firmar" : "Vista previa del documento"}</span>
        <button type="button" onClick={() => window.print()} className="flex min-h-11 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white">
          Descargar PDF / Imprimir
        </button>
      </div>
      {autoImprimir && (
        <p className="mx-auto max-w-[21cm] px-3 pb-2 text-sm text-slate-700">
          {pidiendo ? "Preparando el documento…" : "En la ventana que se abre, elige «Guardar como PDF» como destino. Si no se abrió, toca «Descargar PDF / Imprimir»."}
        </p>
      )}
    </div>
  );
}

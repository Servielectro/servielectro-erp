"use client";

import { useState } from "react";
import { AjusteAncho } from "@/components/cotizacion/AjusteAncho";

/**
 * La hoja fiel al papel (1000 px, apaisada) dentro de la pantalla. En celular, una caja con
 * overflow-x-auto dejaba la hoja "cortada": el desplazamiento lateral no se ve en iOS/Android y
 * CONSECUENCIAS, CONTROLES, EPP y los días de firma quedaban fuera (reporte de Jhojan, 2026-11-04).
 * Por defecto se encoge al ancho disponible (el documento completo a la vista; se lee con
 * pellizco) y un botón pasa a tamaño real con desplazamiento lateral. Al imprimir, globals.css
 * anula el zoom de .ajuste-ancho: el PDF sale a tamaño real, como siempre.
 */
export function HojaAjustable({ children, ancho = 1000 }: { children: React.ReactNode; ancho?: number }) {
  const [real, setReal] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-1 print:hidden">
        <p className="text-xs text-slate-500">{real ? "Tamaño real: desliza de lado para ver todo." : "Hoja completa. Pellizca para ampliar."}</p>
        <button type="button" onClick={() => setReal(!real)} className="min-h-11 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-semibold">
          {real ? "Ajustar a la pantalla" : "Tamaño real"}
        </button>
      </div>
      {real ? <div className="overflow-x-auto overscroll-x-contain">{children}</div> : <AjusteAncho ancho={ancho}>{children}</AjusteAncho>}
    </div>
  );
}

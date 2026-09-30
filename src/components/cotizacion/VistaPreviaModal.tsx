"use client";

import { useState } from "react";
import {
  FormatoCotizacion,
  type FormatoCotizacionProps,
} from "@/components/cotizacion/FormatoCotizacion";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
const ZOOM_PASO = 0.1;

/**
 * Envuelve FormatoCotizacion en un lienzo de tamaño carta (816px = 8.5in a 96dpi) con
 * controles de zoom — Jhojan pidió que la Vista Previa se vea igual al documento formal
 * en tamaño carta, y que se pueda hacer zoom para leerlo en celular/tablet.
 */
export function VistaPreviaModal({
  onCerrar,
  ...props
}: FormatoCotizacionProps & { onCerrar: () => void }) {
  // Arranca ajustado al ancho de la pantalla (en la tablet vertical se ve la hoja
  // completa); después se puede acercar con +/−. Solo se monta en el cliente.
  const [zoom, setZoom] = useState(() =>
    Math.max(ZOOM_MIN, Math.min(1, (window.innerWidth - 32) / 816)),
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 p-3">
        <p className="text-sm font-medium text-white">Vista previa</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_PASO))}
            className="h-8 w-8 rounded-md bg-slate-700 text-base font-bold text-white"
            aria-label="Alejar"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-slate-200">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_PASO))}
            className="h-8 w-8 rounded-md bg-slate-700 text-base font-bold text-white"
            aria-label="Acercar"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          Cerrar
        </button>
      </div>

      {props.items.some((i) => !(i.valorCalculoUnitario > 0)) && (
        <p className="bg-red-600 px-3 py-2 text-center text-sm font-semibold text-white">
          Borrador con líneas en $0 — no se puede enviar al cliente hasta completarlas.
        </p>
      )}

      <div className="flex-1 overflow-auto p-4">
        {/* `zoom` (no `transform: scale`) para que el layout se recalcule al tamaño
            real y el contenedor haga scroll correcto — con transform, la caja seguía
            ocupando el ancho sin escalar y quedaba mal centrada. Soportado en
            Chrome/Safari (Android/iPad, que es donde Jhojan cotiza); no en Firefox
            de escritorio, aceptable para este caso de uso. */}
        <div style={{ width: 816 * zoom }} className="mx-auto">
          <div style={{ zoom }}>
            <FormatoCotizacion {...props} />
          </div>
        </div>
      </div>
    </div>
  );
}

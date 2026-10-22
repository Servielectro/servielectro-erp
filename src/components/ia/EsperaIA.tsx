"use client";

import { useEffect, useState } from "react";

/**
 * Espera mientras la IA trabaja. Dice lo que está pasando de verdad: el texto de la tarea y los
 * segundos que van, sin afirmar una causa que acá no se conoce. Antes, a los 5 s decía "Google
 * tiene mucha demanda" SIEMPRE, aunque fuera una lectura normal de un PDF (2026-10-22): un
 * mensaje que miente hace buscar el problema donde no está.
 *
 * Con onCancelar, siempre hay un botón para dejarlo y seguir a mano: con un cliente al frente
 * nada puede parecer colgado.
 */
export function EsperaIA({ texto, onCancelar }: { texto: string; onCancelar?: () => void }) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const inicio = Date.now();
    const t = window.setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <span>
        {texto}
        {segundos >= 3 ? ` (${segundos} s)` : ""}
      </span>
      {segundos >= 10 && <span className="text-xs text-slate-500">Si un servicio no responde, se prueba con el otro.</span>}
      {onCancelar && (
        <button
          type="button"
          onClick={onCancelar}
          className="min-h-11 rounded-lg border-2 border-slate-400 bg-white px-4 text-sm font-semibold text-slate-800"
        >
          Cancelar y llenar a mano
        </button>
      )}
    </span>
  );
}

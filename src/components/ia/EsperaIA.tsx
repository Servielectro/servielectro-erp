"use client";

import { useEffect, useState } from "react";

/**
 * Texto de espera mientras la IA trabaja. El servidor reintenta solo cuando Google está
 * saturado (src/lib/ia/gemini.ts) y responde una sola vez al final, así que acá no se
 * sabe en qué intento va: el texto cambia por tiempo para que nunca parezca colgado.
 */
export function EsperaIA({ texto }: { texto: string }) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const inicio = Date.now();
    const t = window.setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (segundos < 5) return <>{texto}</>;
  if (segundos < 20) return <>Google tiene mucha demanda, reintentando… ({segundos} s)</>;
  return <>Sigue reintentando, un momento más… ({segundos} s)</>;
}

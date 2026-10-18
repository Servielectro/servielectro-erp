// Evidencia fotográfica de una jornada: antes, durante y después.
//
// Criterio (pedido de Jhojan): el mínimo de fotos NO bloquea la salida. Un técnico
// bloqueado toma diez fotos del piso para poder irse: número cumplido, evidencia
// inservible. Se avisa, se pide un motivo y queda registrado. Lo que se avisa fuerte es
// la VARIEDAD: una foto de cada etapa vale más que veinte del "durante".

export const MOMENTOS = ["antes", "durante", "despues"] as const;
export type Momento = (typeof MOMENTOS)[number];

export const ETIQUETA_MOMENTO: Record<Momento, string> = {
  antes: "Antes",
  durante: "Durante",
  despues: "Después",
};

export interface ConteoFotos {
  total: number;
  antes: number;
  durante: number;
  despues: number;
}

export function contarFotos(fotos: { jornadaId: string | null; momento?: Momento | null }[], jornadaId: string | null): ConteoFotos {
  const c: ConteoFotos = { total: 0, antes: 0, durante: 0, despues: 0 };
  for (const f of fotos) {
    if (f.jornadaId !== jornadaId) continue;
    c.total++;
    if (f.momento) c[f.momento]++;
  }
  return c;
}

/** "7 fotos · 3 antes, 4 durante, 0 después" */
export function resumenFotos(c: ConteoFotos, minimo: number | null): string {
  const base = minimo ? `${c.total} de ${minimo}` : `${c.total} ${c.total === 1 ? "foto" : "fotos"}`;
  return `${base} · ${c.antes} antes, ${c.durante} durante, ${c.despues} después`;
}

export interface RevisionEvidencia {
  /** Momentos sin ninguna foto: el aviso fuerte. */
  faltanMomentos: Momento[];
  /** Cuántas faltan para el mínimo (0 si se cumple o no hay mínimo). */
  faltanParaMinimo: number;
  completa: boolean;
  resumen: string;
}

export function revisarEvidencia(c: ConteoFotos, minimo: number | null): RevisionEvidencia {
  const faltanMomentos = MOMENTOS.filter((m) => c[m] === 0);
  const faltanParaMinimo = minimo ? Math.max(0, minimo - c.total) : 0;
  return {
    faltanMomentos,
    faltanParaMinimo,
    completa: faltanMomentos.length === 0 && faltanParaMinimo === 0,
    resumen: resumenFotos(c, minimo),
  };
}

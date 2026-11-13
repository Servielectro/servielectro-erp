"use client";

import { ETIQUETA_CANAL, fechaCorta } from "@/lib/marketing";
import type { PublicacionCrm } from "@/lib/supabase/crm";

/** De qué publicación vino el negocio. Opcional siempre: si no se sabe, se deja vacío. */
export function SelectorPublicacion({ publicaciones, valor, onCambio, className }: { publicaciones: PublicacionCrm[]; valor: string; onCambio: (id: string) => void; className: string }) {
  const fuera = valor && !publicaciones.some((p) => p.id === valor);
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)} className={className}>
      <option value="">No se sabe de cuál</option>
      {fuera && <option value={valor}>La publicación ya vinculada</option>}
      {publicaciones.map((p) => (
        <option key={p.id} value={p.id}>
          {fechaCorta(p.publicado_en)} · {ETIQUETA_CANAL[p.canal] ?? p.canal} · {p.titulo}
        </option>
      ))}
    </select>
  );
}

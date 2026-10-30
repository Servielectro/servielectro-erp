"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ETIQUETA_TIPO, fechaCorta } from "@/lib/marketing";

export interface Oportunidad {
  fuente: "proyecto" | "visita" | "equipo" | "formato";
  origen_id: string;
  titulo: string;
  por_que: string;
  cuando: string | null;
  tipo_sugerido: string;
}

const FUENTE: Record<Oportunidad["fuente"], string> = {
  proyecto: "🏗️ Obra",
  visita: "🔧 Visita",
  equipo: "🪢 Equipo",
  formato: "📋 Formato",
};

// Las ideas guardan de dónde salen. Los equipos no tienen columna de origen en marketing_ideas: el
// código queda en las notas.
const COLUMNA_ORIGEN: Partial<Record<Oportunidad["fuente"], string>> = {
  proyecto: "origen_proyecto_id",
  visita: "origen_visita_id",
  formato: "origen_formato_id",
};

export function Oportunidades({ oportunidades, escribe }: { oportunidades: Oportunidad[]; escribe: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const crear = (o: Oportunidad) =>
    empezar(async () => {
      setError(null);
      setCreando(o.origen_id);
      const columna = COLUMNA_ORIGEN[o.fuente];
      const { data, error: e } = await createClient()
        .from("marketing_ideas")
        .insert({
          titulo: o.titulo,
          tipo: o.tipo_sugerido,
          canales: ["linkedin"],
          notas: columna ? o.por_que : `${o.por_que}\nSale de: ${o.titulo}`,
          ...(columna ? { [columna]: o.origen_id } : {}),
        })
        .select("id")
        .single();
      setCreando(null);
      if (e || !data) return setError(`No se creó la idea: ${e?.message ?? "sin respuesta"}`);
      router.push(`/marketing/ideas/${data.id}`);
    });

  if (!oportunidades.length) return <p className="py-4 text-center text-sm text-slate-500">No hay trabajo nuevo sin contenido. Cuando se cierre una obra o una visita, aparece aquí.</p>;
  return (
    <>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {oportunidades.map((o) => (
          <li key={`${o.fuente}-${o.origen_id}`} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                <span className="mr-1 text-xs font-normal text-slate-500">{FUENTE[o.fuente]}</span>
                {o.titulo}
              </p>
              <p className="text-xs text-slate-600">
                {o.por_que}
                {o.cuando ? ` · ${fechaCorta(o.cuando)}` : ""} · sugerido: {ETIQUETA_TIPO[o.tipo_sugerido] ?? o.tipo_sugerido}
              </p>
            </div>
            {escribe && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => crear(o)}
                className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-40"
              >
                {creando === o.origen_id ? "Creando…" : "Convertir en idea"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

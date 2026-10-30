"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CANALES, TIPOS_IDEA } from "@/lib/marketing";

/** Chips para elegir canales; LinkedIn primero (decisión de Jhojan). */
export function SelectorCanales({ valor, onCambio }: { valor: string[]; onCambio: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CANALES.map((c) => {
        const on = valor.includes(c.key);
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => onCambio(on ? valor.filter((x) => x !== c.key) : [...valor, c.key])}
            className={`min-h-11 rounded-lg border px-3 text-sm ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export function NuevaIdea({ campanas }: { campanas: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("carrusel");
  const [canales, setCanales] = useState<string[]>(["linkedin"]);
  const [campana, setCampana] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  if (!abierta)
    return (
      <button type="button" onClick={() => setAbierta(true)} className="min-h-11 rounded-lg bg-brand-red px-4 text-sm font-semibold text-white">
        + Nueva idea
      </button>
    );

  const crear = () =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient()
        .from("marketing_ideas")
        .insert({ titulo: titulo.trim(), tipo, canales, campana_id: campana || null })
        .select("id")
        .single();
      if (e || !data) return setError(`No se creó: ${e?.message ?? "sin respuesta"}`);
      router.push(`/marketing/ideas/${data.id}`);
    });

  return (
    <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-3">
      <label className="block text-sm font-semibold text-slate-800">
        De qué se trata
        <input
          value={titulo}
          autoFocus
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej.: Cómo se inspecciona un arnés antes de subir"
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-800">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base font-normal">
            {TIPOS_IDEA.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Campaña
          <select value={campana} onChange={(e) => setCampana(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base font-normal">
            <option value="">Sin campaña</option>
            {campanas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-800">Dónde sale</p>
        <SelectorCanales valor={canales} onCambio={setCanales} />
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierta(false)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente || !titulo.trim()}
          onClick={crear}
          className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pendiente ? "Creando…" : "Crear y abrir"}
        </button>
      </div>
    </section>
  );
}

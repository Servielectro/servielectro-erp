"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ETIQUETA_CANAL, fechaCorta } from "@/lib/marketing";
import { SelectorCanales } from "../ideas/NuevaIdea";

export interface Campana {
  id: string;
  nombre: string;
  objetivo: string | null;
  publico: string | null;
  canales: string[];
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: "borrador" | "activa" | "pausada" | "terminada";
  notas: string | null;
  ideas: number;
  publicadas: number;
}

const ESTADOS: { key: Campana["estado"]; label: string; clase: string }[] = [
  { key: "borrador", label: "Borrador", clase: "bg-slate-100 text-slate-700" },
  { key: "activa", label: "Activa", clase: "bg-green-100 text-green-900" },
  { key: "pausada", label: "Pausada", clase: "bg-amber-100 text-amber-900" },
  { key: "terminada", label: "Terminada", clase: "bg-slate-200 text-slate-500" },
];

const VACIA = { nombre: "", objetivo: "", publico: "", canales: ["linkedin"], fecha_inicio: "", fecha_fin: "", estado: "borrador" as Campana["estado"], notas: "" };
const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal";

export function Campanas({ escribe, campanas }: { escribe: boolean; campanas: Campana[] }) {
  const [editando, setEditando] = useState<string | "nueva" | null>(null);
  return (
    <div className="space-y-3">
      {escribe && editando !== "nueva" && (
        <button type="button" onClick={() => setEditando("nueva")} className="min-h-11 rounded-lg bg-brand-red px-4 text-sm font-semibold text-white">
          + Nueva campaña
        </button>
      )}
      {editando === "nueva" && <Formulario onCerrar={() => setEditando(null)} />}
      {campanas.length === 0 && editando !== "nueva" && <p className="py-6 text-center text-sm text-slate-500">Todavía no hay campañas.</p>}
      <ul className="space-y-2">
        {campanas.map((c) =>
          editando === c.id ? (
            <li key={c.id}>
              <Formulario c={c} onCerrar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={c.id} className="rounded-lg border border-slate-300 bg-white p-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{c.nombre}</p>
                  <p className="text-xs text-slate-600">
                    {[c.fecha_inicio && `${fechaCorta(c.fecha_inicio)} → ${c.fecha_fin ? fechaCorta(c.fecha_fin) : "sin fin"}`, c.canales.map((k) => ETIQUETA_CANAL[k] ?? k).join(", "), `${c.ideas} ideas · ${c.publicadas} publicadas`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADOS.find((e) => e.key === c.estado)?.clase}`}>{ESTADOS.find((e) => e.key === c.estado)?.label}</span>
              </div>
              {c.objetivo && <p className="mt-1 text-sm text-slate-800">Objetivo: {c.objetivo}</p>}
              {c.publico && <p className="text-sm text-slate-700">Para: {c.publico}</p>}
              {c.notas && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{c.notas}</p>}
              {escribe && (
                <button type="button" onClick={() => setEditando(c.id)} className="mt-2 min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
                  Editar
                </button>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function Formulario({ c, onCerrar }: { c?: Campana; onCerrar: () => void }) {
  const router = useRouter();
  const [f, setF] = useState(
    c
      ? { nombre: c.nombre, objetivo: c.objetivo ?? "", publico: c.publico ?? "", canales: c.canales, fecha_inicio: c.fecha_inicio ?? "", fecha_fin: c.fecha_fin ?? "", estado: c.estado, notas: c.notas ?? "" }
      : VACIA,
  );
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const guardar = () =>
    empezar(async () => {
      setError(null);
      if (f.fecha_inicio && f.fecha_fin && f.fecha_fin < f.fecha_inicio) return setError("La fecha de fin es anterior a la de inicio.");
      const fila = {
        nombre: f.nombre.trim(),
        objetivo: f.objetivo.trim() || null,
        publico: f.publico.trim() || null,
        canales: f.canales,
        fecha_inicio: f.fecha_inicio || null,
        fecha_fin: f.fecha_fin || null,
        estado: f.estado,
        notas: f.notas.trim() || null,
      };
      const supabase = createClient();
      const { data, error: e } = c ? await supabase.from("marketing_campanas").update(fila).eq("id", c.id).select("id") : await supabase.from("marketing_campanas").insert(fila).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó (sin permiso).");
      onCerrar();
      router.refresh();
    });
  return (
    <section className="space-y-3 rounded-lg border border-slate-400 bg-white p-3">
      <label className="block text-sm font-semibold text-slate-800">
        Nombre
        <input autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={input} />
      </label>
      <label className="block text-sm font-semibold text-slate-800">
        Objetivo
        <input value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} placeholder="Ej.: 5 visitas de diagnóstico con administradores de PH" className={input} />
      </label>
      <label className="block text-sm font-semibold text-slate-800">
        Para quién
        <input value={f.publico} onChange={(e) => setF({ ...f, publico: e.target.value })} placeholder="Ej.: administradores de propiedad horizontal en Bogotá" className={input} />
      </label>
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-800">Canales</p>
        <SelectorCanales valor={f.canales} onCambio={(v) => setF({ ...f, canales: v })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-semibold text-slate-800">
          Desde
          <input type="date" value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} className={input} />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Hasta
          <input type="date" value={f.fecha_fin} onChange={(e) => setF({ ...f, fecha_fin: e.target.value })} className={input} />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Estado
          <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as Campana["estado"] })} className={`${input} px-2`}>
            {ESTADOS.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold text-slate-800">
        Notas
        <textarea rows={3} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
      </label>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCerrar} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
          Cancelar
        </button>
        <button type="button" disabled={pendiente || !f.nombre.trim()} onClick={guardar} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { diaBogota, fechaCorta, hoyBogota } from "@/lib/marketing";

export interface Medicion {
  medida_en: string;
  alcance: number | null;
  impresiones: number | null;
  interacciones: number | null;
  clics: number | null;
  guardados: number | null;
  comentarios: number | null;
}

// Guardados y comentarios van primero a propósito: es lo que el plan persigue. Un administrador que
// guarda un video lo va a volver a buscar; un like no dice nada de quién compra.
const PRINCIPALES = [
  { key: "guardados", label: "Guardados" },
  { key: "comentarios", label: "Comentarios" },
] as const;
const SECUNDARIOS = [
  { key: "alcance", label: "Alcance" },
  { key: "impresiones", label: "Impresiones" },
  { key: "interacciones", label: "Interacciones" },
  { key: "clics", label: "Clics" },
] as const;
const TODOS = [...PRINCIPALES, ...SECUNDARIOS];

const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("es-CO"));
const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);

/** Cómo va una publicación: la última medición arriba y debajo cómo se ha movido. */
export function Mediciones({ publicacionId, publicadoEn, mediciones, escribe }: { publicacionId: string; publicadoEn: string; mediciones: Medicion[]; escribe: boolean }) {
  const router = useRouter();
  const hoy = hoyBogota();
  const publicado = diaBogota(publicadoEn);
  const ordenadas = [...mediciones].sort((a, b) => b.medida_en.localeCompare(a.medida_en));
  const ultima = ordenadas[0] ?? null;

  const [abierta, setAbierta] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  // Si ese día ya se midió, se trae lo que había: guardar con casillas vacías lo borraría.
  const elegirFecha = (dia: string) => {
    setFecha(dia);
    const previa = mediciones.find((m) => m.medida_en === dia);
    setValores(previa ? Object.fromEntries(TODOS.map((c) => [c.key, previa[c.key]?.toString() ?? ""])) : {});
  };
  const limpio = (k: string) => (valores[k] ?? "").replace(/\D/g, "");
  const hayAlgo = TODOS.some((c) => limpio(c.key));

  const guardar = () =>
    empezar(async () => {
      setError(null);
      const fila: Record<string, unknown> = { publicacion_id: publicacionId, medida_en: fecha };
      for (const c of TODOS) fila[c.key] = limpio(c.key) ? Number(limpio(c.key)) : null;
      const { error: e } = await createClient().from("marketing_metricas").upsert(fila, { onConflict: "publicacion_id,medida_en" });
      if (e) return setError(e.message);
      setAbierta(false);
      setValores({});
      router.refresh();
    });

  const atajos = [
    { label: "Hoy", dia: hoy },
    { label: "Día 7", dia: sumarDias(publicado, 7) },
    { label: "Día 30", dia: sumarDias(publicado, 30) },
  ].filter((a) => a.dia <= hoy);

  return (
    <div className="space-y-2">
      {ultima ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {PRINCIPALES.map((c) => (
              <div key={c.key} className="rounded-lg border-2 border-slate-900 p-2 text-center">
                <p className="text-2xl font-bold text-slate-900">{num(ultima[c.key])}</p>
                <p className="text-xs font-semibold text-slate-700">{c.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600">
            {SECUNDARIOS.filter((c) => ultima[c.key] !== null)
              .map((c) => `${c.label} ${num(ultima[c.key])}`)
              .join(" · ") || "Sin otros números"}{" "}
            (medido {fechaCorta(ultima.medida_en)})
          </p>
          {ordenadas.length > 1 && (
            <ul className="space-y-0.5 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
              {ordenadas.map((m) => (
                <li key={m.medida_en}>
                  <b>Día {diasEntre(publicado, m.medida_en)}</b> ({fechaCorta(m.medida_en)}): {num(m.guardados)} guardados · {num(m.comentarios)} comentarios
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-xs text-slate-600">Sin números todavía.</p>
      )}

      {escribe && (
        <button
          type="button"
          onClick={() => {
            if (!abierta) elegirFecha(hoy);
            setAbierta((v) => !v);
          }}
          className="min-h-11 w-full rounded-lg border border-slate-300 text-sm"
        >
          {abierta ? "Cerrar" : "Registrar números"}
        </button>
      )}

      {abierta && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2">
          <div className="flex flex-wrap items-end gap-2">
            {atajos.map((a) => (
              <button key={a.label} type="button" aria-pressed={fecha === a.dia} onClick={() => elegirFecha(a.dia)} className={`min-h-11 rounded-lg border px-3 text-sm ${fecha === a.dia ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>
                {a.label}
              </button>
            ))}
            <label className="block text-xs font-semibold text-slate-800">
              Medido el
              <input type="date" value={fecha} min={publicado} max={hoy} onChange={(e) => elegirFecha(e.target.value)} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base font-normal" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRINCIPALES.map((c) => (
              <label key={c.key} className="block text-sm font-bold text-slate-900">
                {c.label}
                <input inputMode="numeric" value={valores[c.key] ?? ""} onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })} className="mt-1 block min-h-12 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-lg font-bold" />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SECUNDARIOS.map((c) => (
              <label key={c.key} className="block text-xs font-semibold text-slate-700">
                {c.label}
                <input inputMode="numeric" value={valores[c.key] ?? ""} onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal" />
              </label>
            ))}
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <button type="button" disabled={pendiente || !fecha || !hayAlgo} onClick={guardar} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
            {pendiente ? "Guardando…" : "Guardar medición"}
          </button>
        </div>
      )}
    </div>
  );
}

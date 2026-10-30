"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ETIQUETA_CANAL, ETIQUETA_TIPO, fechaCorta, hoyBogota } from "@/lib/marketing";

export interface Medicion {
  medida_en: string;
  alcance: number | null;
  impresiones: number | null;
  interacciones: number | null;
  clics: number | null;
  guardados: number | null;
  comentarios: number | null;
}
export interface FilaPublicacion {
  id: string;
  publicado_en: string;
  url: string | null;
  ideaId: string | null;
  titulo: string;
  tipo: string;
  canal: string;
  cuenta: string;
  ultima: Medicion | null;
}

const CAMPOS: { key: keyof Omit<Medicion, "medida_en">; label: string }[] = [
  { key: "alcance", label: "Alcance" },
  { key: "impresiones", label: "Impresiones" },
  { key: "interacciones", label: "Interacciones" },
  { key: "clics", label: "Clics" },
  { key: "guardados", label: "Guardados" },
  { key: "comentarios", label: "Comentarios" },
];

export function TablaPublicaciones({ escribe, publicaciones }: { escribe: boolean; publicaciones: FilaPublicacion[] }) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-900">Publicaciones</h2>
      <p className="mb-2 text-xs text-slate-600">Los números se copian de cada red. Cada medición queda con su fecha; los totales usan la más reciente.</p>
      {publicaciones.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Todavía no se ha registrado ninguna publicación. Se registran desde la ficha de cada idea.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {publicaciones.map((p) => (
            <Fila key={p.id} p={p} escribe={escribe} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Fila({ p, escribe }: { p: FilaPublicacion; escribe: boolean }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [fecha, setFecha] = useState(hoyBogota());
  const [valores, setValores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const guardar = () =>
    empezar(async () => {
      setError(null);
      const fila: Record<string, unknown> = { publicacion_id: p.id, medida_en: fecha };
      for (const c of CAMPOS) {
        const v = (valores[c.key] ?? "").replace(/\D/g, "");
        fila[c.key] = v ? Number(v) : null;
      }
      const { error: e } = await createClient().from("marketing_metricas").upsert(fila, { onConflict: "publicacion_id,medida_en" });
      if (e) return setError(e.message);
      setAbierta(false);
      setValores({});
      router.refresh();
    });
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {p.ideaId ? (
              <Link href={`/marketing/ideas/${p.ideaId}`} className="hover:underline">
                {p.titulo}
              </Link>
            ) : (
              p.titulo
            )}
          </p>
          <p className="text-xs text-slate-600">
            {ETIQUETA_CANAL[p.canal] ?? p.canal} · {ETIQUETA_TIPO[p.tipo] ?? p.tipo} · {fechaCorta(p.publicado_en)}
            {p.url && (
              <>
                {" · "}
                <a href={p.url} target="_blank" rel="noreferrer" className="underline">
                  ver
                </a>
              </>
            )}
          </p>
          <p className="text-xs text-slate-700">
            {p.ultima
              ? `${CAMPOS.filter((c) => p.ultima?.[c.key] != null)
                  .map((c) => `${c.label} ${p.ultima?.[c.key]?.toLocaleString("es-CO")}`)
                  .join(" · ")} (medido ${fechaCorta(p.ultima.medida_en)})`
              : "Sin números todavía"}
          </p>
        </div>
        {escribe && (
          <button type="button" onClick={() => setAbierta((v) => !v)} className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm">
            {abierta ? "Cerrar" : "Registrar números"}
          </button>
        )}
      </div>
      {abierta && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
          <label className="block text-xs font-semibold text-slate-800">
            Medido el
            <input type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal sm:w-48" />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CAMPOS.map((c) => (
              <label key={c.key} className="block text-xs font-semibold text-slate-800">
                {c.label}
                <input
                  inputMode="numeric"
                  value={valores[c.key] ?? ""}
                  onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"
                />
              </label>
            ))}
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <button type="button" disabled={pendiente || !fecha} onClick={guardar} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
            Guardar medición
          </button>
        </div>
      )}
    </li>
  );
}

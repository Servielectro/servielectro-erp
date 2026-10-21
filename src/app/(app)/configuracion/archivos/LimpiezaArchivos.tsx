"use client";

import { useState, useTransition } from "react";
import type { CarpetaHuerfana, ResultadoBorrado } from "@/lib/mantenimiento/archivos-huerfanos";
import { limpiarHuerfanos, revisarHuerfanos } from "./actions";

const tamano = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Revisar primero; borrar después, con confirmación; y decir lo que pasó, también si falló. */
export function LimpiezaArchivos() {
  const [carpetas, setCarpetas] = useState<CarpetaHuerfana[] | null>(null);
  const [resultados, setResultados] = useState<ResultadoBorrado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const revisar = () =>
    empezar(async () => {
      setError(null);
      setResultados(null);
      const r = await revisarHuerfanos();
      if (!r.ok) return setError(r.error);
      setCarpetas(r.carpetas);
    });

  const total = (carpetas ?? []).reduce(
    (s, c) => ({ archivos: s.archivos + c.archivos, bytes: s.bytes + c.bytes }),
    { archivos: 0, bytes: 0 },
  );
  const fallidos = (resultados ?? []).filter((r) => r.error);
  const borrados = (resultados ?? []).reduce((s, r) => s + r.borrados, 0);

  return (
    <div className="space-y-3 text-sm">
      <button
        type="button"
        onClick={revisar}
        disabled={pendiente}
        className="min-h-11 rounded-lg border-2 border-slate-900 px-4 font-semibold text-slate-900 disabled:opacity-50"
      >
        {pendiente && !carpetas ? "Revisando…" : "Revisar el almacenamiento"}
      </button>
      {error && <p className="rounded-md bg-red-100 px-3 py-2 text-red-800">{error}</p>}

      {carpetas && carpetas.length === 0 && !resultados && (
        <p className="rounded-md bg-green-100 px-3 py-2 text-green-900">No hay archivos sin visita.</p>
      )}

      {carpetas && carpetas.length > 0 && !resultados && (
        <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
          <p className="font-semibold text-slate-900">
            {plural(total.archivos, "archivo", "archivos")} ({tamano(total.bytes)}) de{" "}
            {plural(carpetas.length, "visita que ya no existe", "visitas que ya no existen")}:
          </p>
          <ul className="divide-y divide-slate-100">
            {carpetas.map((c) => (
              <li key={c.visitaId} className="flex justify-between gap-2 py-1">
                <span className="truncate font-mono text-xs text-slate-600">{c.visitaId}/</span>
                <span className="shrink-0 text-slate-700">
                  {c.archivos} · {tamano(c.bytes)}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              if (!window.confirm(`Se borran ${plural(total.archivos, "archivo", "archivos")} del almacenamiento. No se recuperan.\n\n¿Borrarlos?`)) {
                return;
              }
              empezar(async () => {
                setError(null);
                const r = await limpiarHuerfanos(carpetas.map((c) => c.visitaId));
                if (!r.ok) return setError(r.error);
                setResultados(r.resultados);
              });
            }}
            className="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white disabled:opacity-50"
          >
            {pendiente ? "Borrando…" : `Borrar ${plural(total.archivos, "archivo", "archivos")}`}
          </button>
        </div>
      )}

      {resultados && (
        <div className={`space-y-1 rounded-lg p-3 ${fallidos.length ? "border-2 border-red-400 bg-red-50" : "bg-green-100 text-green-900"}`}>
          <p className="font-semibold">
            {fallidos.length
              ? `Borrado incompleto: ${plural(fallidos.length, "carpeta tuvo", "carpetas tuvieron")} problemas (se borraron ${borrados}).`
              : `Listo: ${plural(borrados, "archivo borrado", "archivos borrados")}; no quedó nada.`}
          </p>
          {fallidos.map((r) => (
            <p key={r.visitaId} className="text-red-800">
              <span className="font-mono text-xs">{r.visitaId}/</span>: {r.error}
              {r.quedan > 0 ? ` (quedan ${r.quedan})` : ""}
            </p>
          ))}
          {fallidos.length > 0 && <p className="text-red-800">Vuelve a revisar y a intentarlo; si sigue, hay que mirarlo en el panel de Supabase.</p>}
        </div>
      )}
    </div>
  );
}

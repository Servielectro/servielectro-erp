"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/rrhh/archivos";
import { fechaCorta } from "@/lib/rrhh-registros";
import { BUCKET_REPORTES, GRAVEDAD, type EstadoReporte, type ReporteProblema } from "@/lib/reportes-problema";

export function ProblemasAdmin({
  reportes,
  nombres,
  estados,
}: {
  reportes: ReporteProblema[];
  nombres: Record<string, string>;
  estados: Record<EstadoReporte, string>;
}) {
  return (
    <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
      {reportes.map((r) => (
        <FilaReporte key={r.id} r={r} quien={nombres[r.reportado_por] ?? "—"} estados={estados} />
      ))}
    </ul>
  );
}

const CONTEXTO: Record<string, string> = { sin_senal: "Sin señal", ancho: "Ancho", alto: "Alto", version: "Versión", app: "App", navegador: "Navegador" };

function FilaReporte({ r, quien, estados }: { r: ReporteProblema; quien: string; estados: Record<EstadoReporte, string> }) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState<null | "resuelto" | "no_es_error">(null);
  const [nota, setNota] = useState(r.nota_cierre ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cerrado = r.estado === "resuelto" || r.estado === "no_es_error";

  const cambiar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("reportes_problema").update(cambios).eq("id", r.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: el reporte cambió o no tienes permiso.");
      setCerrando(null);
      router.refresh();
    });

  return (
    <li className={`rounded-lg border bg-white p-3 text-sm ${r.gravedad === "bloquea" && !cerrado ? "border-red-300" : "border-slate-300"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{r.que_paso}</p>
          {r.que_esperaba && <p className="text-slate-700">Esperaba: {r.que_esperaba}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.gravedad === "bloquea" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
          {GRAVEDAD[r.gravedad]}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {quien} · {fechaCorta(r.reportado_en)} · en <span className="font-mono">{r.ruta}</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {Object.entries(r.contexto ?? {})
          .filter(([k, v]) => v !== null && v !== "" && k !== "navegador")
          .map(([k, v]) => `${CONTEXTO[k] ?? k}: ${v === true ? "sí" : v === false ? "no" : String(v)}`)
          .join(" · ")}
      </p>
      {typeof r.contexto?.navegador === "string" && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">Navegador</summary>
          {r.contexto.navegador}
        </details>
      )}
      {r.captura_path && (
        <AbrirArchivo bucket={BUCKET_REPORTES} path={r.captura_path}>
          📎 Ver captura
        </AbrirArchivo>
      )}
      <p className="mt-2 text-xs font-semibold text-slate-700">Estado: {estados[r.estado]}</p>
      {r.nota_cierre && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-slate-800">Nota: {r.nota_cierre}</p>}

      <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
        {cerrando ? (
          <div className="space-y-1">
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder={cerrando === "resuelto" ? "Qué se corrigió (lo ve quien reportó)" : "Por qué no es un error (lo ve quien reportó)"}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setCerrando(null)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
                Cancelar
              </button>
              <button
                type="button"
                disabled={pendiente || !nota.trim()}
                onClick={() => cambiar({ estado: cerrando, nota_cierre: nota.trim() })}
                className="min-h-11 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white disabled:opacity-40"
              >
                {cerrando === "resuelto" ? "Marcar resuelto" : "Marcar “no es un error”"}
              </button>
            </div>
            {!nota.trim() && <p className="text-xs text-slate-500">Escribe una nota: es lo que verá quien lo reportó.</p>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {r.estado === "nuevo" && (
              <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: "en_revision" })} className="min-h-11 rounded-md border border-slate-400 px-3 text-xs font-semibold disabled:opacity-40">
                Poner en revisión
              </button>
            )}
            {!cerrado && (
              <>
                <button type="button" onClick={() => setCerrando("resuelto")} className="min-h-11 rounded-md bg-green-700 px-3 text-xs font-semibold text-white">
                  Resuelto…
                </button>
                <button type="button" onClick={() => setCerrando("no_es_error")} className="min-h-11 rounded-md border border-slate-400 px-3 text-xs font-semibold">
                  No es un error…
                </button>
              </>
            )}
            {cerrado && (
              <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: "en_revision" })} className="min-h-11 rounded-md border border-slate-400 px-3 text-xs font-semibold disabled:opacity-40">
                Reabrir (volvió a pasar)
              </button>
            )}
          </div>
        )}
        {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      </div>
    </li>
  );
}

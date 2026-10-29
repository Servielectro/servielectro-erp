"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/rrhh/archivos";
import { fechaCorta } from "@/lib/rrhh-registros";
import { BUCKET_REPORTES, etiquetaEstado, GRAVEDAD, nombreModulo, TIPO_REPORTE, TIPOS_REPORTE, type ReporteProblema } from "@/lib/reportes-problema";

type Cierre = "resuelto" | "descartado";

/** Agrupados por módulo y, dentro, por tipo (primero los hallazgos: citan norma, no son opcionales). */
export function ProblemasAdmin({ reportes, nombres, sin104 }: { reportes: ReporteProblema[]; nombres: Record<string, string>; sin104: boolean }) {
  const modulos = [...new Set(reportes.map((r) => r.modulo ?? ""))].sort();
  const orden = (t: string) => ["hallazgo", "problema", "sugerencia", "duda"].indexOf(t);
  return (
    <div className="space-y-5">
      {modulos.map((m) => {
        const delModulo = reportes.filter((r) => (r.modulo ?? "") === m);
        return (
          <section key={m}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
              {nombreModulo(m || null)} · {delModulo.length}
            </h2>
            {TIPOS_REPORTE.filter((t) => delModulo.some((r) => (r.tipo ?? "problema") === t.id))
              .sort((a, b) => orden(a.id) - orden(b.id))
              .map((t) => (
                <div key={t.id} className="mb-3">
                  <h3 className="mb-1 text-xs font-semibold text-slate-500">{TIPO_REPORTE[t.id]}s</h3>
                  <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
                    {delModulo
                      .filter((r) => (r.tipo ?? "problema") === t.id)
                      .map((r) => (
                        <FilaReporte key={r.id} r={r} quien={nombres[r.reportado_por] ?? "—"} respondio={r.revisado_por ? nombres[r.revisado_por] ?? null : null} sin104={sin104} />
                      ))}
                  </ul>
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}

const CONTEXTO: Record<string, string> = { sin_senal: "Sin señal", ancho: "Ancho", alto: "Alto", version: "Versión", app: "App", navegador: "Navegador" };

function FilaReporte({ r, quien, respondio, sin104 }: { r: ReporteProblema; quien: string; respondio: string | null; sin104: boolean }) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState<Cierre | null>(null);
  const [nota, setNota] = useState(r.nota_cierre ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cerrado = r.estado === "resuelto" || r.estado === "descartado" || (r.estado as string) === "no_es_error";
  const tipo = r.tipo ?? "problema";
  // Antes de la 104 el descartado se llamaba no_es_error.
  const descartado = sin104 ? "no_es_error" : "descartado";

  const cambiar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("reportes_problema").update(cambios).eq("id", r.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: cambió o no tienes permiso.");
      setCerrando(null);
      router.refresh();
    });

  return (
    <li className={`rounded-lg border bg-white p-3 text-sm ${(r.gravedad === "bloquea" || tipo === "hallazgo") && !cerrado ? "border-red-300" : "border-slate-300"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{r.que_paso}</p>
          {r.que_esperaba && <p className="text-slate-700">{tipo === "problema" ? "Esperaba" : "Propone"}: {r.que_esperaba}</p>}
          {r.norma && <p className="mt-0.5 text-xs font-semibold text-red-800">Norma: {r.norma}</p>}
        </div>
        {r.gravedad && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.gravedad === "bloquea" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
            {GRAVEDAD[r.gravedad]}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {quien} · {fechaCorta(r.reportado_en)} · en {r.seccion ? <b>{r.seccion}</b> : null} <span className="font-mono">{r.ruta}</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {Object.entries(r.contexto ?? {})
          .filter(([k, v]) => v !== null && v !== "" && k !== "navegador")
          .map(([k, v]) => `${CONTEXTO[k] ?? k}: ${v === true ? "sí" : v === false ? "no" : String(v)}`)
          .join(" · ")}
      </p>
      {r.captura_path && (
        <AbrirArchivo bucket={BUCKET_REPORTES} path={r.captura_path}>
          📎 Ver captura
        </AbrirArchivo>
      )}
      <p className="mt-2 text-xs font-semibold text-slate-700">
        Estado: {etiquetaEstado(r.estado)}
        {r.revisado_en ? ` · ${respondio ?? "—"}, ${fechaCorta(r.revisado_en)}` : ""}
      </p>
      {r.nota_cierre && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-slate-800">Respuesta: {r.nota_cierre}</p>}

      <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
        {cerrando ? (
          <div className="space-y-1">
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder={cerrando === "resuelto" ? "Qué se hizo (lo ve quien lo registró)" : "Por qué no se hace (lo ve quien lo registró)"}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setCerrando(null)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
                Cancelar
              </button>
              <button
                type="button"
                disabled={pendiente || !nota.trim()}
                onClick={() => cambiar({ estado: cerrando === "descartado" ? descartado : "resuelto", nota_cierre: nota.trim() })}
                className="min-h-11 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white disabled:opacity-40"
              >
                {cerrando === "resuelto" ? (tipo === "problema" ? "Marcar resuelto" : "Marcar implementado") : "Descartar"}
              </button>
            </div>
            {!nota.trim() && <p className="text-xs text-slate-500">{cerrando === "descartado" ? "La razón es obligatoria: es lo que verá quien lo registró." : "Escribe qué se hizo."}</p>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {r.estado === "nuevo" && (
              <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: "en_revision" })} className="min-h-11 rounded-md border border-slate-400 px-3 text-xs font-semibold disabled:opacity-40">
                En estudio
              </button>
            )}
            {!sin104 && (r.estado === "nuevo" || r.estado === "en_revision") && (
              <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: "aceptado" })} className="min-h-11 rounded-md bg-blue-700 px-3 text-xs font-semibold text-white disabled:opacity-40">
                Aceptar (se va a hacer)
              </button>
            )}
            {!cerrado && (
              <>
                <button type="button" onClick={() => setCerrando("resuelto")} className="min-h-11 rounded-md bg-green-700 px-3 text-xs font-semibold text-white">
                  {tipo === "problema" ? "Resuelto…" : "Implementado…"}
                </button>
                <button type="button" onClick={() => setCerrando("descartado")} className="min-h-11 rounded-md border border-slate-400 px-3 text-xs font-semibold">
                  Descartar…
                </button>
              </>
            )}
            {(cerrado || r.estado === "aceptado") && (
              <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: "en_revision" })} className="min-h-11 rounded-md border border-slate-400 px-3 text-xs font-semibold disabled:opacity-40">
                {cerrado ? "Reabrir" : "Volver a estudio"}
              </button>
            )}
          </div>
        )}
        {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      </div>
    </li>
  );
}

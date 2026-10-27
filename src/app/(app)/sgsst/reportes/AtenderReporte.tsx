"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fechaHoraCo } from "@/lib/fecha-hora";

export interface ReporteGestion {
  id: string;
  tipo: "acto" | "condicion";
  descripcion: string;
  lugar: string | null;
  lat: number | null;
  lng: number | null;
  gps_estado: string | null;
  reportado_por: string;
  reportado_en: string;
  observado_en_dispositivo: string | null;
  estado: "nuevo" | "en_gestion" | "cerrado" | "anulado";
  accion_tomada: string | null;
  motivo_anulacion: string | null;
  atendido_en: string | null;
  quien: string;
  fotos: string[];
}

const ESTADO: Record<ReporteGestion["estado"], string> = { nuevo: "Nuevo", en_gestion: "En gestión", cerrado: "Cerrado", anulado: "Anulado" };

export function AtenderReporte({ r, trabaja }: { r: ReporteGestion; trabaja: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<null | "cerrar" | "anular">(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const abierto = r.estado === "nuevo" || r.estado === "en_gestion";
  const cambiar = (c: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("sst_reportes_inseguros").update(c).eq("id", r.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: no tienes permiso.");
      setModo(null);
      router.refresh();
    });
  return (
    <li className={`rounded-lg border bg-white p-3 text-sm ${r.estado === "nuevo" ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold text-slate-900">{r.descripcion}</p>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{ESTADO[r.estado]}</span>
      </div>
      <p className="text-xs text-slate-600">
        {r.tipo === "acto" ? "Acto inseguro" : "Condición insegura"} · {r.lugar ?? "sin lugar"} · {r.quien} · {fechaHoraCo(r.reportado_en)}
      </p>
      {r.lat !== null && r.lng !== null ? (
        <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#A82323] underline">
          📍 Ver dónde fue
        </a>
      ) : (
        <p className="text-xs text-slate-500">Sin GPS ({r.gps_estado?.replace("_", " ") ?? "—"}).</p>
      )}
      {r.fotos.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {r.fotos.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-20 w-20 rounded-md object-cover" />
            </a>
          ))}
        </div>
      )}
      {r.accion_tomada && <p className="mt-1 rounded-md bg-green-50 px-2 py-1">Qué se hizo: {r.accion_tomada}</p>}
      {r.motivo_anulacion && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1">Anulado: {r.motivo_anulacion}</p>}
      {abierto && trabaja && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          {modo ? (
            <>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={modo === "cerrar" ? "Qué se hizo (lo ve quien reportó)" : "Por qué se anula (duplicado, no aplica…)"} className="w-full rounded-md border border-slate-300 px-2 py-1 text-base" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setModo(null)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-xs">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendiente || !texto.trim()}
                  onClick={() => cambiar(modo === "cerrar" ? { estado: "cerrado", accion_tomada: texto.trim() } : { estado: "anulado", motivo_anulacion: texto.trim() })}
                  className="min-h-11 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {modo === "cerrar" ? "Cerrar reporte" : "Anular"}
                </button>
              </div>
              {!texto.trim() && <p className="text-xs text-slate-500">{modo === "cerrar" ? "Escribe qué se hizo." : "Escribe por qué se anula."}</p>}
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {r.estado === "nuevo" && (
                <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: "en_gestion" })} className="min-h-11 rounded-md border border-slate-400 px-3 text-xs font-semibold">
                  Lo estoy atendiendo
                </button>
              )}
              <button type="button" onClick={() => { setTexto(""); setModo("cerrar"); }} className="min-h-11 rounded-md bg-green-700 px-3 text-xs font-semibold text-white">
                Cerrar con lo que se hizo…
              </button>
              <button type="button" onClick={() => { setTexto(""); setModo("anular"); }} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs">
                Anular…
              </button>
            </div>
          )}
          {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
        </div>
      )}
    </li>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { comprimirFoto, obtenerUbicacion, sha256 } from "@/lib/tecnico/captura";
import { guardarYEncolar, leerMeta, guardarMeta, todos } from "@/lib/tecnico/db";
import { nuevoId, useCola } from "@/lib/sst/campo";
import type { SstReporteFotoLocal, SstReporteLocal } from "@/lib/sst/local";

const CAMPO = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base";

interface ReporteServidor {
  id: string;
  tipo: "acto" | "condicion";
  descripcion: string;
  lugar: string | null;
  reportado_en: string;
  estado: "nuevo" | "en_gestion" | "cerrado" | "anulado";
  accion_tomada: string | null;
  motivo_anulacion: string | null;
}
const ESTADO: Record<ReporteServidor["estado"], string> = { nuevo: "Recibido", en_gestion: "En gestión", cerrado: "Cerrado", anulado: "Anulado" };

/**
 * El canal para reportar un acto o condición insegura: foto, ubicación y qué pasa, en diez
 * segundos. La ubicación se toma sola. Quien reporta ve en qué va el suyo.
 */
export function Reportar() {
  const [tipo, setTipo] = useState<"acto" | "condicion" | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [lugar, setLugar] = useState("");
  const [fotos, setFotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [locales, setLocales] = useState<SstReporteLocal[]>([]);
  const [mios, setMios] = useState<ReporteServidor[]>([]);

  const bajar = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const yo = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase
      .from("sst_reportes_inseguros")
      .select("id, tipo, descripcion, lugar, reportado_en, estado, accion_tomada, motivo_anulacion")
      .eq("reportado_por", yo ?? "")
      .order("reportado_en", { ascending: false })
      .limit(30);
    if (!error) {
      setMios((data ?? []) as ReporteServidor[]);
      await guardarMeta("sst_mis_reportes", data ?? []);
    }
  }, []);
  const cola = useCola("/reportar", bajar);

  useEffect(() => {
    const t = setTimeout(async () => {
      setMios((await leerMeta<ReporteServidor[]>("sst_mis_reportes")) ?? []);
      setLocales((await todos<SstReporteLocal>("sst_reportes")).filter((r) => !r.subido));
    }, 0);
    return () => clearTimeout(t);
  }, [cola.pendientes.length]);

  const falta = !tipo ? "Elige si es un acto o una condición." : !descripcion.trim() ? "Cuenta en pocas palabras qué viste." : null;

  async function enviar() {
    if (falta || !tipo) return;
    setGuardando(true);
    setAviso(null);
    try {
      const r: SstReporteLocal = {
        id: nuevoId(),
        tipo,
        descripcion: descripcion.trim(),
        lugar: lugar.trim(),
        proyectoId: null,
        ubicacion: await obtenerUbicacion(),
        observadoEn: new Date().toISOString(),
      };
      await guardarYEncolar("sst_reportes", r, { id: r.id, tipo: "sst_reporte", visitaId: r.id });
      for (const f of fotos) {
        const foto: SstReporteFotoLocal = { id: nuevoId(), reporteId: r.id, blob: f.blob, sha256: await sha256(f.blob) };
        await guardarYEncolar("sst_reporte_fotos", foto, { id: foto.id, tipo: "sst_reporte_foto", visitaId: r.id });
      }
      setTipo(null);
      setDescripcion("");
      setLugar("");
      setFotos([]);
      setAviso(navigator.onLine ? "Gracias: tu reporte quedó registrado. La gestión SST lo atiende y te avisa." : "Guardado en el celular: sube solo cuando vuelva la señal.");
      await cola.subir();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4">
      <h1 className="text-lg font-bold text-slate-900">Reportar un acto o condición insegura</h1>
      <p className="text-sm text-slate-600">Si ves algo que puede causar un accidente, repórtalo. No hace falta saber de quién es la culpa.</p>
      {!cola.enLinea && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Sin señal: se guarda en el celular y sube cuando vuelva.</p>}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["condicion", "Condición insegura", "Algo del lugar: escalera rota, cable suelto…"],
              ["acto", "Acto inseguro", "Algo que alguien hace: sin arnés, sin EPP…"],
            ] as const
          ).map(([id, nombre, ayuda]) => (
            <button key={id} type="button" aria-pressed={tipo === id} onClick={() => setTipo(id)} className={`min-h-20 rounded-lg border-2 px-2 text-left ${tipo === id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
              <span className="block text-sm font-bold">{nombre}</span>
              <span className={`block text-xs ${tipo === id ? "text-slate-200" : "text-slate-500"}`}>{ayuda}</span>
            </button>
          ))}
        </div>
        <label className="block text-sm font-medium">
          ¿Qué viste?
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className={CAMPO} />
        </label>
        <label className="block text-sm font-medium">
          ¿Dónde? <span className="font-normal text-slate-500">(la ubicación GPS se toma sola)</span>
          <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej.: Obra Tintalá, torre 2, piso 8" className={CAMPO} />
        </label>
        <div>
          {fotos.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {fotos.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={f.url} alt="" className="h-20 w-20 rounded-md object-cover" />
              ))}
            </div>
          )}
          {fotos.length < 3 && (
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-slate-400 px-3 text-sm font-semibold">
              📷 {fotos.length ? "Otra foto" : "Tomar foto"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const blob = await comprimirFoto(f);
                  setFotos((x) => [...x, { blob, url: URL.createObjectURL(blob) }]);
                }}
              />
            </label>
          )}
        </div>
        <button type="button" disabled={guardando || !!falta} onClick={() => void enviar()} className="min-h-12 w-full rounded-lg bg-[#A82323] text-base font-semibold text-white disabled:opacity-40">
          {guardando ? "Guardando…" : "Enviar reporte"}
        </button>
        {falta && !guardando && <p className="text-center text-sm text-slate-500">{falta}</p>}
        {aviso && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">{aviso}</p>}
      </section>

      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Mis reportes</h2>
        {locales.length > 0 && <p className="mb-1 text-sm text-amber-800">{locales.length} guardado(s) en el celular, por subir.</p>}
        {cola.rechazados.length > 0 && (
          <div className="mb-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
            {cola.rechazados.map((r) => (
              <p key={r.id}>{r.ultimoError}</p>
            ))}
          </div>
        )}
        {mios.length === 0 ? (
          <p className="text-sm text-slate-500">{cola.enLinea ? "No has reportado nada todavía." : "Sin señal: aquí aparecen cuando haya conexión."}</p>
        ) : (
          <ul className="space-y-2">
            {mios.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium">{r.descripcion}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.estado === "cerrado" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"}`}>{ESTADO[r.estado]}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {r.tipo === "acto" ? "Acto" : "Condición"} · {r.lugar ?? "sin lugar"} · {new Date(r.reportado_en).toLocaleDateString("es-CO")}
                </p>
                {r.accion_tomada && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1">Qué se hizo: {r.accion_tomada}</p>}
                {r.motivo_anulacion && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1">Anulado: {r.motivo_anulacion}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

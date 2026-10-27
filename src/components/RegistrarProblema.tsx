"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { fechaCorta } from "@/lib/rrhh-registros";
import {
  BUCKET_REPORTES,
  COLUMNAS_REPORTE,
  contextoDepuracion,
  ESTADO_REPORTE,
  GRAVEDAD,
  GRAVEDADES,
  type Gravedad,
  type ReporteProblema,
} from "@/lib/reportes-problema";

/**
 * "Registrar problema" (Jhojan: "para que el que esté operando la app registre algún daño o mal
 * uso o algo que no esté bien"). En la barra de arriba de todas las pantallas, también en la
 * app del técnico. La pantalla en que estaba y los datos de depuración van solos; no se le
 * pregunta nada de eso. En "Mis reportes" ve en qué va cada uno (si nunca sabe qué pasó, deja
 * de reportar). Se abre desde el fondo del menú ☰ y, en pantalla ancha, desde el menú "Cuenta".
 */
const CAMPO = "w-full rounded-lg border border-slate-300 px-3 py-2 text-base";

export function VentanaProblema({ administra, onCerrar }: { administra: boolean; onCerrar: () => void }) {
  const ruta = usePathname();
  const [pestana, setPestana] = useState<"nuevo" | "mios">("nuevo");
  const [quePaso, setQuePaso] = useState("");
  const [queEsperaba, setQueEsperaba] = useState("");
  const [gravedad, setGravedad] = useState<Gravedad | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);

  const falta = !quePaso.trim() ? "Cuenta qué pasó." : !gravedad ? "Elige qué tanto te afecta." : null;

  async function enviar() {
    if (falta || !gravedad) return;
    setEnviando(true);
    setError(null);
    try {
      if (!navigator.onLine) throw new Error("Sin señal no se puede enviar. Lo que escribiste se queda aquí: envíalo cuando vuelva la señal.");
      const supabase = createClient();
      const yo = (await supabase.auth.getUser()).data.user?.id;
      if (!yo) throw new Error("Tu sesión se cerró. Vuelve a entrar y repórtalo.");
      const captura = foto ? (await subirSoporte(yo, foto, BUCKET_REPORTES)).path : null;
      const { error: e } = await supabase.from("reportes_problema").insert({
        reportado_por: yo,
        ruta,
        que_paso: quePaso.trim(),
        que_esperaba: queEsperaba.trim() || null,
        gravedad,
        captura_path: captura,
        contexto: contextoDepuracion(),
      });
      if (e) throw new Error(e.message);
      setEnviado(true);
      setQuePaso("");
      setQueEsperaba("");
      setGravedad(null);
      setFoto(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-3 pt-10 sm:pt-16" onClick={onCerrar}>
      <div
        role="dialog"
        aria-label="Registrar problema"
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 border-b border-slate-200 px-2">
          {(["nuevo", "mios"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPestana(p)}
              className={`min-h-11 px-3 text-sm font-semibold ${pestana === p ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500"}`}
            >
              {p === "nuevo" ? "Registrar problema" : "Mis reportes"}
            </button>
          ))}
          <span className="flex-1" />
          <button type="button" onClick={onCerrar} className="min-h-11 px-2 text-sm text-slate-500">
            Cerrar
          </button>
        </div>

        <div className="overflow-y-auto p-3">
          {pestana === "mios" ? (
            <MisReportes administra={administra} onIr={onCerrar} />
          ) : enviado ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
                Gracias, quedó registrado. En “Mis reportes” ves en qué va y lo que te respondan.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEnviado(false)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold">
                  Reportar otro
                </button>
                <button type="button" onClick={() => setPestana("mios")} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white">
                  Ver mis reportes
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Algo dañado, algo que no funciona como debería o que se presta para mal uso. La pantalla en la que estás
                (<span className="font-mono">{ruta}</span>) se guarda sola.
              </p>
              <label className="block text-sm font-medium">
                ¿Qué pasó?
                <textarea value={quePaso} onChange={(e) => setQuePaso(e.target.value)} rows={3} placeholder="Ej.: toqué Guardar y no pasó nada" className={`mt-1 ${CAMPO}`} />
              </label>
              <label className="block text-sm font-medium">
                ¿Qué esperabas que pasara? <span className="font-normal text-slate-500">(opcional)</span>
                <textarea value={queEsperaba} onChange={(e) => setQueEsperaba(e.target.value)} rows={2} placeholder="Ej.: que guardara la visita" className={`mt-1 ${CAMPO}`} />
              </label>
              <fieldset>
                <legend className="text-sm font-medium">¿Qué tanto te afecta?</legend>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {GRAVEDADES.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={gravedad === g.id}
                      onClick={() => setGravedad(g.id)}
                      className={`min-h-14 rounded-lg border-2 px-1 py-1 text-xs leading-tight ${
                        gravedad === g.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{g.nombre}</span>
                      {g.ayuda}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div>
                <p className="text-sm font-medium">
                  Captura o foto <span className="font-normal text-slate-500">(opcional)</span>
                </p>
                {foto ? (
                  <p className="mt-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">📎 {foto.name}</span>
                    <button type="button" onClick={() => setFoto(null)} className="min-h-11 font-semibold underline">
                      Quitar
                    </button>
                  </p>
                ) : (
                  <div className="mt-1 flex gap-2">
                    <ElegirImagen texto="📷 Tomar foto" camara onElegida={setFoto} />
                    <ElegirImagen texto="Elegir captura" onElegida={setFoto} />
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={enviando || falta !== null}
                onClick={enviar}
                className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
              >
                {enviando ? "Enviando…" : "Enviar reporte"}
              </button>
              {falta && !enviando && <p className="text-center text-xs text-slate-500">{falta}</p>}
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ElegirImagen({ texto, camara, onElegida }: { texto: string; camara?: boolean; onElegida: (f: File) => void }) {
  return (
    <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-slate-400 px-3 text-sm font-semibold">
      {texto}
      <input
        type="file"
        accept="image/*"
        capture={camara ? "environment" : undefined}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onElegida(f);
        }}
      />
    </label>
  );
}

function MisReportes({ administra, onIr }: { administra: boolean; onIr: () => void }) {
  const [reportes, setReportes] = useState<ReporteProblema[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const yo = (await supabase.auth.getUser()).data.user?.id;
      const { data, error: e } = await supabase
        .from("reportes_problema")
        .select(COLUMNAS_REPORTE)
        .eq("reportado_por", yo ?? "")
        .order("reportado_en", { ascending: false })
        .limit(50);
      if (e) setError(e.message);
      else setReportes((data ?? []) as ReporteProblema[]);
    })();
  }, []);

  return (
    <div className="space-y-2">
      {administra && (
        <Link href="/configuracion/problemas" onClick={onIr} className="block rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800">
          Ver los reportes de todos y responderlos →
        </Link>
      )}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer tus reportes: {error}</p>
      ) : reportes === null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : reportes.length === 0 ? (
        <p className="text-sm text-slate-500">No has reportado problemas.</p>
      ) : (
        <ul className="space-y-2">
          {reportes.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium text-slate-900">{r.que_paso}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.estado === "resuelto" ? "bg-green-100 text-green-800" : r.estado === "no_es_error" ? "bg-slate-200 text-slate-700" : r.estado === "en_revision" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {ESTADO_REPORTE[r.estado]}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {fechaCorta(r.reportado_en)} · {GRAVEDAD[r.gravedad]} · <span className="font-mono">{r.ruta}</span>
              </p>
              {r.nota_cierre && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-sm text-slate-800">Respuesta: {r.nota_cierre}</p>}
              {r.captura_path && (
                <AbrirArchivo bucket={BUCKET_REPORTES} path={r.captura_path}>
                  📎 Ver captura
                </AbrirArchivo>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

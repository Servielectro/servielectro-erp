"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Sugerencia {
  id: string;
  texto: string;
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
  autor: string;
}

const fecha = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

/** Una caja de texto que crece sola mientras se escribe. */
function Caja({ valor, onCambio, placeholder, autoFocus }: { valor: string; onCambio: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, [valor]);
  return (
    <textarea
      ref={ref}
      value={valor}
      autoFocus={autoFocus}
      onChange={(e) => onCambio(e.target.value)}
      placeholder={placeholder}
      rows={4}
      className="block w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
    />
  );
}

function guardarBorrador(clave: string, texto: string) {
  try {
    if (texto.trim()) localStorage.setItem(clave, texto);
    else localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento (ventana privada): solo se pierde el borrador.
  }
}

/**
 * La libreta (migración 111): cada "Guardar" deja UNA nota a salvo en la base; mientras se escribe,
 * el borrador queda en el dispositivo (por usuario), así que si se cierra la app a media nota, al
 * volver sigue ahí. Las propias se corrigen o se quitan de la lista (se archivan, no se borran).
 */
export function Sugerencias({ yo, escribe, sugerencias }: { yo: string; escribe: boolean; sugerencias: Sugerencia[] }) {
  const router = useRouter();
  const clave = `sgsst-sugerencia-borrador-${yo}`;
  const [texto, setTexto] = useState("");
  const [cargado, setCargado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  // El borrador que quedó en el dispositivo.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const b = localStorage.getItem(clave);
        if (b) setTexto(b);
      } catch {
        // nada
      }
      setCargado(true);
    }, 0);
    return () => clearTimeout(t);
  }, [clave]);
  useEffect(() => {
    if (!cargado) return;
    const t = setTimeout(() => guardarBorrador(clave, texto), 300);
    return () => clearTimeout(t);
  }, [clave, texto, cargado]);

  const guardar = () =>
    empezar(async () => {
      setError(null);
      setAviso(null);
      const limpio = texto.trim();
      if (!limpio) return;
      const { error: e } = await createClient().from("sgsst_sugerencias").insert({ texto: limpio, creado_por: yo });
      if (e) return setError(navigator.onLine ? `No se guardó: ${e.message}` : "Sin señal: no se guardó. Lo que escribiste sigue aquí; guárdalo cuando vuelva la señal.");
      guardarBorrador(clave, "");
      setTexto("");
      setAviso("Guardada.");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {escribe ? (
        <section className="space-y-2">
          <Caja valor={texto} onCambio={setTexto} placeholder="Escribe aquí tu sugerencia…" />
          <button
            type="button"
            disabled={pendiente || !texto.trim()}
            onClick={guardar}
            className="min-h-12 w-full rounded-lg bg-brand-red px-4 text-base font-semibold text-white disabled:opacity-40"
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          {aviso && <p className="text-sm text-green-800">{aviso}</p>}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        </section>
      ) : (
        <p className="text-sm text-slate-600">Para escribir sugerencias hace falta SG-SST en nivel “trabajar”.</p>
      )}

      {sugerencias.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Todavía no hay sugerencias.</p>
      ) : (
        <ul className="space-y-3">
          {sugerencias.map((s) => (
            <Nota key={s.id} s={s} propia={escribe && s.creado_por === yo} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Nota({ s, propia }: { s: Sugerencia; propia: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(s.texto);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cambiar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("sgsst_sugerencias").update(cambios).eq("id", s.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó.");
      setEditando(false);
      router.refresh();
    });
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      {editando ? (
        <div className="space-y-2">
          <Caja valor={texto} onCambio={setTexto} autoFocus />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setTexto(s.texto); setEditando(false); }} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
              Cancelar
            </button>
            <button type="button" disabled={pendiente || !texto.trim()} onClick={() => cambiar({ texto: texto.trim() })} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
              Guardar cambios
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-base text-slate-900">{s.texto}</p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {s.autor} · {fecha(s.creado_en)}
        {s.actualizado_en.slice(0, 16) !== s.creado_en.slice(0, 16) ? ` · corregida ${fecha(s.actualizado_en)}` : ""}
      </p>
      {propia && !editando && (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => setEditando(true)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold">
            Corregir
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => window.confirm("¿Quitar esta nota de la lista? Queda guardada, solo deja de verse.") && cambiar({ archivada_en: new Date().toISOString() })}
            className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm"
          >
            Quitar de la lista
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-800">{error}</p>}
    </li>
  );
}

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
  archivada_en: string | null;
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

type Filtro = "todas" | "mias" | "archivadas";

/**
 * Sugerencias para la aplicación, una libreta por módulo (tabla modulo_sugerencias). Cada «Guardar»
 * deja una nota a salvo; mientras se escribe, el borrador queda en el dispositivo (por usuario y
 * módulo). Las propias se corrigen o se archivan (no se borran). Quién ve y quién escribe lo decide
 * la base con el permiso del módulo; aquí solo se refleja.
 */
export function SugerenciasModulo({
  modulo,
  nombreModulo,
  yo,
  escribe,
  sugerencias,
}: {
  modulo: string;
  nombreModulo: string;
  yo: string;
  escribe: boolean;
  sugerencias: Sugerencia[];
}) {
  const router = useRouter();
  const clave = `sugerencia-borrador-${modulo}-${yo}`;
  const [texto, setTexto] = useState("");
  const [cargado, setCargado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
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
      // Sin .select(): la fila no se pide de vuelta. Autor y fechas los pone la base.
      const { error: e } = await createClient().from("modulo_sugerencias").insert({ modulo, texto: limpio, creado_por: yo });
      if (e) return setError(navigator.onLine ? `No se guardó: ${e.message}` : "Sin señal: no se guardó. Lo que escribiste sigue aquí; guárdalo cuando vuelva la señal.");
      guardarBorrador(clave, "");
      setTexto("");
      setAviso("Guardada.");
      router.refresh();
    });

  const activas = sugerencias.filter((s) => !s.archivada_en);
  const archivadasMias = sugerencias.filter((s) => s.archivada_en && s.creado_por === yo);
  const visibles = filtro === "mias" ? activas.filter((s) => s.creado_por === yo) : filtro === "archivadas" ? archivadasMias : activas;

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
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">Puedes leer las sugerencias. Para escribirlas hace falta {nombreModulo} en nivel «trabajar».</p>
      )}

      <div className="flex flex-wrap gap-2" role="tablist">
        {(
          [
            ["todas", `Todas (${activas.length})`],
            ["mias", `Las mías (${activas.filter((s) => s.creado_por === yo).length})`],
            ...(archivadasMias.length ? ([["archivadas", `Mis archivadas (${archivadasMias.length})`]] as const) : []),
          ] as [Filtro, string][]
        ).map(([f, etiqueta]) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filtro === f}
            onClick={() => setFiltro(f)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filtro === f ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{filtro === "todas" ? "Todavía no hay sugerencias." : "No hay ninguna aquí."}</p>
      ) : (
        <ul className="space-y-3">
          {visibles.map((s) => (
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
      // .select("id"): si la base no dejó cambiarla (no es tuya, o sin permiso), vuelve vacío y se dice.
      const { data, error: e } = await createClient().from("modulo_sugerencias").update(cambios).eq("id", s.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: la base no dejó cambiarla.");
      setEditando(false);
      router.refresh();
    });
  return (
    <li className={`rounded-lg border p-3 ${s.archivada_en ? "border-dashed border-slate-300 bg-slate-50" : "border-slate-200 bg-white"}`}>
      {/* Quién y cuándo, arriba: Jhojan necesita saber a quién preguntarle. */}
      <p className="text-sm font-semibold text-slate-800">
        {s.autor} <span className="font-normal text-slate-500">· {fecha(s.creado_en)}</span>
        {s.actualizado_en.slice(0, 16) !== s.creado_en.slice(0, 16) && <span className="font-normal text-slate-500"> · corregida {fecha(s.actualizado_en)}</span>}
        {s.archivada_en && <span className="font-normal text-slate-500"> · archivada {fecha(s.archivada_en)}</span>}
      </p>
      {editando ? (
        <div className="mt-2 space-y-2">
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
        <p className="mt-1 whitespace-pre-wrap break-words text-base text-slate-900">{s.texto}</p>
      )}
      {propia && !editando && (
        <div className="mt-2 flex gap-2">
          {s.archivada_en ? (
            <button type="button" disabled={pendiente} onClick={() => cambiar({ archivada_en: null })} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold">
              Volver a la lista
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setEditando(true)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold">
                Corregir
              </button>
              <button
                type="button"
                disabled={pendiente}
                onClick={() => window.confirm("¿Archivar esta sugerencia? Queda guardada; solo deja de verse en la lista.") && cambiar({ archivada_en: new Date().toISOString() })}
                className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm"
              >
                Archivar
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-800">{error}</p>}
    </li>
  );
}

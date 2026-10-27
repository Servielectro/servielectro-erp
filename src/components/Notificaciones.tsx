"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COLUMNAS_NOTIFICACION, haceCuanto, type Notificacion } from "@/lib/notificaciones";

const CLAVE_CACHE = "notificaciones-cache";
const CADA_MS = 60_000;

/** Lo último que se vio, para mostrar algo sin señal. Nunca falla. */
function leerCache(): { noLeidas: number; lista: Notificacion[] } | null {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CACHE) ?? "null");
  } catch {
    return null;
  }
}
function guardarCache(v: { noLeidas: number; lista: Notificacion[] }) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(v));
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

/**
 * La campanita de la barra (Jhojan: "arriba ponemos la campanita para las notificaciones"). Cuenta
 * las no leídas, abre la lista, y al tocar una lleva al sitio y queda leída. Las crea la base
 * (migración 76): aquí solo se leen y se marcan.
 *
 * Sin señal no rompe nada: muestra lo último que vio este navegador y lo dice. Se actualiza cada
 * minuto con la pantalla a la vista, al volver a la pestaña y al volver la señal.
 */
export function BotonNotificaciones() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [lista, setLista] = useState<Notificacion[] | null>(null);
  const [sinSenal, setSinSenal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSinSenal(true);
      return;
    }
    try {
      const supabase = createClient();
      const [conteo, ultimas] = await Promise.all([
        supabase.from("notificaciones").select("id", { count: "exact", head: true }).is("leida_en", null),
        supabase.from("notificaciones").select(COLUMNAS_NOTIFICACION).order("creada_en", { ascending: false }).limit(20),
      ]);
      if (conteo.error || ultimas.error) throw new Error((conteo.error ?? ultimas.error)?.message);
      const v = { noLeidas: conteo.count ?? 0, lista: (ultimas.data ?? []) as Notificacion[] };
      setNoLeidas(v.noLeidas);
      setLista(v.lista);
      setSinSenal(false);
      setError(null);
      guardarCache(v);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/fetch|network|load failed/i.test(msg)) setSinSenal(true);
      else setError(msg);
    }
  }, []);

  useEffect(() => {
    const cache = leerCache();
    const primera = setTimeout(() => {
      if (cache) {
        setNoLeidas(cache.noLeidas);
        setLista(cache.lista);
      }
      void cargar();
    }, 0);
    const cada = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, CADA_MS);
    const alVolver = () => document.visibilityState === "visible" && void cargar();
    const conSenal = () => void cargar();
    const sinRed = () => setSinSenal(true);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", conSenal);
    window.addEventListener("offline", sinRed);
    return () => {
      clearTimeout(primera);
      clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", conSenal);
      window.removeEventListener("offline", sinRed);
    };
  }, [cargar]);

  // Se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  async function marcar(ids: string[] | "todas") {
    const ahora = new Date().toISOString();
    setLista((l) => l?.map((n) => (ids === "todas" || ids.includes(n.id) ? { ...n, leida_en: n.leida_en ?? ahora } : n)) ?? l);
    setNoLeidas((c) => (ids === "todas" ? 0 : Math.max(0, c - ids.length)));
    try {
      let q = createClient().from("notificaciones").update({ leida_en: ahora }).is("leida_en", null);
      if (ids !== "todas") q = q.in("id", ids);
      const { error: e } = await q;
      if (e) throw new Error(e.message);
    } catch {
      // Sin señal: queda leída en pantalla; la próxima carga trae el estado real.
    }
  }

  function abrir(n: Notificacion) {
    setAbierto(false);
    if (!n.leida_en) void marcar([n.id]);
    router.push(n.ruta ?? "/notificaciones");
  }

  return (
    <div ref={caja} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setAbierto((a) => !a);
          if (!abierto) void cargar();
        }}
        aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : "Notificaciones"}
        aria-expanded={abierto}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {noLeidas > 0 && (
          <span className="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-[#A82323] px-1 text-center text-xs font-bold leading-5 text-white">
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-x-2 top-16 z-50 max-h-[75vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-96">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1">
            <p className="text-sm font-bold text-slate-900">Notificaciones</p>
            {noLeidas > 0 && (
              <button type="button" onClick={() => void marcar("todas")} className="min-h-11 text-xs font-semibold text-slate-700 underline">
                Marcar todas como leídas
              </button>
            )}
          </div>
          {sinSenal && <p className="bg-amber-50 px-3 py-1.5 text-xs text-amber-900">Sin señal: esto es lo último que se vio. Se actualiza cuando vuelva la señal.</p>}
          {error && !sinSenal && <p className="bg-red-50 px-3 py-1.5 text-xs text-red-800">No se pudieron leer: {error}</p>}
          <div className="max-h-[55vh] overflow-y-auto">
            {lista === null ? (
              <p className="px-3 py-4 text-sm text-slate-500">{sinSenal ? "Todavía no hay notificaciones guardadas en este equipo." : "Cargando…"}</p>
            ) : lista.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">No tienes notificaciones.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lista.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => abrir(n)} className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 ${n.leida_en ? "" : "bg-sky-50/60"}`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.leida_en ? "bg-transparent" : n.urgente ? "bg-red-600" : "bg-sky-600"}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${n.leida_en ? "text-slate-700" : "font-semibold text-slate-900"} ${n.urgente && !n.leida_en ? "text-red-800" : ""}`}>{n.titulo}</span>
                        {n.cuerpo && <span className="block text-xs text-slate-600">{n.cuerpo}</span>}
                        <span className="block text-xs text-slate-400">{haceCuanto(n.creada_en)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/notificaciones" onClick={() => setAbierto(false)} className="flex min-h-11 items-center justify-center border-t border-slate-100 text-sm font-semibold text-slate-700">
            Ver todas · Elegir qué me avisa
          </Link>
        </div>
      )}
    </div>
  );
}

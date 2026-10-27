"use client";

// Lo común de las pantallas de campo de SG-SST (/sgsst/campo y /reportar): quedan guardadas en
// el celular (public/sw.js) y suben por la MISMA cola del técnico (src/lib/tecnico/sync.ts).

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pedirAlmacenamientoPersistente, todos, type EnvioPendiente } from "@/lib/tecnico/db";
import { sincronizar } from "@/lib/tecnico/sync";
import { servidorSupabase } from "@/lib/tecnico/servidor-supabase";

/** Registra el service worker y le pasa los archivos de esta pantalla para que abra sin señal. */
export function guardarCopiaSinSenal(pagina: string) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.includes("/_next/static/") || u.includes("/_next/image"));
      reg.active?.postMessage({ tipo: "guardar-archivos", urls: [...urls, pagina] });
    })
    .catch(() => {});
}

export interface EstadoCola {
  enLinea: boolean;
  subiendo: boolean;
  pendientes: EnvioPendiente[];
  /** Rechazados por la base (no se reintentan solos): el mensaje dice por qué. */
  rechazados: EnvioPendiente[];
}

/**
 * Señal, cola y subida. `alSubir` corre después de cada vuelta con señal (para bajar lo nuevo).
 */
export function useCola(pagina: string, alSubir?: () => Promise<void>) {
  const supabase = useMemo(() => createClient(), []);
  const servidor = useMemo(() => servidorSupabase(supabase), [supabase]);
  const [estado, setEstado] = useState<EstadoCola>({ enLinea: true, subiendo: false, pendientes: [], rechazados: [] });

  const refrescar = useCallback(async () => {
    const cola = await todos<EnvioPendiente>("cola");
    setEstado((e) => ({ ...e, enLinea: navigator.onLine, pendientes: cola.filter((c) => !c.permanente), rechazados: cola.filter((c) => c.permanente) }));
  }, []);

  const subir = useCallback(async () => {
    if (!navigator.onLine) return refrescar();
    setEstado((e) => ({ ...e, subiendo: true }));
    try {
      const r = await sincronizar(servidor);
      if (!r.sinConexion && alSubir) {
        try {
          await alSubir();
        } catch {
          // sin red o sesión vencida: se queda con lo que tenía
        }
      }
    } finally {
      setEstado((e) => ({ ...e, subiendo: false }));
      await refrescar();
    }
  }, [servidor, alSubir, refrescar]);

  useEffect(() => {
    const t = setTimeout(() => {
      void pedirAlmacenamientoPersistente();
      guardarCopiaSinSenal(pagina);
      void subir();
    }, 0);
    const conSenal = () => void subir();
    const sinSenal = () => setEstado((e) => ({ ...e, enLinea: false }));
    window.addEventListener("online", conSenal);
    window.addEventListener("offline", sinSenal);
    const cada = window.setInterval(() => void subir(), 60_000);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", conSenal);
      window.removeEventListener("offline", sinSenal);
      window.clearInterval(cada);
    };
  }, [pagina, subir]);

  return { ...estado, subir, refrescar, supabase };
}

export function nuevoId(): string {
  return crypto.randomUUID();
}

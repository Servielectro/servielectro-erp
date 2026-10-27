"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Estado = "cargando" | "sin_clave" | "ios_sin_instalar" | "no_soportado" | "denegado" | "activo" | "inactivo";
type Plataforma = "ios" | "android" | "otro";

function base64UrlABytes(b64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (b64.length % 4)) % 4);
  const crudo = atob((b64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
}

/**
 * Aviso al celular (Web Push). El permiso se pide SOLO al tocar el botón, nunca al entrar. Lo que
 * hay que saber está escrito aquí: hay que instalar la app (en iPhone es obligatorio) y cada
 * celular se activa por separado.
 */
export function ActivarAvisos() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [plataforma, setPlataforma] = useState<Plataforma>("otro");
  const [instalada, setInstalada] = useState(false);
  const [instalar, setInstalar] = useState<EventoInstalar | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const revisar = useCallback(async () => {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const plat: Plataforma = ios ? "ios" : /android/i.test(ua) ? "android" : "otro";
    const inst = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setPlataforma(plat);
    setInstalada(inst);
    if (!CLAVE) return setEstado("sin_clave");
    const soporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!soporta) return setEstado(plat === "ios" && !inst ? "ios_sin_instalar" : "no_soportado");
    if (Notification.permission === "denied") return setEstado("denegado");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return setEstado("inactivo");
      const { data } = await createClient().from("notificacion_suscripciones").select("id").eq("endpoint", sub.endpoint).is("revocada_en", null).maybeSingle();
      setEstado(data ? "activo" : "inactivo");
    } catch {
      setEstado("inactivo");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void revisar(), 0);
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      setInstalar(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", alOfrecer);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", alOfrecer);
    };
  }, [revisar]);

  async function activar() {
    setError(null);
    setAviso(null);
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegado" : "inactivo");
        if (permiso !== "denied") setAviso("No se activó: el celular no dio el permiso. Toca el botón otra vez y elige “Permitir”.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(CLAVE) }));
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const { error: e } = await createClient().rpc("fn_registrar_suscripcion", {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys?.p256dh,
        p_auth: json.keys?.auth,
        p_dispositivo: navigator.userAgent,
      });
      if (e) throw new Error(e.message);
      setEstado("activo");
      setAviso("Listo: los avisos llegan a este celular (tardan hasta un minuto en salir).");
    } catch (e) {
      setError(`No se pudo activar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
    setError(null);
    setTrabajando(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await createClient().rpc("fn_revocar_suscripcion", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEstado("inactivo");
      setAviso("Desactivado en este celular. En la app siguen apareciendo.");
    } catch (e) {
      setError(`No se pudo desactivar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTrabajando(false);
    }
  }

  const comoInstalar =
    plataforma === "ios" ? (
      <ol className="ml-4 list-decimal text-sm">
        <li>Abre el ERP en <b>Safari</b> (en otro navegador del iPhone no se puede).</li>
        <li>Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
        <li>Elige <b>“Agregar a pantalla de inicio”</b> y luego <b>Agregar</b>.</li>
        <li>Abre el ERP desde el ícono nuevo y vuelve aquí a activar los avisos.</li>
      </ol>
    ) : plataforma === "android" ? (
      <ol className="ml-4 list-decimal text-sm">
        <li>En Chrome, toca el menú <b>⋮</b> (arriba a la derecha).</li>
        <li>Elige <b>“Instalar aplicación”</b> o <b>“Agregar a la pantalla principal”</b>.</li>
        <li>Abre el ERP desde el ícono nuevo y activa los avisos aquí.</li>
      </ol>
    ) : (
      <p className="text-sm">En el computador no hace falta instalarla, pero los avisos llegan solo mientras el navegador esté abierto.</p>
    );

  const comoRehabilitar =
    plataforma === "ios"
      ? "En el iPhone: Ajustes → Notificaciones → busca “SE ERP” → activa “Permitir notificaciones”. Después vuelve aquí."
      : plataforma === "android"
        ? "En Android: mantén presionado el ícono del ERP → “Información de la app” → Notificaciones → actívalas. Si lo usas desde Chrome sin instalar: toca el candado junto a la dirección → Permisos → Notificaciones → Permitir. Después vuelve aquí."
        : "En el navegador: toca el candado junto a la dirección → Notificaciones → Permitir. Después recarga esta página.";

  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-900">Avisos en este celular</h2>
      <p className="text-xs text-slate-600">Para que te llegue al teléfono, aunque no tengas el ERP abierto, cuando te aprueben algo, te asignen una tarea o pidan algo que te toca decidir.</p>
      <p className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
        <b>Cada celular se activa por separado.</b> Activarlo aquí no lo activa en el de nadie más: cada técnico entra a Notificaciones en su propio teléfono y lo activa.
      </p>

      {!instalada && plataforma !== "otro" && estado !== "sin_clave" && (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
          <p className="text-sm font-semibold">
            {plataforma === "ios" ? "En iPhone primero hay que instalar la app: sin instalar, no hay avisos." : "Instala la app: sin instalar, los avisos en Android llegan a medias."}
          </p>
          {instalar ? (
            <button
              type="button"
              onClick={async () => {
                await instalar.prompt();
                setInstalar(null);
              }}
              className="min-h-11 w-full rounded-md bg-slate-900 text-sm font-semibold text-white"
            >
              Instalar la app en este celular
            </button>
          ) : (
            comoInstalar
          )}
        </div>
      )}

      {estado === "cargando" && <p className="text-sm text-slate-500">Revisando este celular…</p>}
      {estado === "sin_clave" && <p className="text-sm text-slate-600">Los avisos al celular todavía no están configurados en el servidor.</p>}
      {estado === "no_soportado" && <p className="text-sm text-slate-600">Este navegador no permite avisos. En Android usa Chrome; en iPhone, Safari con la app instalada.</p>}
      {estado === "ios_sin_instalar" && <p className="text-sm text-slate-600">Cuando la abras desde el ícono de la pantalla de inicio, aquí aparece el botón para activar.</p>}
      {estado === "denegado" && (
        <div className="rounded-md bg-red-50 p-2 text-sm text-red-900">
          <p className="font-semibold">Este celular bloqueó los avisos del ERP.</p>
          <p>Desde aquí no se puede volver a pedir el permiso: {comoRehabilitar}</p>
        </div>
      )}
      {estado === "inactivo" && (
        <button type="button" disabled={trabajando} onClick={() => void activar()} className="min-h-12 w-full rounded-lg bg-slate-900 text-base font-semibold text-white disabled:opacity-50">
          {trabajando ? "Activando…" : "Activar avisos en este celular"}
        </button>
      )}
      {estado === "activo" && (
        <div className="space-y-1">
          <p className="rounded-md bg-green-50 px-2 py-1 text-sm text-green-900">✓ Este celular recibe los avisos.</p>
          <button type="button" disabled={trabajando} onClick={() => void desactivar()} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm disabled:opacity-50">
            Desactivar en este celular
          </button>
        </div>
      )}
      {aviso && <p className="text-sm text-slate-700">{aviso}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
      <p className="text-xs text-slate-500">El aviso dice lo mismo que la notificación, sin montos ni datos de nadie: sale en la pantalla de bloqueo.</p>
    </section>
  );
}

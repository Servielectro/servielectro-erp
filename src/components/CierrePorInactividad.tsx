"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AVISO_ANTES_MS,
  guardarUltimaActividad,
  leerMinutosInactividad,
  leerUltimaActividad,
  reiniciarUltimaActividad,
} from "@/lib/inactividad";

// Interacción real del usuario. `scroll` va en captura porque no burbujea.
const EVENTOS_ACTIVIDAD = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;

// No se escribe localStorage en cada movimiento del mouse: con una vez cada
// pocos segundos alcanza para que las otras pestañas se enteren.
const ESCRITURA_CADA_MS = 5_000;

/**
 * Cierra la sesión tras N minutos sin interacción (20 por defecto, configurable por
 * dispositivo en Configuración), con un aviso un minuto antes para no cortar a
 * alguien a mitad de una cotización. Es seguridad de pantalla — la RLS sigue mandando.
 *
 * El tiempo se mide con marcas de reloj, no sumando ticks: si la tablet se suspende
 * con la pestaña abierta, los timers se congelan, pero al despertar el cálculo da
 * el tiempo real transcurrido y la sesión se cierra igual.
 */
export function CierrePorInactividad() {
  const ultimaLocal = useRef(0);
  const ultimaEscritura = useRef(0);
  const avisoActivo = useRef(false);
  const cerrando = useRef(false);
  const [restanteMs, setRestanteMs] = useState<number | null>(null);

  useEffect(() => {
    const limiteMs = () => leerMinutosInactividad() * 60_000;

    // Al cargar: si la marca guardada ya está vencida (navegador cerrado horas con la
    // cookie de sesión viva), se cierra de una — abrir la app no cuenta como volver.
    const guardada = leerUltimaActividad();
    if (guardada && Date.now() - guardada >= limiteMs()) {
      void cerrarSesion(cerrando);
      return;
    }
    ultimaLocal.current = guardada ?? Date.now();
    if (!guardada) guardarUltimaActividad(ultimaLocal.current);

    function onActividad() {
      // Con el aviso en pantalla solo cuenta el botón "Seguir conectado": un roce
      // accidental de la tablet no debe esconder el aviso sin que nadie lo lea.
      if (avisoActivo.current || cerrando.current) return;
      const ahora = Date.now();
      ultimaLocal.current = ahora;
      if (ahora - ultimaEscritura.current >= ESCRITURA_CADA_MS) {
        ultimaEscritura.current = ahora;
        guardarUltimaActividad(ahora);
      }
    }

    function revisar() {
      if (cerrando.current) return;
      // Actividad en otra pestaña también cuenta.
      const ultima = Math.max(ultimaLocal.current, leerUltimaActividad() ?? 0);
      const restante = limiteMs() - (Date.now() - ultima);
      if (restante <= 0) {
        void cerrarSesion(cerrando);
      } else if (restante <= AVISO_ANTES_MS) {
        avisoActivo.current = true;
        setRestanteMs(restante);
      } else if (avisoActivo.current) {
        avisoActivo.current = false;
        setRestanteMs(null);
      }
    }

    function onVisibilidad() {
      if (document.visibilityState === "visible") revisar();
    }

    for (const ev of EVENTOS_ACTIVIDAD) {
      window.addEventListener(ev, onActividad, { passive: true, capture: true });
    }
    document.addEventListener("visibilitychange", onVisibilidad);
    const intervalo = window.setInterval(revisar, 1_000);

    return () => {
      for (const ev of EVENTOS_ACTIVIDAD) {
        window.removeEventListener(ev, onActividad, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibilidad);
      window.clearInterval(intervalo);
    };
  }, []);

  function seguirConectado() {
    const ahora = Date.now();
    ultimaLocal.current = ahora;
    ultimaEscritura.current = ahora;
    guardarUltimaActividad(ahora);
    avisoActivo.current = false;
    setRestanteMs(null);
  }

  if (restanteMs === null) return null;

  const segundos = Math.max(0, Math.ceil(restanteMs / 1000));

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="aviso-inactividad-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 text-center shadow-lg">
        <p
          id="aviso-inactividad-titulo"
          className="text-base font-semibold text-slate-900"
        >
          ¿Sigues ahí?
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Por seguridad, la sesión se cerrará en{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {segundos} s
          </span>{" "}
          por inactividad. Si estás armando una cotización, el borrador queda
          guardado en este dispositivo.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={seguirConectado}
            autoFocus
            className="w-full rounded-md bg-brand-red px-3 py-3 text-base font-medium text-white"
          >
            Seguir conectado
          </button>
          <button
            type="button"
            onClick={() => void cerrarSesion(cerrando)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            Cerrar sesión ahora
          </button>
        </div>
      </div>
    </div>
  );
}

async function cerrarSesion(cerrando: { current: boolean }) {
  if (cerrando.current) return;
  cerrando.current = true;

  // Si quedó un campo con foco, el blur confirma su valor y el autoguardado del
  // borrador lo alcanza a escribir antes de salir.
  (document.activeElement as HTMLElement | null)?.blur?.();
  await new Promise((r) => setTimeout(r, 50));

  const destino = window.location.pathname + window.location.search;

  try {
    // scope "local": cierra solo este dispositivo, no la sesión del computador.
    // Con tope de tiempo: sin señal en obra no se puede quedar esperando.
    await Promise.race([
      createClient().auth.signOut({ scope: "local" }),
      new Promise((r) => setTimeout(r, 4_000)),
    ]);
  } catch {}

  // Por si signOut no alcanzó a limpiar (sin red): se borran las cookies de sesión
  // de Supabase a mano, así al recargar el servidor ya no ve un usuario.
  for (const c of document.cookie.split(";")) {
    const nombre = c.split("=")[0].trim();
    if (nombre.startsWith("sb-") && nombre.includes("-auth-token")) {
      document.cookie = `${nombre}=; Max-Age=0; path=/`;
    }
  }
  reiniciarUltimaActividad();

  // Sin mensaje ni marca de "inactividad" (pedido de Jhojan): solo la pantalla de login
  // limpia. `next` no muestra nada; solo devuelve a donde estaba al volver a entrar.
  const params = new URLSearchParams({ next: destino });
  // Navegación completa (no router.push): descarta de memoria todo lo que había en pantalla.
  window.location.replace(`/login?${params}`);
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Firma a mano alzada en pantalla completa (horizontal donde el celular lo permita).
 * Devuelve un PNG. Trazo con pointer events: dedo, lápiz o guante capacitivo.
 */
export function FirmaPantallaCompleta({
  titulo,
  onListo,
  onCancelar,
}: {
  titulo: string;
  onListo: (png: Blob) => void;
  onCancelar: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [hayTrazo, setHayTrazo] = useState(false);

  useEffect(() => {
    const el = contenedor.current;
    // Pantalla completa y horizontal: si el celular no deja, igual ocupa toda la vista.
    el?.requestFullscreen?.().catch(() => {});
    const orientacion = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientacion?.lock?.("landscape").catch(() => {});

    const ajustar = () => {
      const c = lienzo.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
      setHayTrazo(false); // al girar se borra: mejor firmar de nuevo que una firma deformada
    };
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => {
      window.removeEventListener("resize", ajustar);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      screen.orientation?.unlock?.();
    };
  }, []);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function bajar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    ultimo.current = punto(e);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current || !ultimo.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo.current = p;
    if (!hayTrazo) setHayTrazo(true);
  }

  function subir() {
    dibujando.current = false;
    ultimo.current = null;
  }

  function borrarTodo() {
    const c = lienzo.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setHayTrazo(false);
  }

  function listo() {
    const c = lienzo.current;
    if (!c || !hayTrazo) return;
    // Fondo blanco: un PNG transparente se ve negro en algunos visores.
    const salida = document.createElement("canvas");
    salida.width = c.width;
    salida.height = c.height;
    const ctx = salida.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, salida.width, salida.height);
    ctx.drawImage(c, 0, 0);
    salida.toBlob((b) => b && onListo(b), "image/png");
  }

  return (
    <div ref={contenedor} className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-300 px-3 py-2">
        <p className="text-base font-semibold">{titulo}</p>
        <button type="button" onClick={borrarTodo} className="min-h-12 rounded-lg border border-slate-400 px-4 text-base font-medium">
          Borrar
        </button>
      </div>
      <canvas
        ref={lienzo}
        onPointerDown={bajar}
        onPointerMove={mover}
        onPointerUp={subir}
        onPointerCancel={subir}
        className="flex-1 touch-none bg-white"
        aria-label="Espacio para firmar"
      />
      <p className="pointer-events-none -mt-16 mb-10 text-center text-sm text-slate-400">Firme aquí con el dedo</p>
      <div className="flex gap-3 border-t border-slate-300 p-3">
        <button type="button" onClick={onCancelar} className="min-h-14 flex-1 rounded-xl border border-slate-400 text-lg font-medium">
          Cancelar
        </button>
        <button
          type="button"
          onClick={listo}
          disabled={!hayTrazo}
          className="min-h-14 flex-1 rounded-xl bg-[#A82323] text-lg font-semibold text-white disabled:opacity-40"
        >
          {hayTrazo ? "Listo" : "Firme primero"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Firma a mano alzada a pantalla completa, en la orientación en que esté el celular.
 * Devuelve un PNG. Trazo con pointer events: dedo, lápiz o guante capacitivo.
 *
 * 2026-10-21 (prueba de Jhojan en su celular): no se fuerza el giro a horizontal; al girar,
 * el botón "Listo" quedaba fuera de la pantalla. Causa: el <canvas> toma como alto propio el
 * de su resolución interna (alto × densidad de píxeles, 2 o 3 en un celular) y empujaba la
 * barra de botones hacia abajo. Ahora el lienzo va posicionado sobre su contenedor, así su
 * resolución no cambia el diseño, y los botones quedan siempre a la vista.
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
    let anchoPrevio = 0;
    const ajustar = () => {
      const c = lienzo.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Solo el alto cambió (la barra del navegador que aparece o se esconde): se conserva
      // lo firmado. Si cambió el ancho, el celular giró: se borra, mejor firmar de nuevo que
      // una firma deformada.
      const giro = Math.round(r.width) !== anchoPrevio;
      anchoPrevio = Math.round(r.width);
      let copia: HTMLCanvasElement | null = null;
      if (!giro && c.width && c.height) {
        copia = document.createElement("canvas");
        copia.width = c.width;
        copia.height = c.height;
        copia.getContext("2d")?.drawImage(c, 0, 0);
      }
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      if (copia) ctx.drawImage(copia, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
      if (giro) setHayTrazo(false);
    };
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
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

  // Botones chicos y oscuros, del tamaño de Antes/Durante/Después: no tapan el lienzo.
  const boton = "min-h-9 rounded-lg px-3 text-base font-semibold";
  return (
    <div ref={contenedor} className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-300 px-3 py-1.5">
        <p className="min-w-0 flex-1 truncate text-base font-semibold">{titulo}</p>
      </div>
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={lienzo}
          onPointerDown={bajar}
          onPointerMove={mover}
          onPointerUp={subir}
          onPointerCancel={subir}
          className="absolute inset-0 h-full w-full touch-none bg-white"
          aria-label="Espacio para firmar"
        />
        {!hayTrazo && (
          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm text-slate-400">
            Firme aquí con el dedo o con el lápiz
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-slate-300 px-3 py-1.5">
        <button type="button" onClick={onCancelar} className={`${boton} border border-slate-400 text-slate-800`}>
          Cancelar
        </button>
        <button type="button" onClick={borrarTodo} className={`${boton} border border-slate-400 text-slate-800`}>
          Borrar
        </button>
        <button
          type="button"
          onClick={listo}
          disabled={!hayTrazo}
          className={`${boton} ml-auto bg-slate-900 text-white disabled:bg-slate-300 disabled:text-slate-600`}
        >
          {hayTrazo ? "Listo" : "Firme primero"}
        </button>
      </div>
    </div>
  );
}

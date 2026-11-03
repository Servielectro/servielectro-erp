"use client";

import { useEffect, useRef, useState } from "react";

// pdf.js (build "legacy": funciona en celulares Android/iOS de hace unos años). El worker va
// copiado en public/pdfjs con la MISMA versión del paquete (package.json: pdfjs-dist 4.10.38);
// si se actualiza el paquete, se copia otra vez node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs.
const WORKER = "/pdfjs/pdf.worker.min.mjs";

const ZOOMS = [1, 1.5, 2];

/**
 * El PDF a pantalla completa, una lámina debajo de la otra al ancho del celular. Un <iframe> no
 * sirve: Chrome en Android no dibuja PDF dentro de la página. `onCerrar` es "Terminé de leer".
 */
export function VisorPdf({ url, titulo, onCerrar }: { url: string; titulo: string; onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState(0);
  const [vista, setVista] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Las láminas son apaisadas (16:9): al girar el celular se vuelven a dibujar al ancho nuevo.
  const [giro, setGiro] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const alCambiar = () => {
      clearTimeout(t);
      t = setTimeout(() => setGiro((g) => g + 1), 250);
    };
    window.addEventListener("resize", alCambiar);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", alCambiar);
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    let destruir: (() => void) | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
        const tarea = pdfjs.getDocument({ url });
        destruir = () => void tarea.destroy();
        const doc = await tarea.promise;
        if (cancelado || !caja.current) return;
        setPaginas(doc.numPages);
        const contenedor = caja.current;
        contenedor.replaceChildren();
        const ancho = contenedor.clientWidth * ZOOMS[zoom];
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelado) return;
          const pagina = await doc.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const vp = pagina.getViewport({ scale: (ancho / base.width) * dpr });
          const lienzo = document.createElement("canvas");
          lienzo.width = Math.floor(vp.width);
          lienzo.height = Math.floor(vp.height);
          lienzo.style.width = `${Math.floor(ancho)}px`;
          lienzo.style.maxWidth = "none";
          lienzo.className = "mx-auto mb-3 block bg-white shadow";
          lienzo.dataset.pagina = String(n);
          contenedor.appendChild(lienzo);
          await pagina.render({ canvasContext: lienzo.getContext("2d")!, viewport: vp }).promise;
        }
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelado = true;
      destruir?.();
    };
  }, [url, zoom, giro]);

  // Qué lámina se está viendo (la que ocupa el centro de la pantalla).
  function alDesplazar() {
    const c = caja.current;
    if (!c) return;
    const medio = c.scrollTop + c.clientHeight / 2;
    for (const el of Array.from(c.children) as HTMLElement[]) {
      if (el.offsetTop <= medio && el.offsetTop + el.offsetHeight >= medio) {
        setVista(Number(el.dataset.pagina) || 1);
        break;
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-800">
      <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titulo}</p>
          <p className="text-xs text-slate-300">{paginas ? `Lámina ${vista} de ${paginas}` : "Cargando…"}</p>
        </div>
        <button
          type="button"
          onClick={() => setZoom((z) => (z + 1) % ZOOMS.length)}
          className="min-h-11 rounded-lg border border-slate-500 px-3 text-sm font-semibold"
          aria-label="Cambiar tamaño"
        >
          {ZOOMS[zoom] === 1 ? "Ampliar" : `${ZOOMS[zoom]}×`}
        </button>
      </div>
      <div ref={caja} onScroll={alDesplazar} className="flex-1 overflow-auto px-2 py-3" />
      {paginas > 0 && zoom === 0 && <p className="hidden bg-slate-800 pb-1 text-center text-xs text-slate-300 portrait:block">Gire el celular para verlo más grande</p>}
      {error && (
        <div className="bg-red-50 px-4 py-3 text-sm text-red-800">
          No se pudo mostrar el PDF aquí ({error}).{" "}
          <a href={url} target="_blank" rel="noreferrer" className="font-semibold underline">
            Abrirlo en el navegador
          </a>
        </div>
      )}
      <div className="bg-slate-900 p-3">
        <button type="button" onClick={onCerrar} className="flex min-h-14 w-full items-center justify-center rounded-xl bg-green-600 text-lg font-bold text-white">
          Terminé de leer
        </button>
      </div>
    </div>
  );
}

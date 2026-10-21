"use client";

import { useEffect, useRef, useState } from "react";

export interface FotoGaleria {
  id: string;
  url: string | null;
  etiqueta: string; // "Antes · 10:42"
  enDrive: boolean;
}

/** Rejilla de tres por fila; al tocar una, pantalla completa con flechas (y deslizando). */
export function GaleriaFotos({ fotos }: { fotos: FotoGaleria[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const toque = useRef<number | null>(null);

  const mover = (paso: number) =>
    setAbierta((i) => (i === null ? null : (i + paso + fotos.length) % fotos.length));

  useEffect(() => {
    if (abierta === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(null);
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  if (fotos.length === 0) return <p className="text-sm text-slate-500">Sin fotos.</p>;
  const actual = abierta === null ? null : fotos[abierta];

  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5">
        {fotos.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => setAbierta(i)}
              className="relative block aspect-square w-full overflow-hidden rounded-lg bg-slate-200"
              aria-label={`Abrir foto: ${f.etiqueta}`}
            >
              {f.url && !f.enDrive ? (
                // eslint-disable-next-line @next/next/no-img-element -- enlace firmado y temporal del bucket privado
                <img src={f.url} alt={f.etiqueta} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center p-1 text-center text-xs text-slate-600">
                  {f.enDrive ? "En Drive" : "Sin archivo"}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-left text-xs text-white">
                {f.etiqueta}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {actual && abierta !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          role="dialog"
          aria-label="Foto a pantalla completa"
          onTouchStart={(e) => (toque.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (toque.current === null) return;
            const dx = e.changedTouches[0].clientX - toque.current;
            toque.current = null;
            if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1);
          }}
        >
          <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-white">
            <p className="min-w-0 flex-1 truncate text-sm">
              {abierta + 1} de {fotos.length} · {actual.etiqueta}
            </p>
            <button type="button" onClick={() => setAbierta(null)} className="min-h-11 min-w-11 rounded-lg text-xl" aria-label="Cerrar">
              ×
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            {actual.url && !actual.enDrive ? (
              // eslint-disable-next-line @next/next/no-img-element -- enlace firmado y temporal del bucket privado
              <img src={actual.url} alt={actual.etiqueta} className="absolute inset-0 h-full w-full object-contain" />
            ) : actual.url ? (
              <a href={actual.url} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center text-white underline">
                Abrir en Drive
              </a>
            ) : (
              <p className="absolute inset-0 flex items-center justify-center text-white">Sin archivo</p>
            )}
          </div>
          {fotos.length > 1 && (
            <div className="flex shrink-0 justify-between px-3 py-2">
              <button type="button" onClick={() => mover(-1)} className="min-h-11 min-w-11 rounded-lg bg-white/15 px-4 text-xl text-white" aria-label="Foto anterior">
                ‹
              </button>
              <button type="button" onClick={() => mover(1)} className="min-h-11 min-w-11 rounded-lg bg-white/15 px-4 text-xl text-white" aria-label="Foto siguiente">
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

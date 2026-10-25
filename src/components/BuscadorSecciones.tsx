"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buscarSecciones, type SeccionMenu } from "@/lib/menu";

/**
 * Buscador de secciones (Jhojan: "un símbolo de búsqueda en la parte de arriba para encontrar la
 * sección que quiero más rápidamente"). Solo encuentra secciones, no datos, y solo las que el
 * usuario tiene habilitadas: recibe las mismas secciones que la barra y la hamburguesa.
 *
 * Se abre con la lupa (dedo), con Ctrl+K o con "/" (computador). Flechas y Enter para elegir.
 */
export function BotonBuscador({ secciones }: { secciones: SeccionMenu[] }) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto(true);
      } else if (e.key === "/" && !escribiendo) {
        e.preventDefault();
        setAbierto(true);
      }
    };
    document.addEventListener("keydown", atajo);
    return () => document.removeEventListener("keydown", atajo);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Buscar una sección"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-slate-700 hover:bg-slate-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden text-sm text-slate-500 xl:inline">Buscar</span>
      </button>
      {abierto && <VentanaBuscador secciones={secciones} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

export function VentanaBuscador({
  secciones,
  onCerrar,
  alElegir,
}: {
  secciones: SeccionMenu[];
  onCerrar: () => void;
  /** Además de cerrar, al entrar a una sección (en la hamburguesa: cerrar también el menú). */
  alElegir?: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscarSecciones(secciones, texto), [secciones, texto]);

  useEffect(() => entrada.current?.focus(), []);

  const ir = (href: string) => {
    onCerrar();
    alElegir?.();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-3 pt-16 sm:pt-24" onClick={onCerrar}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Buscar una sección">
        <div className="flex items-center gap-2 border-b border-slate-200 px-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0 text-slate-400" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={entrada}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setElegido(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCerrar();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setElegido((i) => Math.min(i + 1, resultados.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setElegido((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && resultados[elegido]) ir(resultados[elegido].href);
            }}
            placeholder="¿A qué sección quieres ir? Ej.: desprendible, cotización…"
            aria-label="Buscar una sección"
            className="min-h-12 flex-1 bg-transparent text-base outline-none"
          />
          <button type="button" onClick={onCerrar} className="min-h-11 shrink-0 px-2 text-sm text-slate-500">
            Cerrar
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {!texto.trim() ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              Escribe el nombre de una sección o algo que hay en ella. Solo aparecen las secciones que tienes habilitadas.
            </p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              Ninguna de tus secciones coincide con “{texto.trim()}”. Puede que esa sección no esté habilitada para tu usuario.
            </p>
          ) : (
            <ul>
              {resultados.map((r, i) => (
                <li key={r.href}>
                  <button
                    type="button"
                    onClick={() => ir(r.href)}
                    onMouseEnter={() => setElegido(i)}
                    className={`flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left ${i === elegido ? "bg-slate-100" : ""}`}
                  >
                    <span className="text-base font-medium text-slate-900">{r.nombre}</span>
                    {r.donde && <span className="text-xs text-slate-500">en {r.donde}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="hidden border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400 lg:block">↑ ↓ para moverte · Enter para entrar · Esc para cerrar · Ctrl+K o / para abrir</p>
      </div>
    </div>
  );
}

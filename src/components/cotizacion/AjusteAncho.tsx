"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Encoge el documento (ancho fijo de carta, 816px) para que entre completo en el ancho
 * disponible: en la tablet vertical Jhojan lo muestra al cliente sin desplazarse de
 * lado. Nunca agranda (máximo 1). Al imprimir se anula (ver globals.css) para que el
 * PDF salga a tamaño real. Se usa `zoom` y no `transform` porque así el alto también
 * se recalcula y no queda espacio en blanco debajo.
 */
export function AjusteAncho({
  children,
  ancho = 816,
}: {
  children: React.ReactNode;
  ancho?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Medida inmediata al montar, sin esperar al primer aviso del ResizeObserver.
    setZoom(Math.min(1, el.getBoundingClientRect().width / ancho));
    const obs = new ResizeObserver(([entrada]) => {
      setZoom(Math.min(1, entrada.contentRect.width / ancho));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ancho]);

  return (
    // contain: inline-size — sin esto, los contenedores flex de la app toman como
    // ancho mínimo los 816px del documento y nunca hay nada que encoger.
    <div ref={ref} className="ajuste-ancho w-full [contain:inline-size]">
      {/* Oculto hasta medir, para que no se vea un salto de tamaño al cargar. */}
      <div style={{ zoom: zoom ?? 1, visibility: zoom === null ? "hidden" : undefined }}>
        {children}
      </div>
    </div>
  );
}

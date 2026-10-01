"use client";

/**
 * Selector de archivo que funciona en celulares Android: un <input type="file"> sin
 * estilo puede pintarse como texto plano ("Seleccionar archivo Sin archivos
 * seleccionados") sin botón visible, y no hay dónde tocar. Acá el input nativo queda
 * oculto para la vista pero accesible (sr-only, no display:none) dentro de un <label>
 * con forma de botón grande (≥ 44 px de alto), y debajo se ve el archivo elegido.
 */
export function SelectorArchivo({
  etiqueta,
  archivo,
  onElegir,
  deshabilitado,
}: {
  etiqueta: string;
  archivo: File | null;
  onElegir: (archivo: File | null) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div>
      <label
        className={`flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md bg-brand-red px-4 py-3 text-center text-sm font-semibold text-white active:opacity-90 ${
          deshabilitado ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {etiqueta}
        <input
          type="file"
          className="sr-only"
          disabled={deshabilitado}
          onChange={(e) => {
            onElegir(e.target.files?.[0] ?? null);
            // Permite volver a elegir el mismo archivo si se corrige y se reintenta.
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-1 truncate text-xs text-slate-600">
        {archivo ? `Archivo: ${archivo.name}` : "Ningún archivo seleccionado"}
      </p>
    </div>
  );
}

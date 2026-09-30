"use client";

import { useState } from "react";
import type { ValorAgregadoCatalogo } from "@/lib/supabase/condicionesComerciales";
import { crearValorAgregado } from "@/app/(app)/comercial/cotizaciones/actions";

export interface ValorAgregadoUI {
  id: string;
  valorAgregadoId: string | null;
  titulo: string;
  texto: string;
}

/**
 * Valores agregados de la cotización, mismo patrón que pólizas: se marcan los del
 * catálogo que aplican a este cliente y el texto de cada marcado queda editable SOLO en
 * esta cotización (el catálogo no cambia). Los marcados salen en el documento.
 */
export function ValoresAgregadosSelector({
  catalogo,
  seleccionados,
  onCambiar,
  onCatalogoNuevo,
}: {
  catalogo: ValorAgregadoCatalogo[];
  seleccionados: ValorAgregadoUI[];
  onCambiar: (v: ValorAgregadoUI[]) => void;
  onCatalogoNuevo: (v: ValorAgregadoCatalogo) => void;
}) {
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [nuevoTexto, setNuevoTexto] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function alternar(va: ValorAgregadoCatalogo) {
    const ya = seleccionados.find((s) => s.valorAgregadoId === va.id);
    if (ya) onCambiar(seleccionados.filter((s) => s.valorAgregadoId !== va.id));
    else
      onCambiar([
        ...seleccionados,
        { id: crypto.randomUUID(), valorAgregadoId: va.id, titulo: va.titulo, texto: va.texto },
      ]);
  }

  function editar(id: string, cambios: Partial<ValorAgregadoUI>) {
    onCambiar(seleccionados.map((s) => (s.id === id ? { ...s, ...cambios } : s)));
  }

  async function agregarNuevo() {
    setError(null);
    setCreando(true);
    const res = await crearValorAgregado(nuevoTitulo, nuevoTexto);
    setCreando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCatalogoNuevo(res.valorAgregado);
    onCambiar([
      ...seleccionados,
      {
        id: crypto.randomUUID(),
        valorAgregadoId: res.valorAgregado.id,
        titulo: res.valorAgregado.titulo,
        texto: res.valorAgregado.texto,
      },
    ]);
    setNuevoTitulo("");
    setNuevoTexto("");
  }

  return (
    <div className="space-y-2 rounded-md bg-slate-100 p-3">
      <p className="text-xs text-slate-600">
        Marca los que aplican a este cliente. El texto se puede ajustar aquí y queda solo en
        esta cotización. Salen en el documento, en la hoja del resumen.
      </p>

      {catalogo.length === 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          No se pudo cargar el catálogo de valores agregados (¿falta correr la migración 30?).
        </p>
      )}

      <div className="space-y-2">
        {catalogo.map((va) => {
          const sel = seleccionados.find((s) => s.valorAgregadoId === va.id);
          return (
            <div key={va.id} className="rounded-md bg-white p-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input type="checkbox" checked={Boolean(sel)} onChange={() => alternar(va)} />
                {va.titulo}
              </label>
              {sel && (
                <div className="mt-2 space-y-1">
                  <input
                    value={sel.titulo}
                    onChange={(e) => editar(sel.id, { titulo: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    aria-label="Título del valor agregado"
                  />
                  <textarea
                    value={sel.texto}
                    onChange={(e) => editar(sel.id, { texto: e.target.value })}
                    rows={5}
                    className="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    aria-label="Texto del valor agregado"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <details className="rounded-md bg-white p-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          + Agregar un valor agregado nuevo al catálogo
        </summary>
        <div className="mt-2 space-y-1">
          {error && <p className="text-xs text-red-700">{error}</p>}
          <input
            value={nuevoTitulo}
            onChange={(e) => setNuevoTitulo(e.target.value)}
            placeholder="Título (ej. Capacitación al personal de seguridad)"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <textarea
            value={nuevoTexto}
            onChange={(e) => setNuevoTexto(e.target.value)}
            rows={4}
            placeholder="Texto que lee el cliente"
            className="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={agregarNuevo}
            disabled={creando || !nuevoTitulo.trim() || !nuevoTexto.trim()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            {creando ? "Agregando…" : "Agregar y marcar"}
          </button>
        </div>
      </details>
    </div>
  );
}

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
 * Bloques del documento (valores agregados, observaciones y los que se agreguen), mismo
 * patrón que las pólizas: se marcan los que aplican a este cliente, el título y el texto
 * de cada marcado se editan SOLO en esta cotización (el catálogo no cambia) y se ordenan.
 * En el documento, cada bloque marcado es una sección: el título es su encabezado. Lo
 * que va entre **dobles asteriscos** sale en rojo.
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

  function mover(id: string, delta: -1 | 1) {
    const i = seleccionados.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= seleccionados.length) return;
    const sig = [...seleccionados];
    [sig[i], sig[j]] = [sig[j], sig[i]];
    onCambiar(sig);
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

  // Bloques del catálogo que todavía no se marcaron (los marcados se ven abajo, en orden).
  const sinMarcar = catalogo.filter((va) => !seleccionados.some((s) => s.valorAgregadoId === va.id));

  return (
    <div className="space-y-3 rounded-md bg-slate-100 p-3">
      <p className="text-xs text-slate-600">
        Marca los bloques que van en esta cotización. Cada uno sale como una sección del
        documento (el título es su encabezado), en el orden de abajo. Puedes editarlos aquí
        sin cambiar el catálogo. Lo que escribas entre <code>**asteriscos dobles**</code> sale
        en rojo.
      </p>

      {catalogo.length === 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          No se pudo cargar el catálogo de bloques (¿falta correr la migración 30 o 34?).
        </p>
      )}

      {seleccionados.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">En la cotización ({seleccionados.length})</p>
          {seleccionados.map((sel, i) => (
            <div key={sel.id} className="rounded-md border border-slate-300 bg-white p-2">
              <div className="mb-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked
                  onChange={() => onCambiar(seleccionados.filter((s) => s.id !== sel.id))}
                  aria-label="Quitar de la cotización"
                />
                <span className="flex-1 truncate text-sm font-medium text-slate-800">
                  {sel.titulo.split("\n").join(" · ")}
                </span>
                <button
                  type="button"
                  onClick={() => mover(sel.id, -1)}
                  disabled={i === 0}
                  className="rounded border border-slate-300 px-2 text-sm disabled:opacity-30"
                  aria-label="Subir"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => mover(sel.id, 1)}
                  disabled={i === seleccionados.length - 1}
                  className="rounded border border-slate-300 px-2 text-sm disabled:opacity-30"
                  aria-label="Bajar"
                >
                  ↓
                </button>
              </div>
              <textarea
                value={sel.titulo}
                onChange={(e) => editar(sel.id, { titulo: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm font-semibold uppercase"
                aria-label="Título (encabezado de la sección)"
              />
              <textarea
                value={sel.texto}
                onChange={(e) => editar(sel.id, { texto: e.target.value })}
                rows={5}
                className="mt-1 w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                aria-label="Texto del bloque"
              />
            </div>
          ))}
        </div>
      )}

      {sinMarcar.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-700">Disponibles</p>
          {sinMarcar.map((va) => (
            <label key={va.id} className="flex items-center gap-2 rounded-md bg-white p-2 text-sm text-slate-800">
              <input type="checkbox" checked={false} onChange={() => alternar(va)} />
              {va.titulo.split("\n").join(" · ")}
            </label>
          ))}
        </div>
      )}

      <details className="rounded-md bg-white p-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          + Agregar un bloque nuevo al catálogo
        </summary>
        <div className="mt-2 space-y-1">
          {error && <p className="text-xs text-red-700">{error}</p>}
          <input
            value={nuevoTitulo}
            onChange={(e) => setNuevoTitulo(e.target.value)}
            placeholder="Título / encabezado (ej. CAPACITACIÓN AL PERSONAL)"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <textarea
            value={nuevoTexto}
            onChange={(e) => setNuevoTexto(e.target.value)}
            rows={4}
            placeholder="Texto que lee el cliente (lo que va entre **asteriscos** sale en rojo)"
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

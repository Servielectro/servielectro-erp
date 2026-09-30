"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatCOP, type Categoria } from "@/lib/pricing";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import { guardarPreciosLote } from "../actions";

const CATEGORIAS: { key: Categoria | "TODAS"; label: string }[] = [
  { key: "TODAS", label: "Todas" },
  { key: "EQUIPO", label: "Equipos" },
  { key: "MATERIAL", label: "Materiales" },
  { key: "MANO_DE_OBRA", label: "Mano de obra" },
];

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "1.250.000", "$ 1250000", "1250000,50" → número (formato colombiano). */
function aNumero(texto: string): number | null {
  const limpio = texto.replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Digitación de precios con teclado mientras llegan las listas de proveedor: filtro
 * por categoría, "solo sin precio" y búsqueda; Enter salta al siguiente ítem; se guarda
 * todo junto con un botón, y cada ítem guardado queda marcado en la tabla.
 */
export function CargaPrecios({ catalogo }: { catalogo: CatalogoItem[] }) {
  const [items, setItems] = useState(catalogo);
  const [categoria, setCategoria] = useState<Categoria | "TODAS">("TODAS");
  const [soloSinPrecio, setSoloSinPrecio] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [recienGuardados, setRecienGuardados] = useState<Set<string>>(new Set());
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Precios digitados y sin guardar: el navegador pregunta antes de salir de la página.
  const hayPendientes = Object.keys(valores).length > 0;
  useEffect(() => {
    if (!hayPendientes) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayPendientes]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return items.filter(
      (i) =>
        (categoria === "TODAS" || i.categoria === categoria) &&
        // Un ítem al que se le está digitando precio no desaparece de la lista mientras tanto.
        (!soloSinPrecio || i.valorCompraIva === null || valores[i.id] !== undefined || recienGuardados.has(i.id)) &&
        (!q ||
          normalizar(i.nombreCorto).includes(q) ||
          normalizar(i.codigo).includes(q) ||
          (i.referencia && normalizar(i.referencia).includes(q))),
    );
  }, [items, categoria, soloSinPrecio, busqueda, valores, recienGuardados]);

  const conteoSinPrecio = useMemo(() => {
    const base = items.filter((i) => categoria === "TODAS" || i.categoria === categoria);
    return { sin: base.filter((i) => i.valorCompraIva === null).length, total: base.length };
  }, [items, categoria]);

  const pendientes = Object.entries(valores)
    .map(([itemId, texto]) => ({ itemId, valor: aNumero(texto) }))
    .filter((p) => p.valor !== null);
  const invalidos = pendientes.filter((p) => Number.isNaN(p.valor) || (p.valor as number) <= 0);
  const listos = pendientes.filter((p) => !Number.isNaN(p.valor) && (p.valor as number) > 0) as {
    itemId: string;
    valor: number;
  }[];

  function siguiente(id: string) {
    const idx = visibles.findIndex((i) => i.id === id);
    const prox = visibles[idx + 1];
    if (prox) {
      inputs.current[prox.id]?.focus();
      inputs.current[prox.id]?.select();
    }
  }

  function guardar() {
    if (invalidos.length > 0) {
      setMensaje({ tipo: "error", texto: `Hay ${invalidos.length} precio(s) que no son un número mayor a 0. Corrígelos o bórralos.` });
      return;
    }
    if (listos.length === 0) return;
    setMensaje(null);
    startTransition(async () => {
      const res = await guardarPreciosLote(listos);
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: `No se guardó nada: ${res.error}` });
        return;
      }
      const hoy = new Date().toISOString().slice(0, 10);
      const porId = new Map(listos.map((p) => [p.itemId, p.valor]));
      setItems((prev) =>
        prev.map((i) => (porId.has(i.id) ? { ...i, valorCompraIva: porId.get(i.id)!, precioActualizadoEn: hoy } : i)),
      );
      setRecienGuardados((prev) => new Set([...prev, ...porId.keys()]));
      setValores({});
      setMensaje({
        tipo: "ok",
        texto: `✓ ${res.guardados} ${res.guardados === 1 ? "precio guardado" : "precios guardados"} en el catálogo. Ya salen en el cotizador.`,
      });
    });
  }

  return (
    <div className="pb-24">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {CATEGORIAS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategoria(c.key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              categoria === c.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {c.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={soloSinPrecio}
            onChange={(e) => setSoloSinPrecio(e.target.checked)}
            className="h-4 w-4"
          />
          Solo sin precio
        </label>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, código o referencia (ej. CERCA, CCTV)"
        className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <p className="mb-3 text-xs text-slate-500">
        {conteoSinPrecio.sin} de {conteoSinPrecio.total} ítems sin precio en esta categoría · mostrando{" "}
        {visibles.length}
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="p-2 text-left font-medium">Ítem</th>
              <th className="hidden p-2 text-left font-medium sm:table-cell">Unidad</th>
              <th className="p-2 text-right font-medium">Precio actual</th>
              <th className="w-40 p-2 text-right font-medium">Nuevo precio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((i) => {
              const texto = valores[i.id] ?? "";
              const n = texto ? aNumero(texto) : null;
              const malo = n !== null && (Number.isNaN(n) || n <= 0);
              return (
                <tr key={i.id} className={recienGuardados.has(i.id) ? "bg-green-50" : undefined}>
                  <td className="p-2">
                    <p className="font-medium text-slate-900">{i.nombreCorto}</p>
                    <p className="text-xs text-slate-500">
                      {i.codigo}
                      {i.referencia ? ` · ${i.referencia}` : ""}
                      <span className="sm:hidden"> · {i.unidad}</span>
                    </p>
                  </td>
                  <td className="hidden p-2 text-xs text-slate-600 sm:table-cell">{i.unidad}</td>
                  <td className="p-2 text-right text-xs">
                    {i.valorCompraIva === null ? (
                      <span className="text-amber-700">sin precio</span>
                    ) : (
                      <>
                        <span className="text-slate-800">{formatCOP(i.valorCompraIva)}</span>
                        {recienGuardados.has(i.id) && <span className="block text-green-700">guardado ✓</span>}
                        {!recienGuardados.has(i.id) && i.precioActualizadoEn && (
                          <span className="block text-slate-400">{i.precioActualizadoEn}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="p-2">
                    <input
                      ref={(el) => {
                        inputs.current[i.id] = el;
                      }}
                      value={texto}
                      inputMode="decimal"
                      placeholder="$"
                      onChange={(e) =>
                        setValores((prev) => {
                          const sig = { ...prev };
                          if (e.target.value === "") delete sig[i.id];
                          else sig[i.id] = e.target.value;
                          return sig;
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          siguiente(i.id);
                        }
                      }}
                      className={`w-full rounded-md border px-2 py-1.5 text-right text-sm ${
                        malo ? "border-red-400 bg-red-50" : "border-slate-300"
                      }`}
                      aria-label={`Nuevo precio de ${i.nombreCorto}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            {soloSinPrecio ? "No quedan ítems sin precio con este filtro." : "Ningún ítem coincide."}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 p-3">
          <p className="flex-1 text-sm">
            {mensaje ? (
              <span className={mensaje.tipo === "ok" ? "text-green-700" : "text-red-700"}>{mensaje.texto}</span>
            ) : listos.length > 0 ? (
              <span className="text-slate-700">
                {listos.length} {listos.length === 1 ? "precio listo" : "precios listos"} para guardar
              </span>
            ) : (
              <span className="text-slate-500">Digita precios; Enter pasa al siguiente.</span>
            )}
          </p>
          <button
            type="button"
            disabled={pendiente || listos.length === 0}
            onClick={guardar}
            className="shrink-0 rounded-md bg-brand-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pendiente ? "Guardando…" : `Guardar${listos.length ? ` ${listos.length}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

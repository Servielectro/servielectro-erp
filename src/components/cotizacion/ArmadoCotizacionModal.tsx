"use client";

import { useState } from "react";
import { formatCOP, type Categoria, type LineaCotizacion } from "@/lib/pricing";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import { ItemCombobox } from "@/components/cotizacion/ItemCombobox";

const CATEGORIAS: { key: Categoria; label: string }[] = [
  { key: "EQUIPO", label: "Equipos" },
  { key: "MATERIAL", label: "Materiales" },
  { key: "MANO_DE_OBRA", label: "Mano de obra" },
];

const RENTABILIDADES_SUGERIDAS = [0.8, 0.85, 0.88];

interface LineaCalculada extends LineaCotizacion {
  valorVentaUnitario: number;
  valorCalculoUnitario: number;
  subtotalCalculo: number;
}

export function ArmadoCotizacionModal({
  lineas,
  lineasCalculadas,
  catalogo,
  onActualizarLinea,
  onEliminarLinea,
  onSeleccionarItem,
  onAgregarLinea,
  onAbrirNuevoItem,
  onCerrar,
}: {
  lineas: LineaCotizacion[];
  lineasCalculadas: LineaCalculada[];
  catalogo: CatalogoItem[];
  onActualizarLinea: (id: string, cambios: Partial<LineaCotizacion>) => void;
  onEliminarLinea: (id: string) => void;
  onSeleccionarItem: (lineaId: string, item: CatalogoItem) => void;
  onAgregarLinea: (categoria: Categoria) => void;
  onAbrirNuevoItem: (categoria: Categoria, lineaId: string, busqueda: string) => void;
  onCerrar: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Categoria>("EQUIPO");

  const lineasTab = lineas.filter((l) => l.categoria === activeTab);
  const subtotalTab = lineasCalculadas
    .filter((l) => l.categoria === activeTab)
    .reduce((acc, l) => acc + l.subtotalCalculo, 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white p-3 sm:p-4">
        <h2 className="text-sm font-bold text-slate-900 sm:text-base">
          Armar cotización
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Listo
        </button>
      </header>

      <nav className="flex border-b border-slate-200 bg-white">
        {CATEGORIAS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActiveTab(c.key)}
            className={`flex-1 border-b-2 px-2 py-2.5 text-center text-xs font-medium sm:py-3 sm:text-sm ${
              activeTab === c.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-600"
            }`}
          >
            {c.label}
            <span className="ml-1 text-xs text-slate-600">
              ({lineas.filter((l) => l.categoria === c.key).length})
            </span>
          </button>
        ))}
      </nav>

      <main className="flex-1 space-y-3 overflow-y-auto p-3 pb-28 sm:p-4">
        {lineasTab.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-600">
            Sin líneas todavía en{" "}
            {CATEGORIAS.find((c) => c.key === activeTab)?.label}.
          </p>
        )}

        {lineasTab.map((linea) => {
          const calc = lineasCalculadas.find((l) => l.id === linea.id)!;
          const tieneItem = Boolean(linea.descripcion);

          return (
            <div
              key={linea.id}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              {!tieneItem ? (
                <ItemCombobox
                  catalogo={catalogo}
                  categoria={linea.categoria}
                  descripcionActual=""
                  onSeleccionar={(item) => onSeleccionarItem(linea.id, item)}
                  onCrearNuevo={(busqueda) =>
                    onAbrirNuevoItem(linea.categoria, linea.id, busqueda)
                  }
                />
              ) : (
                <>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 sm:text-base">
                      {linea.descripcion}
                    </p>
                    <button
                      type="button"
                      onClick={() => onEliminarLinea(linea.id)}
                      className="shrink-0 text-sm text-red-600"
                    >
                      Quitar
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <CampoNumero
                      label={`Cant. (${linea.unidad})`}
                      value={linea.cantidad}
                      onChange={(v) =>
                        onActualizarLinea(linea.id, { cantidad: v })
                      }
                    />
                    <CampoNumero
                      label="Precio compra"
                      value={linea.valorCompraUnitario}
                      onChange={(v) =>
                        onActualizarLinea(linea.id, {
                          valorCompraUnitario: v,
                        })
                      }
                    />
                    <div>
                      <label className="text-xs text-slate-600">
                        Rentab.
                      </label>
                      <select
                        value={linea.factorRentabilidadLinea}
                        onChange={(e) =>
                          onActualizarLinea(linea.id, {
                            factorRentabilidadLinea: Number(e.target.value),
                          })
                        }
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2.5 text-sm sm:text-base"
                      >
                        {[
                          ...new Set([
                            ...RENTABILIDADES_SUGERIDAS,
                            linea.factorRentabilidadLinea,
                          ]),
                        ]
                          .sort((a, b) => a - b)
                          .map((f) => (
                            <option key={f} value={f}>
                              {(f * 100).toFixed(0)}%
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-xs text-slate-600">
                      Venta {formatCOP(calc.valorVentaUnitario)} · Cálculo{" "}
                      {formatCOP(calc.valorCalculoUnitario)} c/u
                    </span>
                    <span className="text-sm font-semibold text-slate-900 sm:text-base">
                      {formatCOP(calc.subtotalCalculo)}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => onAgregarLinea(activeTab)}
          className="w-full rounded-lg border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-600 active:bg-slate-100 sm:text-base"
        >
          + Agregar línea de{" "}
          {CATEGORIAS.find((c) => c.key === activeTab)?.label.toLowerCase()}
        </button>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3 sm:p-4">
        <p className="text-right text-sm text-slate-600">
          Subtotal {CATEGORIAS.find((c) => c.key === activeTab)?.label}:{" "}
          <span className="font-semibold text-slate-800">
            {formatCOP(subtotalTab)}
          </span>
        </p>
      </footer>
    </div>
  );
}

function CampoNumero({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2.5 text-sm sm:text-base"
      />
    </div>
  );
}

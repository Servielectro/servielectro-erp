"use client";

import { useEffect, useState } from "react";
import {
  formatCOP,
  UNIDADES_SUGERIDAS,
  type Categoria,
  type LineaCotizacion,
} from "@/lib/pricing";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import { ItemCombobox } from "@/components/cotizacion/ItemCombobox";

const CATEGORIAS: { key: Categoria; label: string }[] = [
  { key: "EQUIPO", label: "Equipos" },
  { key: "MATERIAL", label: "Materiales" },
  { key: "MANO_DE_OBRA", label: "Mano de obra" },
];

const MARGEN_MIN = 0;
const MARGEN_MAX = 90;

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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between p-3 sm:p-4">
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
        </div>
      </header>

      <nav className="flex justify-center border-b border-slate-200 bg-white">
        <div className="flex w-full max-w-2xl">
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
        </div>
      </nav>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 overflow-y-auto p-3 pb-28 sm:p-4">
        {lineasTab.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-600">
            Sin líneas todavía en{" "}
            {CATEGORIAS.find((c) => c.key === activeTab)?.label}.
          </p>
        )}

        {lineasTab.map((linea) => {
          const calc = lineasCalculadas.find((l) => l.id === linea.id)!;
          const tieneItem = Boolean(linea.descripcion);
          const itemCatalogo = linea.itemCatalogoId
            ? catalogo.find((i) => i.id === linea.itemCatalogoId)
            : undefined;

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
                    <div>
                      <CampoNumero
                        label="Cantidad"
                        value={linea.cantidad}
                        onChange={(v) =>
                          onActualizarLinea(linea.id, { cantidad: v })
                        }
                      />
                      <input
                        value={linea.unidad}
                        onChange={(e) =>
                          onActualizarLinea(linea.id, { unidad: e.target.value.toUpperCase() })
                        }
                        list="unidades-cotizacion"
                        aria-label="Unidad"
                        className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                      />
                    </div>
                    <CampoNumero
                      label="Precio compra"
                      value={linea.valorCompraUnitario}
                      onChange={(v) =>
                        onActualizarLinea(linea.id, {
                          valorCompraUnitario: v,
                        })
                      }
                    />
                    <CampoMargen
                      factorRentabilidadLinea={linea.factorRentabilidadLinea}
                      onCambiarFactor={(f) =>
                        onActualizarLinea(linea.id, {
                          factorRentabilidadLinea: f,
                        })
                      }
                    />
                  </div>

                  <PrecioCatalogo
                    linea={linea}
                    precioCatalogo={itemCatalogo ? itemCatalogo.valorCompraIva : undefined}
                    onCambiar={(guardar) =>
                      onActualizarLinea(linea.id, { guardarPrecioCatalogo: guardar })
                    }
                  />

                  <DescripcionCliente
                    texto={linea.descripcionLarga ?? ""}
                    nombreCorto={linea.descripcion}
                    onCambiar={(t) =>
                      onActualizarLinea(linea.id, { descripcionLarga: t || null })
                    }
                  />

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

      <datalist id="unidades-cotizacion">
        {UNIDADES_SUGERIDAS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
        <p className="mx-auto w-full max-w-2xl p-3 text-right text-sm text-slate-600 sm:p-4">
          Subtotal {CATEGORIAS.find((c) => c.key === activeTab)?.label}:{" "}
          <span className="font-semibold text-slate-800">
            {formatCOP(subtotalTab)}
          </span>
        </p>
      </footer>
    </div>
  );
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function factorAMargen(factor: number): number {
  return Math.round((1 - factor) * 1000) / 10; // 1 decimal
}

/**
 * Muestra y edita el MARGEN (0-90%), no el factor que se guarda en base
 * (factorRentabilidadLinea = 1 - margen). Jhojan detectó que mostrar el factor
 * directamente como "85%" confunde con una rentabilidad del 85%, cuando en
 * realidad esa cifra es un factor de 0.85 → margen real del 15%.
 */
function CampoMargen({
  factorRentabilidadLinea,
  onCambiarFactor,
}: {
  factorRentabilidadLinea: number;
  onCambiarFactor: (factor: number) => void;
}) {
  const margenActual = factorAMargen(factorRentabilidadLinea);
  const [texto, setTexto] = useState(String(margenActual));

  useEffect(() => {
    setTexto(String(margenActual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factorRentabilidadLinea]);

  function commit(valorTexto: string) {
    const n = Number(valorTexto);
    if (Number.isNaN(n)) {
      setTexto(String(margenActual));
      return;
    }
    const clamped = Math.min(MARGEN_MAX, Math.max(MARGEN_MIN, n));
    setTexto(String(clamped));
    onCambiarFactor(round4(1 - clamped / 100));
  }

  function step(delta: number) {
    commit(String(margenActual + delta));
  }

  return (
    <div>
      <label className="text-xs text-slate-600">Margen</label>
      <div className="mt-0.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => step(-1)}
          className="h-full shrink-0 rounded-md border border-slate-300 px-2 py-2.5 text-sm text-slate-700"
        >
          −
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            type="number"
            inputMode="decimal"
            min={MARGEN_MIN}
            max={MARGEN_MAX}
            value={texto}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const v = e.target.value;
              setTexto(v);
              const n = Number(v);
              if (v !== "" && !Number.isNaN(n) && n >= MARGEN_MIN && n <= MARGEN_MAX) {
                onCambiarFactor(round4(1 - n / 100));
              }
            }}
            onBlur={(e) => commit(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-2.5 pr-5 text-sm sm:text-base"
          />
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            %
          </span>
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          className="h-full shrink-0 rounded-md border border-slate-300 px-2 py-2.5 text-sm text-slate-700"
        >
          +
        </button>
      </div>
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

/**
 * Estado del precio de la línea frente al catálogo:
 * - precio en 0: aviso rojo (no se podrá imprimir ni enviar).
 * - ítem sin precio en catálogo, o con precio distinto al escrito: casilla para llevar
 *   este precio al catálogo al guardar la cotización (marcada por defecto si el ítem
 *   venía sin precio), con texto explícito de qué va a pasar.
 */
function PrecioCatalogo({
  linea,
  precioCatalogo,
  onCambiar,
}: {
  linea: LineaCotizacion;
  precioCatalogo: number | null | undefined; // undefined = línea sin ítem de catálogo
  onCambiar: (guardar: boolean) => void;
}) {
  const precio = linea.valorCompraUnitario;
  const sinPrecioCatalogo = precioCatalogo === null;
  const distinto = precioCatalogo !== undefined && precioCatalogo !== null && precio > 0 && precio !== precioCatalogo;
  const puedeGuardar = precioCatalogo !== undefined && precio > 0 && (sinPrecioCatalogo || distinto);

  return (
    <div className="mt-2 space-y-1">
      {!(precio > 0) && (
        <p className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
          ⚠ {sinPrecioCatalogo ? "Sin precio en catálogo" : "Precio en $0"}: escribe el precio de compra.
        </p>
      )}
      {precio > 0 && sinPrecioCatalogo && !linea.guardarPrecioCatalogo && (
        <p className="text-xs text-amber-700">Este ítem no tiene precio en el catálogo.</p>
      )}
      {puedeGuardar && (
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(linea.guardarPrecioCatalogo)}
            onChange={(e) => onCambiar(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Guardar este precio en el catálogo
            {distinto && precioCatalogo ? ` (hoy tiene ${formatCOP(precioCatalogo)})` : ""}
            {linea.guardarPrecioCatalogo && (
              <span className="block text-blue-700">
                Se guarda al guardar la cotización, con fecha y usuario.
              </span>
            )}
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * Lo que lee el cliente en la columna «Descripción» del documento. Arranca con el texto
 * del catálogo y se puede ajustar por proyecto (ej. mano de obra: "Instalación de
 * sistema de CCTV. Incluye: …"). El cambio queda solo en esta cotización.
 */
function DescripcionCliente({
  texto,
  nombreCorto,
  onCambiar,
}: {
  texto: string;
  nombreCorto: string;
  onCambiar: (t: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="text-left text-xs text-slate-600"
      >
        {abierta ? "▾" : "▸"} Descripción para el cliente
        {!abierta && (
          <span className="ml-1 text-slate-400">
            — {(texto || nombreCorto).slice(0, 60)}
            {(texto || nombreCorto).length > 60 ? "…" : ""}
          </span>
        )}
      </button>
      {abierta && (
        <textarea
          value={texto}
          onChange={(e) => onCambiar(e.target.value)}
          rows={4}
          placeholder={`Si se deja vacía, sale "${nombreCorto}".`}
          className="mt-1 w-full resize-y rounded-md border border-slate-300 px-2 py-2 text-sm"
        />
      )}
    </div>
  );
}

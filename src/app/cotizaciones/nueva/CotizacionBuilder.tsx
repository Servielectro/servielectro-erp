"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CONFIG_PRECIO_DEFAULT,
  FACTORES_RENTABILIDAD_DEFAULT,
  calcularTotales,
  formatCOP,
  type Categoria,
  type ConfigPrecio,
  type EsquemaIva,
  type LineaCotizacion,
} from "@/lib/pricing";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import { ItemCombobox } from "@/components/cotizacion/ItemCombobox";
import { NuevoItemModal } from "@/components/cotizacion/NuevoItemModal";
import { guardarCotizacion } from "@/app/cotizaciones/actions";

const CATEGORIAS: { key: Categoria; label: string }[] = [
  { key: "EQUIPO", label: "Equipos" },
  { key: "MATERIAL", label: "Materiales" },
  { key: "MANO_DE_OBRA", label: "Mano de obra" },
];

const RENTABILIDADES_SUGERIDAS = [0.8, 0.85, 0.88];

const DRAFT_KEY = "se-erp:cotizacion-draft:v1";

type LineaUI = LineaCotizacion;

interface Draft {
  clienteNombre: string;
  descripcion: string;
  config: ConfigPrecio;
  lineas: LineaUI[];
  guardadoEn: string;
}

function nuevaLinea(categoria: Categoria): LineaUI {
  return {
    id: crypto.randomUUID(),
    categoria,
    itemCatalogoId: null,
    descripcion: "",
    unidad: "UNI",
    cantidad: 1,
    valorCompraUnitario: 0,
    factorRentabilidadLinea: FACTORES_RENTABILIDAD_DEFAULT[categoria],
  };
}

export function CotizacionBuilder({
  catalogoInicial,
}: {
  catalogoInicial: CatalogoItem[];
}) {
  const [catalogo, setCatalogo] = useState(catalogoInicial);
  const [clienteNombre, setClienteNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [esquemaIva, setEsquemaIva] = useState<EsquemaIva>("IVA_FULL");
  const [config, setConfig] = useState<ConfigPrecio>(CONFIG_PRECIO_DEFAULT);
  const [lineas, setLineas] = useState<LineaUI[]>([]);
  const [activeTab, setActiveTab] = useState<Categoria>("EQUIPO");
  const [avanzadoAbierto, setAvanzadoAbierto] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [modal, setModal] = useState<{
    categoria: Categoria;
    lineaId: string;
    busquedaInicial: string;
  } | null>(null);
  const [restaurado, setRestaurado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState<{ codigo: string } | null>(
    null,
  );

  // Restaurar borrador local (conexión inestable en obra: nunca se pierde el trabajo).
  // Lectura única de localStorage al montar — es sincronización con un sistema externo,
  // no hay forma de derivarlo sin efecto (localStorage no existe durante el render en el servidor).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      if (draft.lineas?.length) {
        setClienteNombre(draft.clienteNombre ?? "");
        setDescripcion(draft.descripcion ?? "");
        setConfig(draft.config ?? CONFIG_PRECIO_DEFAULT);
        setEsquemaIva(draft.config?.esquemaIva ?? "IVA_FULL");
        setLineas(draft.lineas);
        setRestaurado(true);
      }
    } catch {
      // borrador corrupto o localStorage no disponible: se ignora
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const configConEsquema = useMemo(
    () => ({ ...config, esquemaIva }),
    [config, esquemaIva],
  );

  // Autoguardado local en cada cambio
  useEffect(() => {
    if (lineas.length === 0) return;
    try {
      const draft: Draft = {
        clienteNombre,
        descripcion,
        config: configConEsquema,
        lineas,
        guardadoEn: new Date().toISOString(),
      };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // localStorage lleno o no disponible: no es crítico, se sigue trabajando en memoria
    }
  }, [clienteNombre, descripcion, configConEsquema, lineas]);

  const totales = useMemo(
    () => calcularTotales(lineas, configConEsquema),
    [lineas, configConEsquema],
  );

  function actualizarLinea(id: string, cambios: Partial<LineaUI>) {
    setLineas((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)),
    );
  }

  function eliminarLinea(id: string) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  function seleccionarItem(lineaId: string, item: CatalogoItem) {
    actualizarLinea(lineaId, {
      itemCatalogoId: item.id,
      descripcion: item.descripcion,
      unidad: item.unidad,
      valorCompraUnitario: item.valorCompraIva ?? 0,
      factorRentabilidadLinea: item.factorRentabilidadLinea,
    });
  }

  function empezarDeCero() {
    if (
      !window.confirm(
        "¿Borrar el borrador actual y empezar una cotización nueva?",
      )
    )
      return;
    setClienteNombre("");
    setDescripcion("");
    setConfig(CONFIG_PRECIO_DEFAULT);
    setEsquemaIva("IVA_FULL");
    setLineas([]);
    setGuardadoOk(null);
    setError(null);
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  async function onGuardar() {
    setError(null);

    if (!clienteNombre.trim()) {
      setError("Falta el nombre del cliente");
      return;
    }
    if (lineas.length === 0) {
      setError("Agrega al menos una línea");
      return;
    }
    const sinItem = lineas.find((l) => !l.descripcion.trim());
    if (sinItem) {
      setError(
        `Hay una línea de ${sinItem.categoria.replace("_", " ")} sin ítem seleccionado`,
      );
      return;
    }

    setGuardando(true);
    const res = await guardarCotizacion({
      clienteNombre: clienteNombre.trim(),
      descripcion: descripcion.trim() || clienteNombre.trim(),
      esquemaIva,
      factorRecargoProyecto: config.factorRecargoProyecto,
      pctAdmin: config.pctAdmin,
      pctImprevistos: config.pctImprevistos,
      pctUtilidadAiu: config.pctUtilidadAiu,
      ivaPct: config.ivaPct,
      lineas: lineas.map((l) => ({
        categoria: l.categoria,
        itemCatalogoId: l.itemCatalogoId,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantidad,
        valorCompraUnitario: l.valorCompraUnitario,
        factorRentabilidadLinea: l.factorRentabilidadLinea,
      })),
    });
    setGuardando(false);

    if (!res.ok) {
      setError(
        `No se pudo guardar (${res.error}). El borrador sigue disponible en este dispositivo — reintenta cuando tengas señal.`,
      );
      return;
    }

    setGuardadoOk({ codigo: res.codigo });
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  const lineasTab = lineas.filter((l) => l.categoria === activeTab);
  const subtotalTab = totales.lineas
    .filter((l) => l.categoria === activeTab)
    .reduce((acc, l) => acc + l.subtotalCalculo, 0);

  if (guardadoOk) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <p className="text-lg font-semibold text-green-800">
            Cotización {guardadoOk.codigo} guardada
          </p>
          <p className="mt-1 text-sm text-green-700">
            Total: {formatCOP(totales.total)}
          </p>
        </div>
        <button
          type="button"
          onClick={empezarDeCero}
          className="rounded-md bg-slate-900 px-5 py-3 text-base font-medium text-white"
        >
          Nueva cotización
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-48">
      <header className="sticky top-0 z-10 space-y-3 border-b border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setEsquemaIva("IVA_FULL")}
            className={`rounded-lg border-2 px-3 py-4 text-center text-base font-semibold ${
              esquemaIva === "IVA_FULL"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            IVA FULL
          </button>
          <button
            type="button"
            onClick={() => setEsquemaIva("IVA_AIU")}
            className={`rounded-lg border-2 px-3 py-4 text-center text-base font-semibold ${
              esquemaIva === "IVA_AIU"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            IVA AIU
          </button>
        </div>

        {restaurado && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Se restauró tu borrador guardado en este dispositivo.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <input
            value={clienteNombre}
            onChange={(e) => setClienteNombre(e.target.value)}
            placeholder="Cliente *"
            className="rounded-md border border-slate-300 px-3 py-2.5 text-base"
          />
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Nombre de la obra"
            className="rounded-md border border-slate-300 px-3 py-2.5 text-base"
          />
        </div>

        <button
          type="button"
          onClick={() => setAvanzadoAbierto((v) => !v)}
          className="text-sm font-medium text-slate-500"
        >
          {avanzadoAbierto ? "▾" : "▸"} Configuración avanzada (AIU / recargo)
        </button>

        {avanzadoAbierto && (
          <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-3 text-sm">
            <CampoPct
              label="Recargo proyecto (factor)"
              value={config.factorRecargoProyecto}
              onChange={(v) =>
                setConfig((c) => ({ ...c, factorRecargoProyecto: v }))
              }
              step={0.0001}
            />
            <CampoPct
              label="IVA %"
              value={config.ivaPct}
              onChange={(v) => setConfig((c) => ({ ...c, ivaPct: v }))}
            />
            <CampoPct
              label="Admin %"
              value={config.pctAdmin}
              onChange={(v) => setConfig((c) => ({ ...c, pctAdmin: v }))}
            />
            <CampoPct
              label="Imprevistos %"
              value={config.pctImprevistos}
              onChange={(v) =>
                setConfig((c) => ({ ...c, pctImprevistos: v }))
              }
            />
            <CampoPct
              label="Utilidad AIU %"
              value={config.pctUtilidadAiu}
              onChange={(v) =>
                setConfig((c) => ({ ...c, pctUtilidadAiu: v }))
              }
            />
          </div>
        )}
      </header>

      <nav className="flex border-b border-slate-200 bg-white">
        {CATEGORIAS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActiveTab(c.key)}
            className={`flex-1 border-b-2 px-2 py-3 text-center text-sm font-medium ${
              activeTab === c.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400"
            }`}
          >
            {c.label}
            <span className="ml-1 text-xs text-slate-400">
              ({lineas.filter((l) => l.categoria === c.key).length})
            </span>
          </button>
        ))}
      </nav>

      <main className="flex-1 space-y-3 p-4">
        {lineasTab.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            Sin líneas todavía en{" "}
            {CATEGORIAS.find((c) => c.key === activeTab)?.label}.
          </p>
        )}

        {lineasTab.map((linea) => {
          const calc = totales.lineas.find((l) => l.id === linea.id)!;
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
                  onSeleccionar={(item) => seleccionarItem(linea.id, item)}
                  onCrearNuevo={(busqueda) =>
                    setModal({
                      categoria: linea.categoria,
                      lineaId: linea.id,
                      busquedaInicial: busqueda,
                    })
                  }
                />
              ) : (
                <>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-base font-medium text-slate-900">
                      {linea.descripcion}
                    </p>
                    <button
                      type="button"
                      onClick={() => eliminarLinea(linea.id)}
                      className="shrink-0 text-sm text-red-600"
                    >
                      Quitar
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <CampoNumero
                      label={`Cantidad (${linea.unidad})`}
                      value={linea.cantidad}
                      onChange={(v) =>
                        actualizarLinea(linea.id, { cantidad: v })
                      }
                    />
                    <CampoNumero
                      label="Precio compra"
                      value={linea.valorCompraUnitario}
                      onChange={(v) =>
                        actualizarLinea(linea.id, { valorCompraUnitario: v })
                      }
                    />
                    <div>
                      <label className="text-xs text-slate-500">
                        Rentabilidad
                      </label>
                      <select
                        value={linea.factorRentabilidadLinea}
                        onChange={(e) =>
                          actualizarLinea(linea.id, {
                            factorRentabilidadLinea: Number(e.target.value),
                          })
                        }
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2.5 text-base"
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
                    <span className="text-xs text-slate-400">
                      Venta {formatCOP(calc.valorVentaUnitario)} · Cálculo{" "}
                      {formatCOP(calc.valorCalculoUnitario)} c/u
                    </span>
                    <span className="text-base font-semibold text-slate-900">
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
          onClick={() => setLineas((prev) => [...prev, nuevaLinea(activeTab)])}
          className="w-full rounded-lg border-2 border-dashed border-slate-300 py-4 text-base font-medium text-slate-500 active:bg-slate-100"
        >
          + Agregar línea de{" "}
          {CATEGORIAS.find((c) => c.key === activeTab)?.label.toLowerCase()}
        </button>

        <p className="text-right text-sm text-slate-500">
          Subtotal {CATEGORIAS.find((c) => c.key === activeTab)?.label}:{" "}
          <span className="font-semibold text-slate-800">
            {formatCOP(subtotalTab)}
          </span>
        </p>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        {detalleAbierto && (
          <div className="space-y-1 border-b border-slate-100 p-4 text-sm">
            <FilaTotal label="Subtotal compra" valor={totales.subtotalCompra} />
            <FilaTotal label="Subtotal venta" valor={totales.subtotalVenta} />
            <FilaTotal
              label="Subtotal cálculo (cliente)"
              valor={totales.subtotalCalculo}
            />
            <FilaTotal label="Administración" valor={totales.valorAdmin} />
            <FilaTotal label="Imprevistos" valor={totales.valorImprevistos} />
            <FilaTotal
              label="Utilidad (AIU)"
              valor={totales.valorUtilidadAiu}
            />
            <FilaTotal
              label="Subtotal general"
              valor={totales.subtotalGeneral}
              destacado
            />
            <p className="pt-1 text-xs text-slate-400">
              Base IVA: {totales.ivaBaseMotivo}
            </p>
          </div>
        )}

        {error && (
          <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex items-center gap-3 p-4">
          <button
            type="button"
            onClick={() => setDetalleAbierto((v) => !v)}
            className="flex-1 text-left"
          >
            <span className="block text-xs text-slate-400">
              IVA {formatCOP(totales.valorIva)} · toca para ver detalle{" "}
              {detalleAbierto ? "▾" : "▸"}
            </span>
            <span className="block text-xl font-bold text-slate-900">
              {formatCOP(totales.total)}
            </span>
          </button>
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando}
            className="shrink-0 rounded-lg bg-slate-900 px-6 py-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </footer>

      {modal && (
        <NuevoItemModal
          categoria={modal.categoria}
          descripcionInicial={modal.busquedaInicial}
          onCerrar={() => setModal(null)}
          onCreado={(item) => {
            setCatalogo((prev) => [...prev, item]);
            seleccionarItem(modal.lineaId, item);
            setModal(null);
          }}
        />
      )}
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
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2.5 text-base"
      />
    </div>
  );
}

function CampoPct({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="number"
        step={step}
        inputMode="decimal"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
      />
    </div>
  );
}

function FilaTotal({
  label,
  valor,
  destacado,
}: {
  label: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${destacado ? "font-semibold text-slate-900" : "text-slate-600"}`}
    >
      <span>{label}</span>
      <span>{formatCOP(valor)}</span>
    </div>
  );
}

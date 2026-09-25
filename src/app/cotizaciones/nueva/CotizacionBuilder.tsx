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
import type {
  ConfiguracionEmpresa,
  PolizaCatalogo,
} from "@/lib/supabase/condicionesComerciales";
import { ItemCombobox } from "@/components/cotizacion/ItemCombobox";
import { NuevoItemModal } from "@/components/cotizacion/NuevoItemModal";
import { RutUploader } from "@/components/cotizacion/RutUploader";
import { FormatoCotizacion } from "@/components/cotizacion/FormatoCotizacion";
import { guardarCotizacion, crearPoliza } from "@/app/cotizaciones/actions";

const CATEGORIAS: { key: Categoria; label: string }[] = [
  { key: "EQUIPO", label: "Equipos" },
  { key: "MATERIAL", label: "Materiales" },
  { key: "MANO_DE_OBRA", label: "Mano de obra" },
];

const RENTABILIDADES_SUGERIDAS = [0.8, 0.85, 0.88];

const DRAFT_KEY = "se-erp:cotizacion-draft:v1";

type LineaUI = LineaCotizacion;

interface HitoUI {
  id: string;
  nombre: string;
  porcentaje: number; // 0-100 para la UI
}

interface PolizaSeleccionadaUI {
  id: string;
  polizaId: string | null;
  nombre: string;
}

const PLANTILLAS_PAGO: { label: string; hitos: Omit<HitoUI, "id">[] }[] = [
  {
    label: "Anticipo 50 / Final 50",
    hitos: [
      { nombre: "Anticipo", porcentaje: 50 },
      { nombre: "Pago final", porcentaje: 50 },
    ],
  },
  {
    label: "Anticipo 50 / Corte 20 / Corte 30",
    hitos: [
      { nombre: "Anticipo", porcentaje: 50 },
      { nombre: "Primer corte", porcentaje: 20 },
      { nombre: "Segundo corte", porcentaje: 30 },
    ],
  },
];

export interface DatosIniciales {
  clienteNombre: string;
  clienteNit: string;
  clienteDireccion: string;
  clienteEmail: string;
  clienteContacto: string;
  descripcion: string;
  comercial: string;
  esquemaIva: EsquemaIva;
  config: Omit<ConfigPrecio, "esquemaIva">;
  lineas: Omit<LineaUI, "id">[];
  hitos: Omit<HitoUI, "id">[];
  polizas: Omit<PolizaSeleccionadaUI, "id">[];
}

interface Draft {
  clienteNombre: string;
  clienteNit: string;
  clienteDireccion: string;
  clienteEmail: string;
  clienteContacto: string;
  descripcion: string;
  comercial: string;
  config: ConfigPrecio;
  lineas: LineaUI[];
  hitos: HitoUI[];
  polizas: PolizaSeleccionadaUI[];
  guardadoEn: string;
}

function nuevaLinea(categoria: Categoria): LineaUI {
  return {
    id: crypto.randomUUID(),
    categoria,
    itemCatalogoId: null,
    descripcion: "",
    descripcionLarga: null,
    unidad: "UNI",
    cantidad: 1,
    valorCompraUnitario: 0,
    factorRentabilidadLinea: FACTORES_RENTABILIDAD_DEFAULT[categoria],
  };
}

export function CotizacionBuilder({
  catalogoInicial,
  polizasCatalogoInicial,
  configuracionEmpresa,
  datosIniciales,
}: {
  catalogoInicial: CatalogoItem[];
  polizasCatalogoInicial: PolizaCatalogo[];
  configuracionEmpresa: ConfiguracionEmpresa | null;
  datosIniciales?: DatosIniciales;
}) {
  const [catalogo, setCatalogo] = useState(catalogoInicial);
  const [catalogoPolizas, setCatalogoPolizas] = useState(polizasCatalogoInicial);
  const [nuevaPolizaNombre, setNuevaPolizaNombre] = useState("");
  const [creandoPoliza, setCreandoPoliza] = useState(false);
  const [clienteNombre, setClienteNombre] = useState(
    datosIniciales?.clienteNombre ?? "",
  );
  // Se resuelve al confirmar un RUT (fn_buscar_o_crear_cliente ya devuelve un id real).
  // Si el nombre se edita después, se limpia — ya no se puede confiar en que siga
  // siendo el mismo cliente que resolvió el RUT.
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [rutModalAbierto, setRutModalAbierto] = useState(false);
  const [vistaPreviaAbierta, setVistaPreviaAbierta] = useState(false);
  const [clienteNit, setClienteNit] = useState(datosIniciales?.clienteNit ?? "");
  const [clienteDireccion, setClienteDireccion] = useState(
    datosIniciales?.clienteDireccion ?? "",
  );
  const [clienteEmail, setClienteEmail] = useState(
    datosIniciales?.clienteEmail ?? "",
  );
  const [clienteContacto, setClienteContacto] = useState(
    datosIniciales?.clienteContacto ?? "",
  );
  const [comercial, setComercial] = useState(datosIniciales?.comercial ?? "");
  const [descripcion, setDescripcion] = useState(
    datosIniciales?.descripcion ?? "",
  );
  const [esquemaIva, setEsquemaIva] = useState<EsquemaIva>(
    datosIniciales?.esquemaIva ?? "IVA_FULL",
  );
  const [config, setConfig] = useState<Omit<ConfigPrecio, "esquemaIva">>(
    datosIniciales?.config ?? CONFIG_PRECIO_DEFAULT,
  );
  const [lineas, setLineas] = useState<LineaUI[]>(
    () =>
      datosIniciales?.lineas.map((l) => ({ ...l, id: crypto.randomUUID() })) ??
      [],
  );
  const [hitos, setHitos] = useState<HitoUI[]>(
    () =>
      datosIniciales?.hitos.map((h) => ({ ...h, id: crypto.randomUUID() })) ??
      [],
  );
  const [polizasSeleccionadas, setPolizasSeleccionadas] = useState<
    PolizaSeleccionadaUI[]
  >(
    () =>
      datosIniciales?.polizas.map((p) => ({ ...p, id: crypto.randomUUID() })) ??
      [],
  );
  const [activeTab, setActiveTab] = useState<Categoria>("EQUIPO");
  const [avanzadoAbierto, setAvanzadoAbierto] = useState(false);
  const [pagosAbierto, setPagosAbierto] = useState(
    Boolean(datosIniciales?.hitos.length),
  );
  const [polizasAbierto, setPolizasAbierto] = useState(
    Boolean(datosIniciales?.polizas.length),
  );
  const [datosClienteAbierto, setDatosClienteAbierto] = useState(
    Boolean(
      datosIniciales?.comercial ||
        datosIniciales?.clienteNit ||
        datosIniciales?.clienteDireccion ||
        datosIniciales?.clienteEmail ||
        datosIniciales?.clienteContacto,
    ),
  );
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
    // Al duplicar una cotización existente, esa es la intención explícita del usuario:
    // no pisarla con un borrador local viejo que haya quedado guardado.
    if (datosIniciales) return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      if (draft.lineas?.length) {
        setClienteNombre(draft.clienteNombre ?? "");
        setClienteNit(draft.clienteNit ?? "");
        setClienteDireccion(draft.clienteDireccion ?? "");
        setClienteEmail(draft.clienteEmail ?? "");
        setClienteContacto(draft.clienteContacto ?? "");
        setComercial(draft.comercial ?? "");
        setDescripcion(draft.descripcion ?? "");
        setConfig(draft.config ?? CONFIG_PRECIO_DEFAULT);
        setEsquemaIva(draft.config?.esquemaIva ?? "IVA_FULL");
        setLineas(draft.lineas);
        setHitos(draft.hitos ?? []);
        setPolizasSeleccionadas(draft.polizas ?? []);
        setRestaurado(true);
      }
    } catch {
      // borrador corrupto o localStorage no disponible: se ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        clienteNit,
        clienteDireccion,
        clienteEmail,
        clienteContacto,
        comercial,
        descripcion,
        config: configConEsquema,
        lineas,
        hitos,
        polizas: polizasSeleccionadas,
        guardadoEn: new Date().toISOString(),
      };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // localStorage lleno o no disponible: no es crítico, se sigue trabajando en memoria
    }
  }, [
    clienteNombre,
    clienteNit,
    clienteDireccion,
    clienteEmail,
    clienteContacto,
    comercial,
    descripcion,
    configConEsquema,
    lineas,
    hitos,
    polizasSeleccionadas,
  ]);

  const totales = useMemo(
    () => calcularTotales(lineas, configConEsquema),
    [lineas, configConEsquema],
  );

  const sumaHitos = hitos.reduce((acc, h) => acc + h.porcentaje, 0);

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
      descripcion: item.nombreCorto,
      descripcionLarga: item.descripcion,
      unidad: item.unidad,
      valorCompraUnitario: item.valorCompraIva ?? 0,
      factorRentabilidadLinea: item.factorRentabilidadLinea,
    });
  }

  function aplicarPlantillaPago(hitosBase: Omit<HitoUI, "id">[]) {
    setHitos(hitosBase.map((h) => ({ ...h, id: crypto.randomUUID() })));
  }

  function actualizarHito(id: string, cambios: Partial<HitoUI>) {
    setHitos((prev) => prev.map((h) => (h.id === id ? { ...h, ...cambios } : h)));
  }

  function eliminarHito(id: string) {
    setHitos((prev) => prev.filter((h) => h.id !== id));
  }

  function alternarPoliza(poliza: PolizaCatalogo) {
    setPolizasSeleccionadas((prev) => {
      const yaEsta = prev.find((p) => p.polizaId === poliza.id);
      if (yaEsta) return prev.filter((p) => p.polizaId !== poliza.id);
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          polizaId: poliza.id,
          nombre: poliza.nombre,
        },
      ];
    });
  }

  async function agregarPolizaNueva() {
    const nombre = nuevaPolizaNombre.trim();
    if (!nombre) return;
    setCreandoPoliza(true);
    const res = await crearPoliza(nombre);
    setCreandoPoliza(false);
    if (!res.ok) {
      setError(`No se pudo agregar la póliza (${res.error})`);
      return;
    }
    const nueva: PolizaCatalogo = {
      id: res.poliza.id,
      nombre: res.poliza.nombre,
      descripcion: null,
      pctDefault: null,
      vigenciaMesesDefault: null,
    };
    setCatalogoPolizas((prev) => [...prev, nueva]);
    setPolizasSeleccionadas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        polizaId: nueva.id,
        nombre: nueva.nombre,
      },
    ]);
    setNuevaPolizaNombre("");
  }

  function empezarDeCero() {
    if (
      !window.confirm(
        "¿Borrar el borrador actual y empezar una cotización nueva?",
      )
    )
      return;
    setClienteNombre("");
    setClienteNit("");
    setClienteDireccion("");
    setClienteEmail("");
    setClienteContacto("");
    setComercial("");
    setDescripcion("");
    setConfig(CONFIG_PRECIO_DEFAULT);
    setEsquemaIva("IVA_FULL");
    setLineas([]);
    setHitos([]);
    setPolizasSeleccionadas([]);
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
    if (hitos.length > 0 && Math.round(sumaHitos) !== 100) {
      setError(
        `El esquema de pagos suma ${sumaHitos.toFixed(0)}%, tiene que sumar 100%`,
      );
      return;
    }

    setGuardando(true);
    // Si no se armó un esquema de pagos, se guarda como pago único (100%) por defecto.
    const hitosAGuardar =
      hitos.length > 0
        ? hitos.map((h) => ({ nombre: h.nombre, porcentaje: h.porcentaje / 100 }))
        : [{ nombre: "Pago único", porcentaje: 1 }];

    const res = await guardarCotizacion({
      clienteId,
      clienteNombre: clienteNombre.trim(),
      clienteNit: clienteNit.trim(),
      clienteDireccion: clienteDireccion.trim(),
      clienteEmail: clienteEmail.trim(),
      clienteContacto: clienteContacto.trim(),
      comercial: comercial.trim(),
      descripcion: descripcion.trim() || clienteNombre.trim(),
      esquemaIva,
      pctAdmin: config.pctAdmin,
      pctImprevistos: config.pctImprevistos,
      pctUtilidadAiu: config.pctUtilidadAiu,
      pctAdminGasto: config.pctAdminGasto,
      pctComision: config.pctComision,
      lineas: lineas.map((l) => ({
        categoria: l.categoria,
        itemCatalogoId: l.itemCatalogoId,
        descripcion: l.descripcion,
        descripcionLarga: l.descripcionLarga,
        unidad: l.unidad,
        cantidad: l.cantidad,
        valorCompraUnitario: l.valorCompraUnitario,
        factorRentabilidadLinea: l.factorRentabilidadLinea,
      })),
      hitos: hitosAGuardar,
      polizas: polizasSeleccionadas.map((p) => ({
        polizaId: p.polizaId,
        nombre: p.nombre,
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
          <div>
            <label className="text-xs text-slate-600">Cliente *</label>
            <input
              value={clienteNombre}
              onChange={(e) => {
                setClienteNombre(e.target.value);
                if (clienteId) setClienteId(null);
              }}
              placeholder="Nombre del cliente"
              className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2.5 text-base"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">Nombre de la obra</label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Mantenimiento redes eléctricas"
              className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2.5 text-base"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPagosAbierto((v) => !v)}
          className="text-sm font-medium text-slate-600"
        >
          {pagosAbierto ? "▾" : "▸"} Esquema de pagos
          {hitos.length > 0 && ` (${hitos.length})`}
        </button>

        {pagosAbierto && (
          <div className="space-y-2 rounded-md bg-slate-100 p-3">
            <div className="flex flex-wrap gap-2">
              {PLANTILLAS_PAGO.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => aplicarPlantillaPago(p.hitos)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {hitos.length > 0 && (
              <div className="flex items-center gap-2 px-0.5">
                <span className="flex-1 text-xs text-slate-600">
                  Nombre del hito
                </span>
                <span className="w-16 text-xs text-slate-600">%</span>
                <span className="w-24 shrink-0" />
                <span className="w-4 shrink-0" />
              </div>
            )}
            {hitos.map((h) => (
              <div key={h.id} className="flex items-center gap-2">
                <input
                  value={h.nombre}
                  onChange={(e) =>
                    actualizarHito(h.id, { nombre: e.target.value })
                  }
                  placeholder="Ej: Anticipo"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={h.porcentaje}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    actualizarHito(h.id, {
                      porcentaje: Number(e.target.value) || 0,
                    })
                  }
                  className="w-16 rounded-md border border-slate-300 px-2 py-2 text-sm"
                />
                <span className="w-24 shrink-0 text-right text-xs text-slate-600">
                  {formatCOP((h.porcentaje / 100) * totales.total)}
                </span>
                <button
                  type="button"
                  onClick={() => eliminarHito(h.id)}
                  className="shrink-0 text-sm text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setHitos((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), nombre: "", porcentaje: 0 },
                ])
              }
              className="w-full rounded-md border border-dashed border-slate-300 py-2 text-sm text-slate-600"
            >
              + Agregar hito
            </button>

            {hitos.length > 0 && (
              <p
                className={`text-right text-xs font-medium ${
                  Math.round(sumaHitos) === 100
                    ? "text-green-600"
                    : "text-amber-600"
                }`}
              >
                Suma: {sumaHitos.toFixed(0)}%
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setPolizasAbierto((v) => !v)}
          className="text-sm font-medium text-slate-600"
        >
          {polizasAbierto ? "▾" : "▸"} Pólizas
          {polizasSeleccionadas.length > 0 &&
            ` (${polizasSeleccionadas.length})`}
        </button>

        {polizasAbierto && (
          <div className="space-y-2 rounded-md bg-slate-100 p-3">
            <p className="text-xs text-slate-600">
              Solo se enuncian en la cotización como oferta (sin % ni
              vigencia) — el costo lo asume Servielectro, sale del rubro de
              administración.
            </p>
            <div className="space-y-1">
              {catalogoPolizas.map((poliza) => {
                const seleccion = polizasSeleccionadas.find(
                  (p) => p.polizaId === poliza.id,
                );
                return (
                  <label
                    key={poliza.id}
                    className="flex items-center gap-2 rounded-md bg-white p-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(seleccion)}
                      onChange={() => alternarPoliza(poliza)}
                    />
                    {poliza.nombre}
                  </label>
                );
              })}
            </div>

            <div>
              <label className="text-xs text-slate-600">
                Agregar póliza nueva al catálogo
              </label>
              <div className="mt-0.5 flex gap-2">
                <input
                  value={nuevaPolizaNombre}
                  onChange={(e) => setNuevaPolizaNombre(e.target.value)}
                  placeholder="Ej: Póliza de transporte"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={agregarPolizaNueva}
                  disabled={creandoPoliza || !nuevaPolizaNombre.trim()}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 disabled:opacity-50"
                >
                  {creandoPoliza ? "Agregando…" : "+ Agregar"}
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setDatosClienteAbierto((v) => !v)}
          className="text-sm font-medium text-slate-600"
        >
          {datosClienteAbierto ? "▾" : "▸"} Datos para la cotización impresa
          (opcional)
        </button>

        {datosClienteAbierto && (
          <div className="space-y-2 rounded-md bg-slate-100 p-3 text-sm">
            <button
              type="button"
              onClick={() => setRutModalAbierto(true)}
              className="w-full rounded-md border border-dashed border-slate-400 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700"
            >
              📄 Cargar RUT del cliente (autocompleta estos campos)
            </button>
            {clienteId && (
              <p className="text-xs text-green-700">
                ✓ Datos confirmados desde el RUT — cliente vinculado.
              </p>
            )}
            <div>
              <label className="text-xs text-slate-600">Comercial</label>
              <input
                value={comercial}
                onChange={(e) => setComercial(e.target.value)}
                placeholder="Nombre de quien cotiza"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-600">
                  NIT del cliente
                </label>
                <input
                  value={clienteNit}
                  onChange={(e) => setClienteNit(e.target.value)}
                  placeholder="900123456-7"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Contacto</label>
                <input
                  value={clienteContacto}
                  onChange={(e) => setClienteContacto(e.target.value)}
                  placeholder="Nombre o teléfono"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600">Dirección</label>
              <input
                value={clienteDireccion}
                onChange={(e) => setClienteDireccion(e.target.value)}
                placeholder="Dirección del cliente"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600">
                Correo del cliente
              </label>
              <input
                value={clienteEmail}
                onChange={(e) => setClienteEmail(e.target.value)}
                placeholder="cliente@correo.com"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAvanzadoAbierto((v) => !v)}
          className="text-sm font-medium text-slate-600"
        >
          {avanzadoAbierto ? "▾" : "▸"} Configuración avanzada (AIU / gastos)
        </button>

        {avanzadoAbierto && (
          <div className="space-y-2 rounded-md bg-slate-100 p-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <CampoPct
                label="Admin AIU %"
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
              <CampoPct
                label="Admin de gastos %"
                value={config.pctAdminGasto}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, pctAdminGasto: v }))
                }
              />
              <CampoPct
                label="Comisión comercial %"
                value={config.pctComision}
                onChange={(v) => setConfig((c) => ({ ...c, pctComision: v }))}
              />
            </div>
            <p className="text-xs text-slate-600">
              Tasas fijas de la empresa (no se modifican por cotización):
              Renta {(config.pctRenta * 100).toFixed(0)}% · ICA{" "}
              {config.icaPorMil} por mil · IVA{" "}
              {(config.ivaPct * 100).toFixed(0)}%
            </p>
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

      <main className="flex-1 space-y-3 p-4">
        {lineasTab.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-600">
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
                      <label className="text-xs text-slate-600">
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
                    <span className="text-xs text-slate-600">
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
          className="w-full rounded-lg border-2 border-dashed border-slate-300 py-4 text-base font-medium text-slate-600 active:bg-slate-100"
        >
          + Agregar línea de{" "}
          {CATEGORIAS.find((c) => c.key === activeTab)?.label.toLowerCase()}
        </button>

        <p className="text-right text-sm text-slate-600">
          Subtotal {CATEGORIAS.find((c) => c.key === activeTab)?.label}:{" "}
          <span className="font-semibold text-slate-800">
            {formatCOP(subtotalTab)}
          </span>
        </p>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        {detalleAbierto && (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto border-b border-slate-100 p-4 text-sm">
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
            <p className="pt-1 text-xs text-slate-600">
              Base IVA: {totales.ivaBaseMotivo} · Factor recargo:{" "}
              {totales.factorRecargoProyecto.toFixed(6)}
            </p>

            <div className="mt-3 border-t border-slate-200 pt-2">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-600">
                Gastos internos y utilidad real
              </p>
              <FilaTotal label="Admin (14% compra)" valor={totales.gastoAdmin} />
              <FilaTotal label="Renta" valor={totales.gastoRenta} />
              <FilaTotal label="ICA" valor={totales.gastoIca} />
              {config.pctComision > 0 && (
                <FilaTotal label="Comisión comercial" valor={totales.gastoComision} />
              )}
              <FilaTotal
                label="Total gastos"
                valor={totales.totalGastos}
                destacado
              />
              <div className="mt-1 flex justify-between font-semibold text-green-700">
                <span>Utilidad total</span>
                <span>
                  {formatCOP(totales.utilidadTotal)} (
                  {totales.pctUtilidadTotal.toFixed(1)}%)
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Impuestos a transferir: {formatCOP(totales.impuestosATransferir)}
              </p>
            </div>
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
            <span className="block text-xs text-slate-600">
              IVA {formatCOP(totales.valorIva)} · toca para ver detalle{" "}
              {detalleAbierto ? "▾" : "▸"}
            </span>
            <span className="block text-xl font-bold text-slate-900">
              {formatCOP(totales.total)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setVistaPreviaAbierta(true)}
            className="shrink-0 rounded-lg border border-slate-300 px-4 py-4 text-sm font-medium text-slate-700"
          >
            Vista previa
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

      {rutModalAbierto && (
        <RutUploader
          clienteNombre={clienteNombre}
          onCerrar={() => setRutModalAbierto(false)}
          onConfirmado={(idCliente, campos) => {
            setClienteId(idCliente);
            if (campos.razonSocial) setClienteNombre(campos.razonSocial);
            setClienteNit(campos.nit ? `${campos.nit}-${campos.dv}` : "");
            setClienteDireccion(campos.direccion);
            setClienteEmail(campos.correo);
            setClienteContacto(campos.telefono);
            setRutModalAbierto(false);
          }}
        />
      )}

      {vistaPreviaAbierta && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm">
          <div className="sticky top-0 z-10 flex justify-end gap-2 bg-slate-900/40 p-4 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setVistaPreviaAbierta(false)}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow"
            >
              Cerrar vista previa
            </button>
          </div>
          <FormatoCotizacion
            codigo="BORRADOR (sin guardar)"
            fecha={new Date().toISOString()}
            comercial={comercial || null}
            proyecto={descripcion || clienteNombre}
            cliente={{
              nombre: clienteNombre,
              nit: clienteNit || null,
              direccion: clienteDireccion || null,
              email: clienteEmail || null,
              contacto: clienteContacto || null,
            }}
            items={totales.lineas.map((l) => ({
              id: l.id,
              categoria: l.categoria,
              descripcion: l.descripcion,
              descripcionLarga: l.descripcionLarga,
              cantidad: l.cantidad,
              unidad: l.unidad,
              valorCalculoUnitario: l.valorCalculoUnitario,
            }))}
            totales={totales}
            hitos={hitos.map((h) => ({
              id: h.id,
              nombre: h.nombre,
              porcentaje: h.porcentaje / 100,
              valorProgramado: (h.porcentaje / 100) * totales.total,
            }))}
            configuracionEmpresa={configuracionEmpresa}
            polizas={polizasSeleccionadas.map((p) => ({
              id: p.id,
              nombre: p.nombre,
            }))}
          />
        </div>
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
      <label className="text-xs text-slate-600">{label}</label>
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
      <label className="text-xs text-slate-600">{label}</label>
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

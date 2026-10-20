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
import { hoyColombia } from "@/lib/crm";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import type {
  ConfiguracionEmpresa,
  PolizaCatalogo,
  ValorAgregadoCatalogo,
} from "@/lib/supabase/condicionesComerciales";
import { ArmadoCotizacionModal } from "@/components/cotizacion/ArmadoCotizacionModal";
import { NuevoItemModal } from "@/components/cotizacion/NuevoItemModal";
import { ClienteCombobox } from "@/components/clientes/ClienteCombobox";
import { NuevoClienteModal } from "@/components/clientes/NuevoClienteModal";
import type { ClienteResumen } from "@/lib/supabase/clientes";
import { RutUploader } from "@/components/cotizacion/RutUploader";
import { VistaPreviaModal } from "@/components/cotizacion/VistaPreviaModal";
import {
  ValoresAgregadosSelector,
  type ValorAgregadoUI,
} from "@/components/cotizacion/ValoresAgregadosSelector";
import { guardarCotizacion, crearPoliza } from "@/app/(app)/comercial/cotizaciones/actions";
import { createClient as crearClienteNavegador } from "@/lib/supabase/client";

const CATEGORIAS: { key: Categoria; label: string }[] = [
  { key: "EQUIPO", label: "Equipos" },
  { key: "MATERIAL", label: "Materiales" },
  { key: "MANO_DE_OBRA", label: "Mano de obra" },
];

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
  clienteId?: string | null;
  clienteNombre: string;
  clienteNit: string;
  clienteDireccion: string;
  clienteEmail: string;
  clienteContacto: string;
  clienteTelefono: string;
  descripcion: string;
  comercial: string;
  esquemaIva: EsquemaIva;
  config: Omit<ConfigPrecio, "esquemaIva">;
  lineas: Omit<LineaUI, "id">[];
  hitos: Omit<HitoUI, "id">[];
  polizas: Omit<PolizaSeleccionadaUI, "id">[];
  diasEjecucion: number | null;
  // undefined = la cotización original es anterior a los valores agregados seleccionables.
  valoresAgregados?: Omit<ValorAgregadoUI, "id">[];
}

export interface OrigenOportunidad {
  id: string;
  nombre: string;
  cliente: {
    id: string;
    nombre: string;
    nit: string | null;
    direccion: string | null;
    email: string | null;
    contacto: string | null;
    telefono: string | null;
  };
}

interface Draft {
  clienteId?: string | null;
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
  // Id de la cotización que se estaba duplicando (null si es una nueva desde cero).
  // Borradores viejos no lo traen: se toman como null.
  origen?: string | null;
  diasEjecucion?: string;
  clienteTelefono?: string;
  valoresAgregados?: ValorAgregadoUI[];
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
  clientesIniciales = [],
  valoresAgregadosCatalogo = [],
  configuracionEmpresa,
  datosIniciales,
  duplicarId,
  oportunidad,
  sugerencias,
  proximoCodigo = null,
}: {
  catalogoInicial: CatalogoItem[];
  polizasCatalogoInicial: PolizaCatalogo[];
  clientesIniciales?: ClienteResumen[];
  valoresAgregadosCatalogo?: ValorAgregadoCatalogo[];
  configuracionEmpresa: ConfiguracionEmpresa | null;
  datosIniciales?: DatosIniciales;
  duplicarId?: string;
  // "Cotizar" desde un negocio del CRM: cliente y nombre precargados, y al guardar la
  // cotización queda asociada al negocio.
  oportunidad?: OrigenOportunidad;
  // "Cotizar en el armador" desde la bandeja de sugerencias: al guardar, se marcan
  // cotizadas con el código nuevo.
  sugerencias?: string[];
  /** Próximo consecutivo (solo lectura, para la vista previa); se asigna al guardar. */
  proximoCodigo?: string | null;
}) {
  const clienteOp = oportunidad?.cliente;
  // Clave del borrador: un borrador solo se recupera sobre la misma cotización de origen.
  const origenInicial =
    duplicarId ??
    (oportunidad ? `op:${oportunidad.id}` : sugerencias?.length ? `sug:${sugerencias.join(",")}` : null);
  const [catalogo, setCatalogo] = useState(catalogoInicial);
  const [catalogoPolizas, setCatalogoPolizas] = useState(polizasCatalogoInicial);
  const [catalogoValores, setCatalogoValores] = useState(valoresAgregadosCatalogo);
  // Ninguno viene marcado (pedido de Jhojan): el comercial elige y edita los que
  // correspondan a cada cliente.
  const valoresPorDefecto = (): ValorAgregadoUI[] => [];
  const [valoresAgregados, setValoresAgregados] = useState<ValorAgregadoUI[]>(() =>
    datosIniciales?.valoresAgregados
      ? datosIniciales.valoresAgregados.map((v) => ({ ...v, id: crypto.randomUUID() }))
      : valoresPorDefecto(),
  );
  const [valoresAbierto, setValoresAbierto] = useState(false);
  const [nuevaPolizaNombre, setNuevaPolizaNombre] = useState("");
  const [creandoPoliza, setCreandoPoliza] = useState(false);
  const [clienteNombre, setClienteNombre] = useState(
    datosIniciales?.clienteNombre ?? clienteOp?.nombre ?? "",
  );
  // Se resuelve al confirmar un RUT (fn_buscar_o_crear_cliente ya devuelve un id real).
  // Si el nombre se edita después, se limpia — ya no se puede confiar en que siga
  // siendo el mismo cliente que resolvió el RUT.
  const [clienteId, setClienteId] = useState<string | null>(
    datosIniciales ? (datosIniciales.clienteId ?? null) : (clienteOp?.id ?? null),
  );
  // Lista de clientes para el buscador (estilo Siigo) y la ventana de cliente nuevo.
  const [clientes, setClientes] = useState(clientesIniciales);
  const [nuevoCliente, setNuevoCliente] = useState<string | null>(null);
  const [avisoCliente, setAvisoCliente] = useState<string | null>(null);

  // Elegir un cliente reemplaza TODOS sus datos en la cotización y fija su id real.
  function elegirCliente(c: ClienteResumen) {
    setClienteId(c.id);
    setClienteNombre(c.nombre);
    setClienteNit(c.nit ?? "");
    setClienteDireccion(c.direccion ?? "");
    setClienteEmail(c.email ?? "");
    setClienteContacto(c.contacto ?? "");
    setClienteTelefono(c.telefono ?? "");
    setAvisoCliente(null);
  }
  const [rutModalAbierto, setRutModalAbierto] = useState(false);
  const [vistaPreviaAbierta, setVistaPreviaAbierta] = useState(false);
  const [clienteNit, setClienteNit] = useState(
    datosIniciales?.clienteNit ?? clienteOp?.nit ?? "",
  );
  const [clienteDireccion, setClienteDireccion] = useState(
    datosIniciales?.clienteDireccion ?? clienteOp?.direccion ?? "",
  );
  const [clienteEmail, setClienteEmail] = useState(
    datosIniciales?.clienteEmail ?? clienteOp?.email ?? "",
  );
  const [clienteContacto, setClienteContacto] = useState(
    datosIniciales?.clienteContacto ?? clienteOp?.contacto ?? "",
  );
  const [clienteTelefono, setClienteTelefono] = useState(
    datosIniciales?.clienteTelefono ?? clienteOp?.telefono ?? "",
  );
  const [comercial, setComercial] = useState(datosIniciales?.comercial ?? "");
  const [descripcion, setDescripcion] = useState(
    datosIniciales?.descripcion ?? oportunidad?.nombre ?? "",
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
  // Texto libre en la UI; se convierte a número al guardar (vacío = no sale en el documento).
  const [diasEjecucion, setDiasEjecucion] = useState(
    datosIniciales?.diasEjecucion ? String(datosIniciales.diasEjecucion) : "",
  );
  const [armadoAbierto, setArmadoAbierto] = useState(false);
  const [avanzadoAbierto, setAvanzadoAbierto] = useState(false);
  const [pagosAbierto, setPagosAbierto] = useState(
    Boolean(datosIniciales?.hitos.length),
  );
  const [polizasAbierto, setPolizasAbierto] = useState(
    Boolean(datosIniciales?.polizas.length),
  );
  const [datosClienteAbierto, setDatosClienteAbierto] = useState(
    Boolean(
      clienteOp?.nit ||
        clienteOp?.telefono ||
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
  const [origen, setOrigen] = useState<string | null>(origenInicial);
  // Hora del borrador recuperado, para que se vea que el trabajo no se perdió
  // (p. ej. al volver después de un cierre de sesión por inactividad).
  const [restauradoDe, setRestauradoDe] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [avisoSugerencias, setAvisoSugerencias] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState<{
    codigo: string;
    cotizacionId: string;
    oportunidadId: string | null;
    aviso: string | null;
    preciosGuardados: string[];
    avisoPrecios: string | null;
    lineasEnCero: string[];
  } | null>(
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
      // Al duplicar una cotización existente, esa es la intención explícita del usuario:
      // no pisarla con un borrador local viejo que haya quedado guardado. Excepción: si
      // el borrador ES el duplicado de esta misma cotización (se volvió a esta URL tras
      // un cierre por inactividad), lo que vale es el trabajo en curso, no el original.
      const origenDraft = draft.origen ?? null;
      if ((datosIniciales || oportunidad) && origenDraft !== origenInicial) {
        // Hay un borrador sin guardar de OTRA cotización: si se sigue, el precargado lo
        // pisa. Se pregunta en vez de perderlo en silencio.
        const otroConLineas = draft.lineas?.length > 0;
        if (
          !otroConLineas ||
          window.confirm(
            `Hay un borrador sin guardar de otra cotización (${draft.clienteNombre || "sin cliente"}, ${draft.lineas.length} líneas). ¿Descartarlo y empezar esta?`,
          )
        ) {
          return;
        }
        // Eligió conservar el borrador: se recupera ese en lugar del precargado.
      }
      if (draft.lineas?.length) {
        setClienteNombre(draft.clienteNombre ?? "");
        // El borrador no guarda el id de cliente: solo se conserva el del negocio si el
        // borrador es de ese mismo negocio; si es de otra cotización, no se hereda.
        setClienteId(
          draft.clienteId ??
            (origenDraft === origenInicial && clienteOp ? clienteOp.id : null) ??
            clientesIniciales.find(
              (c) => c.nombre.toLowerCase() === (draft.clienteNombre ?? "").trim().toLowerCase(),
            )?.id ??
            null,
        );
        setClienteNit(draft.clienteNit ?? "");
        setClienteDireccion(draft.clienteDireccion ?? "");
        setClienteEmail(draft.clienteEmail ?? "");
        setClienteContacto(draft.clienteContacto ?? "");
        setClienteTelefono(draft.clienteTelefono ?? "");
        setComercial(draft.comercial ?? "");
        setDescripcion(draft.descripcion ?? "");
        // Campo por campo contra el default: borradores viejos (la primera versión del
        // armador) no traen pctRenta/icaPorMil ni los gastos internos, y un undefined deja
        // el factor de recargo en NaN y el Cálculo en 0. Renta e ICA son tasas fijas de la
        // empresa: siempre del default, nunca del borrador.
        const guardada = (draft.config ?? {}) as Partial<ConfigPrecio>;
        const numero = (v: unknown, def: number) =>
          typeof v === "number" && Number.isFinite(v) ? v : def;
        setConfig({
          pctAdmin: numero(guardada.pctAdmin, CONFIG_PRECIO_DEFAULT.pctAdmin),
          pctImprevistos: numero(guardada.pctImprevistos, CONFIG_PRECIO_DEFAULT.pctImprevistos),
          pctUtilidadAiu: numero(guardada.pctUtilidadAiu, CONFIG_PRECIO_DEFAULT.pctUtilidadAiu),
          pctAdminGasto: numero(guardada.pctAdminGasto, CONFIG_PRECIO_DEFAULT.pctAdminGasto),
          pctComision: numero(guardada.pctComision, CONFIG_PRECIO_DEFAULT.pctComision),
          pctRenta: CONFIG_PRECIO_DEFAULT.pctRenta,
          icaPorMil: CONFIG_PRECIO_DEFAULT.icaPorMil,
          ivaPct: numero(guardada.ivaPct, CONFIG_PRECIO_DEFAULT.ivaPct),
        });
        setEsquemaIva(draft.config?.esquemaIva ?? "IVA_FULL");
        setLineas(draft.lineas);
        setHitos(draft.hitos ?? []);
        setPolizasSeleccionadas(draft.polizas ?? []);
        setDiasEjecucion(draft.diasEjecucion ?? "");
        if (draft.valoresAgregados) setValoresAgregados(draft.valoresAgregados);
        setOrigen(origenDraft);
        setRestauradoDe(draft.guardadoEn ?? null);
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
        clienteId,
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
        origen,
        diasEjecucion,
        clienteTelefono,
        valoresAgregados,
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
    origen,
    diasEjecucion,
    clienteTelefono,
    valoresAgregados,
    clienteId,
  ]);

  const totales = useMemo(
    () => calcularTotales(lineas, configConEsquema),
    [lineas, configConEsquema],
  );

  // Líneas con precio de compra en 0: se permite guardar el borrador, pero el documento
  // no se puede imprimir ni enviar (ver /imprimir). Mandarle al cliente una línea en $0
  // es el peor error posible de este módulo.
  const lineasEnCero = lineas.filter((l) => !(l.valorCompraUnitario > 0));

  const sumaHitos = hitos.reduce((acc, h) => acc + h.porcentaje, 0);

  function actualizarLinea(id: string, cambios: Partial<LineaUI>) {
    setLineas((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)),
    );
  }

  function eliminarLinea(id: string) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  function agregarLinea(categoria: Categoria) {
    setLineas((prev) => [...prev, nuevaLinea(categoria)]);
  }

  function seleccionarItem(lineaId: string, item: CatalogoItem) {
    actualizarLinea(lineaId, {
      itemCatalogoId: item.id,
      descripcion: item.nombreCorto,
      descripcionLarga: item.descripcion,
      unidad: item.unidad,
      valorCompraUnitario: item.valorCompraIva ?? 0,
      factorRentabilidadLinea: item.factorRentabilidadLinea,
      guardarPrecioCatalogo: item.valorCompraIva === null,
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

  // Hay algo que se perdería al empezar de nuevo.
  const hayBorrador = lineas.length > 0 || Boolean(clienteNombre.trim()) || Boolean(descripcion.trim());

  /**
   * Botón "Cotización nueva": borra el borrador (el que sobrevive a un cierre inesperado)
   * y arranca en blanco. Pide confirmación diciendo exactamente qué se pierde, para que
   * media hora de trabajo no se vaya por un toque.
   */
  function pedirCotizacionNueva() {
    if (hayBorrador) {
      const detalle = [
        clienteNombre.trim() ? `• Cliente: ${clienteNombre.trim()}` : null,
        descripcion.trim() ? `• Proyecto: ${descripcion.trim()}` : null,
        `• ${lineas.length} ${lineas.length === 1 ? "línea" : "líneas"}`,
      ]
        .filter(Boolean)
        .join("\n");
      if (
        !window.confirm(
          `Se va a borrar el borrador actual (no se guardó como cotización):\n\n${detalle}\n\n¿Empezar una cotización nueva en blanco?`,
        )
      )
        return;
    }
    empezarDeCero();
  }

  function empezarDeCero() {
    setClienteId(null);
    setAvisoCliente(null);
    setClienteNombre("");
    setClienteNit("");
    setClienteDireccion("");
    setClienteEmail("");
    setClienteContacto("");
    setClienteTelefono("");
    setComercial("");
    setDescripcion("");
    setConfig(CONFIG_PRECIO_DEFAULT);
    setEsquemaIva("IVA_FULL");
    setLineas([]);
    setHitos([]);
    setPolizasSeleccionadas([]);
    setDiasEjecucion("");
    setValoresAgregados(valoresPorDefecto());
    setOrigen(null);
    setRestauradoDe(null);
    setGuardadoOk(null);
    setError(null);
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {}
    // Si se había abierto con ?duplicar= u ?oportunidad=, la dirección queda limpia: al
    // recargar no vuelve a precargar nada.
    window.history.replaceState(null, "", "/comercial/cotizaciones/nueva");
    window.scrollTo({ top: 0 });
  }

  async function onGuardar() {
    setError(null);

    if (!clienteNombre.trim()) {
      setError("Falta el cliente");
      return;
    }
    if (!clienteId) {
      setError(
        "Elige el cliente de la lista o créalo con «+ Nuevo cliente» (así no se duplica).",
      );
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

    const diasEjecucionNum = diasEjecucion.trim() ? Number(diasEjecucion) : null;
    if (
      diasEjecucionNum !== null &&
      (!Number.isInteger(diasEjecucionNum) || diasEjecucionNum < 1 || diasEjecucionNum > 3650)
    ) {
      setError("Los días de ejecución tienen que ser un número entero de días hábiles");
      return;
    }

    setGuardando(true);
    // Si no se armó un esquema de pagos, se guarda como pago único (100%) por defecto.
    const hitosAGuardar =
      hitos.length > 0
        ? hitos.map((h) => ({ nombre: h.nombre, porcentaje: h.porcentaje / 100 }))
        : [{ nombre: "Pago único", porcentaje: 1 }];

    const preciosCatalogo = lineas
      .filter((l) => l.guardarPrecioCatalogo && l.itemCatalogoId && l.valorCompraUnitario > 0)
      .map((l) => ({ itemId: l.itemCatalogoId!, nombre: l.descripcion, valor: l.valorCompraUnitario }));

    const res = await guardarCotizacion({
      preciosCatalogo,
      clienteId,
      clienteNombre: clienteNombre.trim(),
      clienteNit: clienteNit.trim(),
      clienteDireccion: clienteDireccion.trim(),
      clienteEmail: clienteEmail.trim(),
      clienteContacto: clienteContacto.trim(),
      clienteTelefono: clienteTelefono.trim(),
      oportunidadId: origen?.startsWith("op:") ? origen.slice(3) : null,
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
      diasEjecucion: diasEjecucionNum,
      valoresAgregados: valoresAgregados
        .filter((v) => v.titulo.trim() && v.texto.trim())
        .map((v) => ({ valorAgregadoId: v.valorAgregadoId, titulo: v.titulo, texto: v.texto })),
    });
    setGuardando(false);

    if (!res.ok) {
      setError(
        `No se pudo guardar (${res.error}). El borrador sigue disponible en este dispositivo — reintenta cuando tengas señal.`,
      );
      return;
    }

    setGuardadoOk({
      codigo: res.codigo,
      cotizacionId: res.cotizacionId,
      oportunidadId: origen?.startsWith("op:") ? origen.slice(3) : null,
      aviso: res.avisoOportunidad,
      preciosGuardados: res.preciosGuardados,
      avisoPrecios: res.avisoPrecios,
      lineasEnCero: lineasEnCero.map((l) => l.descripcion || "(sin ítem)"),
    });
    // Si salió de sugerencias de los técnicos: quedan cotizadas con este código (y el
    // historial de cada una lo registra). Si alguna no se puede marcar, se avisa.
    if (origen?.startsWith("sug:")) {
      const ids = origen.slice(4).split(",").filter(Boolean);
      const supabaseNavegador = crearClienteNavegador();
      let marcadas = 0;
      const fallidas: string[] = [];
      for (const id of ids) {
        const { error: errSug } = await supabaseNavegador.rpc("fn_cambiar_estado_sugerencia", {
          p_sugerencia_id: id,
          p_estado: "cotizada",
          p_comentario: `Cotizada en ${res.codigo}`,
          p_cotizacion_id: res.cotizacionId,
        });
        if (errSug) fallidas.push(errSug.message);
        else marcadas++;
      }
      setAvisoSugerencias(
        fallidas.length
          ? `${marcadas} de ${ids.length} sugerencias quedaron cotizadas; las demás no (${fallidas[0]}). Márcalas desde la bandeja.`
          : `${marcadas === 1 ? "La sugerencia del técnico quedó" : `Las ${marcadas} sugerencias del técnico quedaron`} cotizada${marcadas === 1 ? "" : "s"} con ${res.codigo}.`,
      );
    }
    // El catálogo en pantalla también queda al día: la próxima cotización ya trae el precio.
    if (res.preciosGuardados.length > 0) {
      const nuevos = new Map(preciosCatalogo.map((p) => [p.itemId, p.valor]));
      setCatalogo((prev) =>
        prev.map((i) =>
          nuevos.has(i.id)
            ? { ...i, valorCompraIva: nuevos.get(i.id)!, precioActualizadoEn: hoyColombia() }
            : i,
        ),
      );
    }
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

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
          {guardadoOk.oportunidadId && !guardadoOk.aviso && (
            <p className="mt-1 text-sm text-green-700">
              Quedó asociada al negocio del CRM.
            </p>
          )}
          {avisoSugerencias && <p className="mt-1 text-sm text-green-700">{avisoSugerencias}</p>}
        </div>
        {guardadoOk.preciosGuardados.length > 0 && (
          <div className="max-w-md rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-900">
            <p className="font-semibold">
              ✓ {guardadoOk.preciosGuardados.length === 1
                ? "1 precio quedó guardado en el catálogo"
                : `${guardadoOk.preciosGuardados.length} precios quedaron guardados en el catálogo`}
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {guardadoOk.preciosGuardados.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">La próxima cotización ya los trae.</p>
          </div>
        )}
        {guardadoOk.avisoPrecios && (
          <p className="max-w-md rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {guardadoOk.avisoPrecios}
          </p>
        )}
        {guardadoOk.lineasEnCero.length > 0 && (
          <div className="max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-sm text-red-900">
            <p className="font-semibold">
              Quedó como borrador con {guardadoOk.lineasEnCero.length}{" "}
              {guardadoOk.lineasEnCero.length === 1 ? "línea" : "líneas"} en $0:
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {guardadoOk.lineasEnCero.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              No se puede imprimir ni enviar al cliente hasta completarlas (en la oficina:
              abrirla y usar &quot;Duplicar&quot; para terminarla).
            </p>
          </div>
        )}
        {guardadoOk.aviso && (
          <p className="max-w-md rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {guardadoOk.aviso}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <a
            href={`/comercial/cotizaciones/${guardadoOk.cotizacionId}`}
            className="rounded-md border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-800"
          >
            Ver cotización
          </a>
          {guardadoOk.oportunidadId && (
            <a
              href={`/comercial/crm/${guardadoOk.oportunidadId}`}
              className="rounded-md border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-800"
            >
              Volver al negocio
            </a>
          )}
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
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-2xl p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0" />
            <h1 className="flex-1 text-center text-sm font-bold text-slate-900">
              Nueva cotización
            </h1>
            <span className="flex w-28 shrink-0 justify-end">
              {hayBorrador && (
                <button
                  type="button"
                  onClick={pedirCotizacionNueva}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100"
                >
                  Cotización nueva
                </button>
              )}
            </span>
          </div>
          {restauradoDe && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span>
                <span className="font-semibold">Retomando borrador</span> {fechaBorrador(restauradoDe)} —{" "}
                {lineas.length} {lineas.length === 1 ? "línea" : "líneas"}
                {clienteNombre.trim() ? ` · ${clienteNombre.trim()}` : ""}. Quedó guardado en este
                dispositivo, no como cotización.
              </span>
              <button
                type="button"
                onClick={pedirCotizacionNueva}
                className="shrink-0 font-semibold underline"
              >
                Empezar en blanco
              </button>
            </div>
          )}
        </div>

        <div className="mx-auto w-full max-w-2xl space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
          {/* Un solo valor para los dos: excluyentes por construcción, nunca los dos a la vez. */}
          <div
            role="radiogroup"
            aria-label="Régimen de IVA"
            className="mt-1 grid grid-cols-2 gap-2 sm:mt-2 sm:w-2/3 sm:mx-auto"
          >
            <button
              type="button"
              role="radio"
              aria-checked={esquemaIva === "IVA_FULL"}
              onClick={() => setEsquemaIva("IVA_FULL")}
              className={`rounded-md border px-2 py-1.5 text-center text-xs font-semibold ${
                esquemaIva === "IVA_FULL"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              IVA FULL
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={esquemaIva === "IVA_AIU"}
              onClick={() => setEsquemaIva("IVA_AIU")}
              className={`rounded-md border px-2 py-1.5 text-center text-xs font-semibold ${
                esquemaIva === "IVA_AIU"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              IVA AIU
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <ClienteCombobox
                clientes={clientes}
                seleccionado={clienteNombre ? { id: clienteId, nombre: clienteNombre } : null}
                onSeleccionar={elegirCliente}
                onCrearNuevo={(busqueda) => setNuevoCliente(busqueda)}
              />
              {avisoCliente && <p className="mt-1 text-xs text-blue-700">{avisoCliente}</p>}
            </div>
            <div>
              <label className="text-xs text-slate-600">
                Nombre de la obra
              </label>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Mantenimiento redes eléctricas"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
          Tiempo de ejecución
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={diasEjecucion}
            onChange={(e) => setDiasEjecucion(e.target.value)}
            placeholder="60"
            className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          días hábiles
        </label>

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
          onClick={() => setValoresAbierto((v) => !v)}
          className="text-sm font-medium text-slate-600"
        >
          {valoresAbierto ? "▾" : "▸"} Bloques del documento (valores agregados, observaciones…)
          {valoresAgregados.length > 0 && ` (${valoresAgregados.length})`}
        </button>

        {valoresAbierto && (
          <ValoresAgregadosSelector
            catalogo={catalogoValores}
            seleccionados={valoresAgregados}
            onCambiar={setValoresAgregados}
            onCatalogoNuevo={(v) => setCatalogoValores((prev) => [...prev, v])}
          />
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
            <p className="text-xs text-slate-500">
              Datos del cliente elegido. Lo que cambies aquí se actualiza en su ficha al
              guardar. El RUT se lee al crear un cliente nuevo.
            </p>
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
                  placeholder="Ej. Administradora"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600">Celular / teléfono</label>
              <input
                value={clienteTelefono}
                onChange={(e) => setClienteTelefono(e.target.value)}
                inputMode="tel"
                placeholder="Ej. 300 123 4567"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
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

        {lineas.length > 0 &&
          !(
            Number.isFinite(totales.factorRecargoProyecto) &&
            totales.factorRecargoProyecto > 0 &&
            totales.factorRecargoProyecto <= 1
          ) && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              <span className="font-semibold">El Cálculo no se puede sacar con estos porcentajes.</span>{" "}
              El factor de recargo dio {totales.factorRecargoProyecto.toPrecision(4)}, fuera de
              rango. Revisá la Configuración avanzada: algún porcentaje quedó demasiado alto
              (por ejemplo &quot;Admin de gastos&quot; debe ser 14, no 1400).
            </div>
          )}

        {avanzadoAbierto && (
          <div className="space-y-2 rounded-md bg-slate-100 p-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              {esquemaIva === "IVA_FULL" && (
                <p className="col-span-2 text-xs text-slate-600">
                  IVA FULL no lleva AIU: los porcentajes de Administración, Imprevistos y
                  Utilidad no se usan. Para usarlos, elegí IVA AIU.
                </p>
              )}
              <CampoPct
                label="Admin AIU %"
                value={config.pctAdmin}
                disabled={esquemaIva === "IVA_FULL"}
                onChange={(v) => setConfig((c) => ({ ...c, pctAdmin: v }))}
              />
              <CampoPct
                label="Imprevistos %"
                value={config.pctImprevistos}
                disabled={esquemaIva === "IVA_FULL"}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, pctImprevistos: v }))
                }
              />
              <CampoPct
                label="Utilidad AIU %"
                value={config.pctUtilidadAiu}
                disabled={esquemaIva === "IVA_FULL"}
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
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-3 sm:p-4">
        <button
          type="button"
          onClick={() => setArmadoAbierto(true)}
          className="w-full rounded-lg bg-brand-red px-4 py-4 text-center text-base font-semibold text-white shadow-sm sm:py-5"
        >
          {lineas.length > 0
            ? `Editar cotización (${lineas.length} línea${lineas.length === 1 ? "" : "s"})`
            : "Generar cotización"}
        </button>

        {CATEGORIAS.map((c) => {
          const lineasCat = lineas.filter((l) => l.categoria === c.key);
          if (lineasCat.length === 0) return null;
          const subtotalCat = totales.lineas
            .filter((l) => l.categoria === c.key)
            .reduce((acc, l) => acc + l.subtotalCalculo, 0);
          return (
            <div
              key={c.key}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <span className="text-slate-600">
                {c.label} ({lineasCat.length})
              </span>
              <span className="font-semibold text-slate-900">
                {formatCOP(subtotalCat)}
              </span>
            </div>
          );
        })}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        {detalleAbierto && (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto border-b border-slate-100 p-4 text-sm">
            <FilaTotal label="Subtotal compra" valor={totales.subtotalCompra} />
            <FilaTotal label="Subtotal venta" valor={totales.subtotalVenta} />
            <FilaTotal
              label="Subtotal cálculo (cliente)"
              valor={totales.subtotalCalculo}
            />
            {esquemaIva === "IVA_AIU" && (
              <>
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
              </>
            )}
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

        {lineasEnCero.length > 0 && (
          <p className="bg-amber-50 px-4 py-2 text-xs text-amber-900">
            ⚠ {lineasEnCero.length} {lineasEnCero.length === 1 ? "línea" : "líneas"} en $0:{" "}
            {lineasEnCero.map((l) => l.descripcion || "(sin ítem)").join(", ")}. Puedes guardarla
            como borrador, pero no se podrá imprimir ni enviar al cliente hasta completarlas.
          </p>
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

      {armadoAbierto && (
        <ArmadoCotizacionModal
          lineas={lineas}
          lineasCalculadas={totales.lineas}
          catalogo={catalogo}
          onActualizarLinea={actualizarLinea}
          onEliminarLinea={eliminarLinea}
          onSeleccionarItem={seleccionarItem}
          onAgregarLinea={agregarLinea}
          onAbrirNuevoItem={(categoria, lineaId, busqueda) =>
            setModal({ categoria, lineaId, busquedaInicial: busqueda })
          }
          onCerrar={() => setArmadoAbierto(false)}
        />
      )}

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

      {nuevoCliente !== null && (
        <NuevoClienteModal
          nombreInicial={nuevoCliente}
          onCerrar={() => setNuevoCliente(null)}
          onCreado={(c, yaExistia) => {
            if (!yaExistia) setClientes((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            elegirCliente(c);
            setAvisoCliente(
              yaExistia
                ? `Ya existía un cliente con ese NIT (${c.nombre}): quedó seleccionado, no se duplicó.`
                : `Cliente ${c.nombre} creado y seleccionado.`,
            );
            setNuevoCliente(null);
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
            setClienteTelefono(campos.telefono);
            setRutModalAbierto(false);
          }}
        />
      )}

      {vistaPreviaAbierta && (
        <VistaPreviaModal
          onCerrar={() => setVistaPreviaAbierta(false)}
          codigo={proximoCodigo ?? "BORRADOR"}
          borrador
          fecha={new Date().toISOString()}
          comercial={comercial || null}
          proyecto={descripcion || clienteNombre}
          cliente={{
            nombre: clienteNombre,
            nit: clienteNit || null,
            direccion: clienteDireccion || null,
            email: clienteEmail || null,
            contacto: clienteContacto || null,
            telefono: clienteTelefono || null,
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
          totales={{ ...totales, esquemaIva }}
          diasEjecucion={diasEjecucion.trim() ? Number(diasEjecucion) || null : null}
          bloquesDocumento={valoresAgregados.filter((v) => v.titulo.trim() && v.texto.trim())}
          porcentajes={{
            admin: config.pctAdmin,
            imprevistos: config.pctImprevistos,
            utilidad: config.pctUtilidadAiu,
            iva: config.ivaPct,
          }}
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
      )}
    </div>
  );
}

/**
 * Porcentaje que se escribe como se lee: "14" es 14 %. Por dentro se guarda como
 * fracción (0.14), que es lo que usa el motor de precios. Antes el campo mostraba y
 * pedía la fracción con una etiqueta "%": escribir 14 daba 1400 % y el Cálculo en 0.
 */
function CampoPct({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  // Texto mientras se escribe ("13," o "13.5" a medias); si el valor cambia por fuera
  // (borrador, cotización nueva), se muestra el valor.
  const [texto, setTexto] = useState<string | null>(null);
  const aNumero = (t: string) => (Number(t.replace(",", ".")) || 0) / 100;
  const mostrado =
    texto !== null && Math.abs(aNumero(texto) - value) < 1e-9
      ? texto
      : String(Math.round(value * 100 * 10000) / 10000);
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={mostrado}
        disabled={disabled}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(aNumero(e.target.value));
        }}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-200 disabled:text-slate-400"
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

function fechaBorrador(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86_400_000);
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return `de hoy a las ${hora}`;
  if (mismoDia(d, ayer)) return `de ayer a las ${hora}`;
  const fecha = d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== hoy.getFullYear() ? { year: "numeric" } : {}),
  });
  return `del ${fecha}, ${hora}`;
}

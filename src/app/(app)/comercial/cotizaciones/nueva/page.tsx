import { createClient } from "@/lib/supabase/server";
import { getCatalogoActivo, type CatalogoItem } from "@/lib/supabase/catalogo";
import { getCotizacionDetalle } from "@/lib/supabase/cotizaciones";
import {
  getConfiguracionEmpresa,
  getPolizasCatalogo,
  getValoresAgregadosCatalogo,
  type ValorAgregadoCatalogo,
  type ConfiguracionEmpresa,
  type PolizaCatalogo,
} from "@/lib/supabase/condicionesComerciales";
import { CONFIG_PRECIO_DEFAULT, FACTORES_RENTABILIDAD_DEFAULT } from "@/lib/pricing";
import { getClientesActivos, type ClienteResumen } from "@/lib/supabase/clientes";
import {
  CotizacionBuilder,
  type DatosIniciales,
  type OrigenOportunidad,
} from "./CotizacionBuilder";

type Detalle = NonNullable<Awaited<ReturnType<typeof getCotizacionDetalle>>>;

/**
 * Bloques del documento que arrancan marcados al duplicar, para que la copia imprima lo
 * mismo que el original:
 * - original con bloques (esquema actual): los mismos bloques, en su orden.
 * - original con valores agregados elegidos (esquema de la migración 30): esos, más el
 *   bloque de observaciones del catálogo (que ese documento imprimía fijo).
 * - original anterior a todo esto: el bloque de valores agregados y el de
 *   observaciones del catálogo (lo que imprimía fijo).
 */
function bloquesAlDuplicar(original: Detalle, catalogo: ValorAgregadoCatalogo[]) {
  const deCatalogo = (prefijo: string) =>
    catalogo
      .filter((c) => c.titulo.toUpperCase().startsWith(prefijo))
      .slice(0, 1)
      .map((c) => ({ valorAgregadoId: c.id, titulo: c.titulo, texto: c.texto }));
  const copia = (filas: { titulo: string; texto: string }[]) =>
    filas.map((v) => ({ valorAgregadoId: null, titulo: v.titulo, texto: v.texto }));

  if (original.bloquesDocumento) return copia(original.bloquesDocumento);
  if (original.valoresAgregados) {
    return [...copia(original.valoresAgregados), ...deCatalogo("OBSERVACIONES")];
  }
  return [...deCatalogo("VALORES AGREGADOS"), ...deCatalogo("OBSERVACIONES")];
}

export default async function NuevaCotizacionPage(
  props: PageProps<"/comercial/cotizaciones/nueva">,
) {
  const supabase = await createClient();
  const searchParams = await props.searchParams;
  const duplicarId = searchParams.duplicar;
  const oportunidadId = searchParams.oportunidad;
  const sugerenciasParam = searchParams.sugerencias;

  let catalogo: CatalogoItem[] = [];
  try {
    catalogo = await getCatalogoActivo(supabase);
  } catch (err) {
    // Supabase todavía no está configurado o no responde: se muestra la pantalla
    // igual (sin catálogo) en vez de romper toda la página.
    console.error("No se pudo cargar el catálogo de ítems:", err);
  }

  let polizasCatalogo: PolizaCatalogo[] = [];
  let configuracionEmpresa: ConfiguracionEmpresa | null = null;
  try {
    [polizasCatalogo, configuracionEmpresa] = await Promise.all([
      getPolizasCatalogo(supabase),
      getConfiguracionEmpresa(supabase),
    ]);
  } catch (err) {
    console.error("No se pudo cargar el catálogo de pólizas o la configuración de la empresa:", err);
  }

  const valoresAgregadosCatalogo: ValorAgregadoCatalogo[] =
    await getValoresAgregadosCatalogo(supabase);

  let clientes: ClienteResumen[] = [];
  try {
    clientes = await getClientesActivos(supabase);
  } catch (err) {
    console.error("No se pudo cargar la lista de clientes:", err);
  }

  let datosIniciales: DatosIniciales | undefined;
  if (typeof duplicarId === "string") {
    try {
      const original = await getCotizacionDetalle(supabase, duplicarId);
      if (original) {
        datosIniciales = {
          clienteId: original.cliente.id,
          clienteNombre: original.cliente.nombre,
          clienteNit: original.cliente.nit ?? "",
          clienteDireccion: original.cliente.direccion ?? "",
          clienteEmail: original.cliente.email ?? "",
          clienteContacto: original.cliente.contacto ?? "",
          clienteTelefono: original.cliente.telefono ?? "",
          descripcion: original.descripcion,
          comercial: original.comercial ?? "",
          esquemaIva: original.esquemaIva,
          config: {
            pctAdmin: original.pctAdmin,
            pctImprevistos: original.pctImprevistos,
            pctUtilidadAiu: original.pctUtilidadAiu,
            pctAdminGasto: original.pctAdminGasto,
            pctComision: original.pctComision,
            pctRenta: CONFIG_PRECIO_DEFAULT.pctRenta,
            icaPorMil: CONFIG_PRECIO_DEFAULT.icaPorMil,
            ivaPct: original.ivaPct,
          },
          lineas: original.items.map((it) => ({
            categoria: it.categoria,
            itemCatalogoId: null,
            descripcion: it.descripcion,
            descripcionLarga: it.descripcionLarga,
            unidad: it.unidad,
            cantidad: it.cantidad,
            valorCompraUnitario: it.valorCompraUnitario,
            factorRentabilidadLinea: it.factorRentabilidadLinea,
          })),
          hitos: original.hitos.map((h) => ({
            nombre: h.nombre,
            porcentaje: Math.round(h.porcentaje * 100),
          })),
          diasEjecucion: original.diasEjecucion,
          // Al duplicar, el documento nuevo conserva el mismo contenido que imprimía el
          // original, ahora como bloques seleccionables (ver bloquesAlDuplicar).
          valoresAgregados: bloquesAlDuplicar(original, valoresAgregadosCatalogo),
          polizas: original.polizas.map((p) => ({
            polizaId: p.polizaId,
            nombre: p.nombre,
          })),
        };
      }
    } catch (err) {
      console.error("No se pudo cargar la cotización a duplicar:", err);
    }
  }

  let oportunidad: OrigenOportunidad | undefined;
  if (typeof oportunidadId === "string" && !datosIniciales) {
    const { data: op } = await supabase
      .from("oportunidades")
      .select("id, nombre, clientes(id, nombre, nit, direccion, email, contacto, telefono)")
      .eq("id", oportunidadId)
      .maybeSingle();
    const cliente = op && (Array.isArray(op.clientes) ? op.clientes[0] : op.clientes);
    if (op && cliente) {
      oportunidad = {
        id: op.id,
        nombre: op.nombre,
        cliente: cliente as OrigenOportunidad["cliente"],
      };
    }
  }

  // "Cotizar en el armador" desde la bandeja de sugerencias de los técnicos: cliente de la
  // visita y una línea por sugerencia (con el ítem del catálogo si el técnico lo eligió;
  // si no, en $0 para que el comercial le ponga precio). Al guardar, el armador las marca
  // cotizadas con el código nuevo (fn_cambiar_estado_sugerencia, con historial).
  let sugerencias: string[] | undefined;
  if (typeof sugerenciasParam === "string" && !datosIniciales && !oportunidad) {
    const ids = sugerenciasParam.split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
    if (ids.length > 0) {
      const { data: sugs } = await supabase
        .from("visita_sugerencias")
        .select(
          "id, descripcion, cantidad, unidad, item_catalogo_id, estado, visitas(titulo, cliente_id, cliente_nombre, direccion, contacto_sitio, telefono_sitio)",
        )
        .in("id", ids);
      // Solo las que siguen abiertas: una ya cotizada o descartada no se vuelve a cotizar.
      const vivas = (sugs ?? []).filter((s) => s.estado === "pendiente" || s.estado === "en_revision");
      if (vivas.length > 0) {
        const v0 = vivas[0].visitas;
        const visita = (Array.isArray(v0) ? v0[0] : v0) as {
          titulo: string;
          cliente_id: string | null;
          cliente_nombre: string | null;
          direccion: string | null;
          contacto_sitio: string | null;
          telefono_sitio: string | null;
        } | null;
        let cliente: ClienteResumen | null = null;
        if (visita?.cliente_id) {
          const { data } = await supabase
            .from("clientes")
            .select("id, nombre, nit, direccion, email, contacto, telefono")
            .eq("id", visita.cliente_id)
            .maybeSingle();
          cliente = (data as ClienteResumen | null) ?? null;
        }
        const porId = new Map(catalogo.map((i) => [i.id, i]));
        datosIniciales = {
          clienteId: cliente?.id ?? null,
          clienteNombre: cliente?.nombre ?? visita?.cliente_nombre ?? "",
          clienteNit: cliente?.nit ?? "",
          clienteDireccion: cliente?.direccion ?? visita?.direccion ?? "",
          clienteEmail: cliente?.email ?? "",
          clienteContacto: cliente?.contacto ?? visita?.contacto_sitio ?? "",
          clienteTelefono: cliente?.telefono ?? visita?.telefono_sitio ?? "",
          descripcion: visita?.titulo ?? "",
          comercial: "",
          esquemaIva: CONFIG_PRECIO_DEFAULT.esquemaIva,
          config: {
            pctAdmin: CONFIG_PRECIO_DEFAULT.pctAdmin,
            pctImprevistos: CONFIG_PRECIO_DEFAULT.pctImprevistos,
            pctUtilidadAiu: CONFIG_PRECIO_DEFAULT.pctUtilidadAiu,
            pctAdminGasto: CONFIG_PRECIO_DEFAULT.pctAdminGasto,
            pctComision: CONFIG_PRECIO_DEFAULT.pctComision,
            pctRenta: CONFIG_PRECIO_DEFAULT.pctRenta,
            icaPorMil: CONFIG_PRECIO_DEFAULT.icaPorMil,
            ivaPct: CONFIG_PRECIO_DEFAULT.ivaPct,
          },
          lineas: vivas.map((s) => {
            const item = s.item_catalogo_id ? porId.get(s.item_catalogo_id) : undefined;
            const cantidad = s.cantidad !== null && Number(s.cantidad) > 0 ? Number(s.cantidad) : 1;
            if (item) {
              return {
                categoria: item.categoria,
                itemCatalogoId: item.id,
                descripcion: item.nombreCorto,
                descripcionLarga: item.descripcion && item.descripcion !== item.nombreCorto ? item.descripcion : null,
                unidad: item.unidad,
                cantidad,
                valorCompraUnitario: item.valorCompraIva ?? 0,
                factorRentabilidadLinea: item.factorRentabilidadLinea,
              };
            }
            // Sin ítem del catálogo: el técnico lo escribió libre. Entra como material en
            // $0 (el armador avisa y no deja imprimir así); el comercial elige el ítem.
            return {
              categoria: "MATERIAL" as const,
              itemCatalogoId: null,
              descripcion: s.descripcion,
              descripcionLarga: null,
              unidad: s.unidad || "UNI",
              cantidad,
              valorCompraUnitario: 0,
              factorRentabilidadLinea: FACTORES_RENTABILIDAD_DEFAULT.MATERIAL,
            };
          }),
          hitos: [],
          polizas: [],
          diasEjecucion: null,
        };
        sugerencias = vivas.map((s) => s.id);
      }
    }
  }

  // Próximo código, solo para mostrarlo en la vista previa. Se LEE el contador, no se
  // asigna: el número de verdad lo pone fn_siguiente_codigo_cotizacion al guardar (si se
  // asignara acá, cada vista previa quemaría un consecutivo y dejaría huecos).
  let proximoCodigo: string | null = null;
  try {
    const anio = Number(
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric" }).format(new Date()),
    );
    const { data } = await supabase
      .from("cotizacion_consecutivos")
      .select("ultimo_numero")
      .eq("anio", anio)
      .maybeSingle();
    const siguiente = Number(data?.ultimo_numero ?? 0) + 1;
    proximoCodigo = `CSE-${String(anio % 100).padStart(2, "0")}-${String(siguiente).padStart(3, "0")}`;
  } catch {
    // Sin acceso al contador: la vista previa dice solo "borrador".
  }

  return (
    <CotizacionBuilder
      proximoCodigo={proximoCodigo}
      catalogoInicial={catalogo}
      polizasCatalogoInicial={polizasCatalogo}
      clientesIniciales={clientes}
      valoresAgregadosCatalogo={valoresAgregadosCatalogo}
      configuracionEmpresa={configuracionEmpresa}
      datosIniciales={datosIniciales}
      duplicarId={typeof duplicarId === "string" ? duplicarId : undefined}
      oportunidad={oportunidad}
      sugerencias={sugerencias}
    />
  );
}

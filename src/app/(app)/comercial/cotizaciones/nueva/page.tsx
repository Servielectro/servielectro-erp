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
import { CONFIG_PRECIO_DEFAULT } from "@/lib/pricing";
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

  return (
    <CotizacionBuilder
      catalogoInicial={catalogo}
      polizasCatalogoInicial={polizasCatalogo}
      clientesIniciales={clientes}
      valoresAgregadosCatalogo={valoresAgregadosCatalogo}
      configuracionEmpresa={configuracionEmpresa}
      datosIniciales={datosIniciales}
      duplicarId={typeof duplicarId === "string" ? duplicarId : undefined}
      oportunidad={oportunidad}
    />
  );
}

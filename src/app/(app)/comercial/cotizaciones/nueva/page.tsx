import { createClient } from "@/lib/supabase/server";
import { getCatalogoActivo, type CatalogoItem } from "@/lib/supabase/catalogo";
import { getCotizacionDetalle } from "@/lib/supabase/cotizaciones";
import {
  getConfiguracionEmpresa,
  getPolizasCatalogo,
  type ConfiguracionEmpresa,
  type PolizaCatalogo,
} from "@/lib/supabase/condicionesComerciales";
import { CONFIG_PRECIO_DEFAULT } from "@/lib/pricing";
import { CotizacionBuilder, type DatosIniciales } from "./CotizacionBuilder";

export default async function NuevaCotizacionPage(
  props: PageProps<"/comercial/cotizaciones/nueva">,
) {
  const supabase = await createClient();
  const searchParams = await props.searchParams;
  const duplicarId = searchParams.duplicar;

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

  let datosIniciales: DatosIniciales | undefined;
  if (typeof duplicarId === "string") {
    try {
      const original = await getCotizacionDetalle(supabase, duplicarId);
      if (original) {
        datosIniciales = {
          clienteNombre: original.cliente.nombre,
          clienteNit: original.cliente.nit ?? "",
          clienteDireccion: original.cliente.direccion ?? "",
          clienteEmail: original.cliente.email ?? "",
          clienteContacto: original.cliente.contacto ?? "",
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

  return (
    <CotizacionBuilder
      catalogoInicial={catalogo}
      polizasCatalogoInicial={polizasCatalogo}
      configuracionEmpresa={configuracionEmpresa}
      datosIniciales={datosIniciales}
    />
  );
}

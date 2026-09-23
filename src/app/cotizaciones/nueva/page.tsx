import { createClient } from "@/lib/supabase/server";
import { getCatalogoActivo, type CatalogoItem } from "@/lib/supabase/catalogo";
import { getCotizacionDetalle } from "@/lib/supabase/cotizaciones";
import { CotizacionBuilder, type DatosIniciales } from "./CotizacionBuilder";

export default async function NuevaCotizacionPage(
  props: PageProps<"/cotizaciones/nueva">,
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
            factorRecargoProyecto: original.factorRecargoProyecto,
            pctAdmin: original.pctAdmin,
            pctImprevistos: original.pctImprevistos,
            pctUtilidadAiu: original.pctUtilidadAiu,
            ivaPct: original.ivaPct,
          },
          lineas: original.items.map((it) => ({
            categoria: it.categoria,
            itemCatalogoId: null,
            descripcion: it.descripcion,
            unidad: it.unidad,
            cantidad: it.cantidad,
            valorCompraUnitario: it.valorCompraUnitario,
            factorRentabilidadLinea: it.factorRentabilidadLinea,
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
      datosIniciales={datosIniciales}
    />
  );
}

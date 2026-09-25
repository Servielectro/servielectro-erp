import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCotizacionDetalle } from "@/lib/supabase/cotizaciones";
import { getConfiguracionEmpresa } from "@/lib/supabase/condicionesComerciales";
import { FormatoCotizacion } from "@/components/cotizacion/FormatoCotizacion";
import { PrintButton } from "./PrintButton";

export default async function ImprimirCotizacionPage(
  props: PageProps<"/cotizaciones/[id]/imprimir">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const cotizacion = await getCotizacionDetalle(supabase, id);

  if (!cotizacion) {
    notFound();
  }

  const configuracionEmpresa = await getConfiguracionEmpresa(supabase);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-3xl pt-4 print:hidden">
        <div className="mb-4 flex justify-end">
          <PrintButton />
        </div>
      </div>

      <FormatoCotizacion
        codigo={cotizacion.codigo}
        fecha={cotizacion.fechaEmision}
        comercial={cotizacion.comercial}
        proyecto={cotizacion.descripcion}
        cliente={{
          nombre: cotizacion.cliente.nombre,
          nit: cotizacion.cliente.nit,
          direccion: cotizacion.cliente.direccion,
          email: cotizacion.cliente.email,
          contacto: cotizacion.cliente.contacto || cotizacion.cliente.telefono,
        }}
        items={cotizacion.items.map((it) => ({
          id: it.id,
          categoria: it.categoria,
          descripcion: it.descripcion,
          descripcionLarga: it.descripcionLarga,
          cantidad: it.cantidad,
          unidad: it.unidad,
          valorCalculoUnitario: it.valorCalculoUnitario,
        }))}
        totales={
          cotizacion.totales
            ? {
                subtotalCalculo: cotizacion.totales.subtotalCalculo,
                valorAdmin: cotizacion.totales.valorAdmin,
                valorImprevistos: cotizacion.totales.valorImprevistos,
                valorUtilidadAiu: cotizacion.totales.valorUtilidadAiu,
                subtotalGeneral: cotizacion.totales.subtotalGeneral,
                valorIva: cotizacion.totales.valorIva,
                total: cotizacion.totales.totalCotizacion,
              }
            : null
        }
        hitos={cotizacion.hitos}
        configuracionEmpresa={configuracionEmpresa}
        polizas={cotizacion.polizas.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          pct: p.pct,
          vigenciaMeses: p.vigenciaMeses,
        }))}
      />
    </div>
  );
}

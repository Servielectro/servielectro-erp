import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCotizacionDetalle } from "@/lib/supabase/cotizaciones";
import { getConfiguracionEmpresa } from "@/lib/supabase/condicionesComerciales";
import { FormatoCotizacion } from "@/components/cotizacion/FormatoCotizacion";
import { AjusteAncho } from "@/components/cotizacion/AjusteAncho";
import { PrintButton } from "./PrintButton";

export default async function ImprimirCotizacionPage(
  props: PageProps<"/comercial/cotizaciones/[id]/imprimir">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const cotizacion = await getCotizacionDetalle(supabase, id);

  if (!cotizacion) {
    notFound();
  }

  const configuracionEmpresa = await getConfiguracionEmpresa(supabase);

  // Una línea en $0 nunca sale hacia el cliente: sin botón de imprimir, y si igual se
  // imprime con Ctrl+P, la hoja dice "incompleta" en vez de mostrar el documento.
  const lineasEnCero = cotizacion.items.filter(
    (it) => !(it.valorCompraUnitario > 0) || !(it.valorCalculoUnitario > 0),
  );
  const bloqueada = lineasEnCero.length > 0;

  return (
    <div className="min-h-screen bg-slate-100 px-2 pb-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl pt-4 print:hidden">
        {bloqueada ? (
          <div className="mx-2 mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">
              No se puede imprimir ni enviar: {lineasEnCero.length}{" "}
              {lineasEnCero.length === 1 ? "línea está" : "líneas están"} en $0.
            </p>
            <ul className="mt-1 list-disc pl-5">
              {lineasEnCero.map((it) => (
                <li key={it.id}>{it.descripcion}</li>
              ))}
            </ul>
            <p className="mt-2">
              Para terminarla: vuelve a la cotización, usa &quot;Duplicar&quot;, completa los
              precios y guarda (queda con número nuevo).
            </p>
          </div>
        ) : (
          <div className="mb-4 flex justify-end">
            <PrintButton />
          </div>
        )}
      </div>

      {bloqueada && (
        <p className="hidden p-10 text-center text-lg font-bold print:block">
          COTIZACIÓN INCOMPLETA — tiene líneas en $0. No enviar al cliente.
        </p>
      )}

      <div className={bloqueada ? "print:hidden" : undefined}>
      <AjusteAncho>
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
          contacto: cotizacion.cliente.contacto,
          telefono: cotizacion.cliente.telefono,
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
        porcentajes={{
          admin: cotizacion.pctAdmin,
          imprevistos: cotizacion.pctImprevistos,
          utilidad: cotizacion.pctUtilidadAiu,
          iva: cotizacion.ivaPct,
        }}
        diasEjecucion={cotizacion.diasEjecucion}
        hitos={cotizacion.hitos}
        configuracionEmpresa={configuracionEmpresa}
        polizas={cotizacion.polizas.map((p) => ({
          id: p.id,
          nombre: p.nombre,
        }))}
      />
      </AjusteAncho>
      </div>
    </div>
  );
}

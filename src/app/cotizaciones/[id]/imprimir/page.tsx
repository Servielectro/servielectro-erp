import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCotizacionDetalle } from "@/lib/supabase/cotizaciones";
import { formatCOP, type Categoria } from "@/lib/pricing";
import { PrintButton } from "./PrintButton";

const CATEGORIA_LABEL: Record<Categoria, string> = {
  EQUIPO: "Equipos",
  MATERIAL: "Materiales",
  MANO_DE_OBRA: "Mano de obra",
};

export default async function ImprimirCotizacionPage(
  props: PageProps<"/cotizaciones/[id]/imprimir">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const cotizacion = await getCotizacionDetalle(supabase, id);

  if (!cotizacion) {
    notFound();
  }

  const categorias: Categoria[] = ["EQUIPO", "MATERIAL", "MANO_DE_OBRA"];

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-3xl bg-white p-8 shadow-sm print:shadow-none">
        <div className="mb-4 flex justify-end print:hidden">
          <PrintButton />
        </div>

        <header className="mb-6 border-b-2 border-slate-900 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Servielectro SAS
              </h1>
              <p className="text-sm text-slate-500">
                Cotización {cotizacion.codigo}
              </p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <p>
                Fecha:{" "}
                {new Date(cotizacion.fechaEmision).toLocaleDateString(
                  "es-CO",
                )}
              </p>
              {cotizacion.comercial && <p>Comercial: {cotizacion.comercial}</p>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <p>
              <span className="font-medium text-slate-700">Proyecto: </span>
              {cotizacion.descripcion}
            </p>
            <p>
              <span className="font-medium text-slate-700">Cliente: </span>
              {cotizacion.cliente.nombre}
            </p>
            <p>
              <span className="font-medium text-slate-700">NIT: </span>
              {cotizacion.cliente.nit || "—"}
            </p>
            <p>
              <span className="font-medium text-slate-700">Dirección: </span>
              {cotizacion.cliente.direccion || "—"}
            </p>
            <p>
              <span className="font-medium text-slate-700">Correo: </span>
              {cotizacion.cliente.email || "—"}
            </p>
            <p>
              <span className="font-medium text-slate-700">Contacto: </span>
              {cotizacion.cliente.contacto || cotizacion.cliente.telefono || "—"}
            </p>
          </div>
        </header>

        {categorias.map((cat) => {
          const items = cotizacion.items.filter((i) => i.categoria === cat);
          if (items.length === 0) return null;
          const subtotal = items.reduce(
            (acc, i) => acc + i.valorCalculoUnitario * i.cantidad,
            0,
          );
          return (
            <section key={cat} className="mb-5">
              <h2 className="mb-1 text-sm font-bold uppercase text-slate-700">
                {CATEGORIA_LABEL[cat]}
              </h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs text-slate-500">
                    <th className="py-1">Descripción</th>
                    <th className="py-1 text-right">Cant.</th>
                    <th className="py-1 text-right">Unidad</th>
                    <th className="py-1 text-right">Valor unitario</th>
                    <th className="py-1 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">{it.descripcion}</td>
                      <td className="py-1.5 text-right">{it.cantidad}</td>
                      <td className="py-1.5 text-right">{it.unidad}</td>
                      <td className="py-1.5 text-right">
                        {formatCOP(it.valorCalculoUnitario)}
                      </td>
                      <td className="py-1.5 text-right font-medium">
                        {formatCOP(it.valorCalculoUnitario * it.cantidad)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-right text-sm font-semibold text-slate-800">
                Subtotal {CATEGORIA_LABEL[cat]}: {formatCOP(subtotal)}
              </p>
            </section>
          );
        })}

        {cotizacion.totales && (
          <section className="ml-auto mt-6 w-full max-w-xs space-y-1 text-sm">
            <FilaTotal
              label="Subtotal"
              valor={cotizacion.totales.subtotalCalculo}
            />
            <FilaTotal label="Administración" valor={cotizacion.totales.valorAdmin} />
            <FilaTotal
              label="Imprevistos"
              valor={cotizacion.totales.valorImprevistos}
            />
            <FilaTotal
              label="Utilidad"
              valor={cotizacion.totales.valorUtilidadAiu}
            />
            <div className="flex justify-between border-t border-slate-300 pt-1 font-medium text-slate-800">
              <span>Subtotal general</span>
              <span>{formatCOP(cotizacion.totales.subtotalGeneral)}</span>
            </div>
            <FilaTotal label="IVA" valor={cotizacion.totales.valorIva} />
            <div className="flex justify-between border-t-2 border-slate-900 pt-1 text-base font-bold text-slate-900">
              <span>TOTAL</span>
              <span>{formatCOP(cotizacion.totales.totalCotizacion)}</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function FilaTotal({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>{formatCOP(valor)}</span>
    </div>
  );
}

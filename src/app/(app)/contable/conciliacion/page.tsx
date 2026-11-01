import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { corteDe } from "@/lib/siigo";
import { EncabezadoSiigo } from "@/components/siigo/Corte";

interface Fila {
  donde: "solo_en_siigo" | "solo_en_erp";
  identificacion: string | null;
  nombre: string;
  cliente_id: string | null;
}

/**
 * Conciliación (v_siigo_terceros_sin_cruzar): clientes que están en Siigo y no en el ERP, y al
 * revés. Se corrige en el lado que esté mal: un cliente nuevo se crea en el ERP; un NIT mal
 * escrito en Siigo se corrige en Siigo.
 */
export default async function ConciliacionPage() {
  const supabase = await createClient();
  const [al, res] = await Promise.all([corteDe(supabase, "siigo_terceros"), supabase.from("v_siigo_terceros_sin_cruzar").select("*").order("nombre").limit(2000)]);
  const filas = (res.data ?? []) as Fila[];
  const soloSiigo = filas.filter((f) => f.donde === "solo_en_siigo");
  const soloErp = filas.filter((f) => f.donde === "solo_en_erp");

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <EncabezadoSiigo volver="contable" titulo="Conciliación con el ERP" al={al}>
        Los clientes se cruzan por NIT. Donde no cruzan, las facturas de Siigo no se pueden pegar a la cotización ni al proyecto del ERP, y la rentabilidad de esa obra queda incompleta.
      </EncabezadoSiigo>
      {res.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer: {res.error.message}</p>}
      {/* Sin terceros sincronizados, la vista pondría a TODOS los clientes del ERP como "solo en el ERP". */}
      {al && (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          <Lista
            titulo={`En Siigo y no en el ERP (${soloSiigo.length})`}
            ayuda="Clientes activos de Siigo sin ficha en el ERP. Si se les cotiza o se les hace un proyecto, conviene crearlos con el mismo NIT."
            filas={soloSiigo}
          />
          <Lista
            titulo={`En el ERP y no en Siigo (${soloErp.length})`}
            ayuda="Clientes del ERP cuyo NIT no aparece en Siigo: o nunca se les facturó, o el NIT está escrito distinto en un lado."
            filas={soloErp}
          />
        </div>
      )}
    </div>
  );
}

function Lista({ titulo, ayuda, filas }: { titulo: string; ayuda: string; filas: Fila[] }) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
      <p className="mb-2 text-xs text-slate-600">{ayuda}</p>
      {!filas.length ? (
        <p className="py-3 text-center text-sm text-green-800">✓ Nada pendiente.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filas.map((f, i) => (
            <li key={`${f.identificacion}-${i}`} className="flex min-h-11 items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1">
                {f.cliente_id ? (
                  <Link href={`/administrativo/clientes/${f.cliente_id}`} className="hover:underline">
                    {f.nombre}
                  </Link>
                ) : (
                  f.nombre
                )}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{f.identificacion ? `NIT ${f.identificacion}` : "sin NIT"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

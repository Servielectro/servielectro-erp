import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { corteDe, formatoPesos } from "@/lib/siigo";
import { EncabezadoSiigo } from "@/components/siigo/Corte";

const GRANOS = [
  { key: "dia", label: "Día" },
  { key: "mes", label: "Mes" },
  { key: "bimestre", label: "Bimestre" },
  { key: "cuatrimestre", label: "Cuatrimestre" },
  { key: "anio", label: "Año" },
] as const;

interface Periodo {
  periodo: string;
  inicio: string;
  facturas: number;
  base: number | null;
  impuestos: number | null;
  total: number | null;
}
interface PorCliente {
  cliente: string;
  identificacion: string | null;
  cliente_id: string | null;
  facturas: number;
  total: number;
  ultima: string;
}
interface PorItem {
  codigo: string | null;
  descripcion: string | null;
  facturas: number;
  cantidad: number | null;
  total: number | null;
}

/** Ventas (v_siigo_ventas y sus cortes por cliente e ítem): sale de las facturas de venta de Siigo. */
export default async function VentasPage(props: PageProps<"/financiero/ventas">) {
  const sp = await props.searchParams;
  const grano = (GRANOS.find((g) => g.key === sp.grano)?.key ?? "mes") as (typeof GRANOS)[number]["key"];
  const supabase = await createClient();
  const [al, perRes, cliRes, itemRes] = await Promise.all([
    corteDe(supabase, "siigo_facturas"),
    supabase.from("v_siigo_ventas").select("periodo, inicio, facturas, base, impuestos, total").eq("grano", grano).order("inicio", { ascending: false }).limit(grano === "dia" ? 60 : 36),
    supabase.from("v_siigo_ventas_por_cliente").select("*").order("total", { ascending: false }).limit(15),
    supabase.from("v_siigo_ventas_por_item").select("codigo, descripcion, facturas, cantidad, total").order("total", { ascending: false }).limit(15),
  ]);
  const periodos = (perRes.data ?? []) as Periodo[];
  const max = Math.max(1, ...periodos.map((p) => Number(p.total ?? 0)));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-6xl">
      <EncabezadoSiigo volver="financiero" titulo="Ventas" al={al}>
        Lo facturado en Siigo. «Base» es antes de impuestos; las notas crédito no se restan aquí: se ven en Facturación.
      </EncabezadoSiigo>
      {al && (
        <>
          <nav className="flex flex-wrap gap-1.5">
            {GRANOS.map((g) => (
              <Link key={g.key} href={`/financiero/ventas?grano=${g.key}`} className={`flex min-h-9 items-center rounded-full border px-3 text-sm ${g.key === grano ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>
                {g.label}
              </Link>
            ))}
          </nav>
          {perRes.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer: {perRes.error.message}</p>}
          <section className="rounded-lg border border-slate-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-bold text-slate-900">Por {GRANOS.find((g) => g.key === grano)?.label.toLowerCase()}</h2>
            {!periodos.length ? (
              <p className="py-3 text-center text-sm text-slate-500">No hay facturas de venta.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1 font-semibold">Periodo</th>
                    <th className="py-1 text-right font-semibold">Fact.</th>
                    <th className="hidden py-1 text-right font-semibold sm:table-cell">Base</th>
                    <th className="hidden py-1 text-right font-semibold sm:table-cell">Impuestos</th>
                    <th className="py-1 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {periodos.map((p) => (
                    <tr key={p.periodo} className="border-t border-slate-100">
                      <td className="py-1.5">
                        {p.periodo}
                        <div className="mt-0.5 h-1.5 rounded bg-slate-100">
                          <div className="h-1.5 rounded bg-slate-500" style={{ width: `${(Number(p.total ?? 0) / max) * 100}%` }} />
                        </div>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{p.facturas}</td>
                      <td className="hidden py-1.5 text-right tabular-nums sm:table-cell">{formatoPesos(p.base)}</td>
                      <td className="hidden py-1.5 text-right tabular-nums sm:table-cell">{formatoPesos(p.impuestos)}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{formatoPesos(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            <section className="rounded-lg border border-slate-300 bg-white p-3">
              <h2 className="mb-2 text-sm font-bold text-slate-900">A quién se le vende más</h2>
              <ul className="divide-y divide-slate-100">
                {((cliRes.data ?? []) as PorCliente[]).map((c) => (
                  <li key={`${c.identificacion}`} className="flex items-start gap-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1">
                      {c.cliente_id ? (
                        <Link href={`/administrativo/clientes/${c.cliente_id}`} className="hover:underline">
                          {c.cliente}
                        </Link>
                      ) : (
                        c.cliente
                      )}
                      <span className="block text-xs text-slate-500">
                        {c.facturas} factura{c.facturas === 1 ? "" : "s"} · última {c.ultima}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatoPesos(c.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-lg border border-slate-300 bg-white p-3">
              <h2 className="mb-2 text-sm font-bold text-slate-900">Qué se vende más</h2>
              <ul className="divide-y divide-slate-100">
                {((itemRes.data ?? []) as PorItem[]).map((i, n) => (
                  <li key={`${i.codigo}-${n}`} className="flex items-start gap-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1">
                      {i.descripcion ?? i.codigo ?? "—"}
                      <span className="block text-xs text-slate-500">
                        {[i.codigo, `${i.facturas} factura${i.facturas === 1 ? "" : "s"}`, i.cantidad != null && `${Number(i.cantidad).toLocaleString("es-CO")} und.`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatoPesos(i.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

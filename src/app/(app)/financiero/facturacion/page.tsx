import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { corteDe, formatoPesos } from "@/lib/siigo";
import { fechaCorta } from "@/lib/marketing";
import { EncabezadoSiigo } from "@/components/siigo/Corte";

const TIPOS_FACTURA = [
  { key: "venta", label: "Ventas" },
  { key: "nota_credito", label: "Notas crédito" },
  { key: "compra", label: "Compras" },
  { key: "documento_soporte", label: "Documentos soporte" },
] as const;

interface Factura {
  siigo_id: string;
  prefijo: string | null;
  numero: string | null;
  fecha: string;
  identificacion: string | null;
  total: number | null;
  saldo: number | null;
  estado: string | null;
  siigo_terceros: { nombre: string } | null;
  proyectos: { codigo: string } | null;
}

/** Facturas de Siigo (siigo_facturas). Se emiten en Siigo; aquí solo se consultan. */
export default async function FacturacionPage(props: PageProps<"/financiero/facturacion">) {
  const sp = await props.searchParams;
  const tipo = (TIPOS_FACTURA.find((t) => t.key === sp.tipo)?.key ?? "venta") as (typeof TIPOS_FACTURA)[number]["key"];
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : "";
  const conSaldo = sp.saldo === "1";
  const supabase = await createClient();
  let consulta = supabase
    .from("siigo_facturas")
    .select("siigo_id, prefijo, numero, fecha, identificacion, total, saldo, estado, siigo_terceros(nombre), proyectos(codigo)")
    .eq("tipo", tipo)
    .order("fecha", { ascending: false })
    .limit(300);
  if (mes) {
    const [a, m] = mes.split("-").map(Number);
    const fin = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    consulta = consulta.gte("fecha", `${mes}-01`).lt("fecha", fin);
  }
  if (conSaldo) consulta = consulta.gt("saldo", 0);
  const [al, res] = await Promise.all([corteDe(supabase, "siigo_facturas"), consulta]);
  const filas = (res.data ?? []) as unknown as Factura[];
  const enlace = (cambios: Record<string, string>) => {
    const q = new URLSearchParams({ tipo, ...(mes ? { mes } : {}), ...(conSaldo ? { saldo: "1" } : {}), ...cambios });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/financiero/facturacion?${q}`;
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <EncabezadoSiigo volver="financiero" titulo="Facturación" al={al}>
        Las facturas se hacen en Siigo: es la que vale ante la DIAN. Aquí se buscan y se ve a qué proyecto del ERP quedaron pegadas.
      </EncabezadoSiigo>
      {al && (
        <>
          <nav className="flex flex-wrap gap-1.5">
            {TIPOS_FACTURA.map((t) => (
              <Link key={t.key} href={enlace({ tipo: t.key })} className={`flex min-h-9 items-center rounded-full border px-3 text-sm ${t.key === tipo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>
                {t.label}
              </Link>
            ))}
          </nav>
          <form action="/financiero/facturacion" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tipo" value={tipo} />
            <label className="text-xs font-semibold text-slate-700">
              Mes
              <input type="month" name="mes" defaultValue={mes} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-base font-normal" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="saldo" value="1" defaultChecked={conSaldo} className="h-5 w-5" />
              Solo con saldo pendiente
            </label>
            <button className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Filtrar</button>
          </form>
          {res.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer: {res.error.message}</p>}
          {!filas.length ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay documentos con ese filtro.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-300 bg-white">
              {filas.map((f) => (
                <li key={f.siigo_id}>
                  <Link href={`/financiero/facturacion/${encodeURIComponent(f.siigo_id)}`} className="flex min-h-11 items-start gap-2 p-3 active:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">
                        {[f.prefijo, f.numero].filter(Boolean).join("-") || "Sin número"} · {f.siigo_terceros?.nombre ?? f.identificacion ?? "—"}
                      </span>
                      <span className="block text-xs text-slate-600">
                        {[fechaCorta(f.fecha), f.estado, f.proyectos ? `Proyecto ${f.proyectos.codigo}` : "sin proyecto"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="block font-semibold tabular-nums">{formatoPesos(f.total)}</span>
                      {Number(f.saldo ?? 0) > 0 && <span className="block text-xs tabular-nums text-amber-800">saldo {formatoPesos(f.saldo)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {filas.length === 300 && <p className="text-center text-xs text-slate-500">Se muestran las 300 más recientes: filtrar por mes para ver otras.</p>}
        </>
      )}
    </div>
  );
}

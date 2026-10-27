import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCotizacionesListado } from "@/lib/supabase/cotizaciones";
import { formatCOP } from "@/lib/pricing";
import { avisos, ESTADO_COTIZACION, type AlertaCotizacion } from "@/lib/cotizaciones/seguimiento";

export default async function CotizacionesListadoPage() {
  const supabase = await createClient();

  let cotizaciones: Awaited<ReturnType<typeof getCotizacionesListado>> = [];
  let error: string | null = null;
  try {
    cotizaciones = await getCotizacionesListado(supabase);
  } catch (err) {
    error = err instanceof Error ? err.message : "Error desconocido";
  }
  // Alertas del seguimiento (migración 99): validez vencida, paso vencido, sin paso. Sin la 99, nada.
  const alertasRes = await supabase.from("v_cotizaciones_alertas").select("*");
  const alertas = new Map(((alertasRes.error ? [] : alertasRes.data) as AlertaCotizacion[]).map((a) => [a.cotizacion_id, a]));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-slate-900">Cotizaciones</h1>
        <Link
          href="/comercial/cotizaciones/nueva"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          + Nueva
        </Link>
      </header>

      <main className="flex-1 space-y-3 p-4">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            No se pudo cargar el listado ({error}).
          </p>
        )}

        {!error && cotizaciones.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-600">
            Todavía no hay cotizaciones guardadas.
          </p>
        )}

        {cotizaciones.map((c) => (
          <Link
            key={c.id}
            href={`/comercial/cotizaciones/${c.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-mono text-slate-600">{c.codigo}</p>
                <p className="text-base font-medium text-slate-900">
                  {c.clienteNombre}
                </p>
                <p className="text-sm text-slate-600">{c.descripcion}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${ESTADO_COTIZACION[c.estado]?.clase ?? "bg-slate-100 text-slate-700"}`}
              >
                {ESTADO_COTIZACION[c.estado]?.etiqueta ?? c.estado}
              </span>
            </div>
            {avisos(alertas.get(c.id)).map((a) => (
              <p key={a.texto} className={`mt-1 text-xs ${a.grave ? "font-semibold text-red-700" : "text-amber-800"}`}>
                {a.grave ? "⚠ " : ""}
                {a.texto}
              </p>
            ))}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {new Date(c.fechaEmision).toLocaleDateString("es-CO")} ·{" "}
                {c.esquemaIva === "IVA_AIU" ? "IVA AIU" : "IVA FULL"}
              </span>
              <span className="font-semibold text-slate-900">
                {c.totalCotizacion !== null
                  ? formatCOP(c.totalCotizacion)
                  : "—"}
              </span>
            </div>
          </Link>
        ))}
      </main>
    </div>
  );
}

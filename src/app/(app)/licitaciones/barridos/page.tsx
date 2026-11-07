import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Barrido, formatoFechaHora } from "@/lib/licitaciones/radar";

// Historial de búsqueda: cada corrida del radar (licitacion_barridos), con lo que leyó y lo que
// encontró. Una corrida sin «terminó» ni error = se cortó a la mitad (timeout de la función).
export default async function BarridosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("licitacion_barridos")
    .select("id, iniciado_en, terminado_en, ventana_desde, leidos, con_actividad, relevantes, nuevos, sin_rup, con_token, error")
    .order("iniciado_en", { ascending: false })
    .limit(60);
  const filas = (data ?? []) as Barrido[];
  const ahora = new Date().getTime(); // componente de servidor: se pinta una vez por solicitud
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/licitaciones" className="text-sm text-slate-600 underline">
        ← Licitaciones
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Historial de búsqueda</h1>
      <p className="text-sm text-slate-600">
        Cada búsqueda baja de Datos Abiertos los procesos abiertos de SECOP II publicados en la ventana, y la base decide cuáles son
        nuestros. Volver a ver un proceso solo lo actualiza: no se duplica.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo leer el historial: {error.message}</p>}
      {!error && filas.length === 0 && (
        <p className="rounded-lg border border-slate-300 bg-white p-4 text-center text-sm text-slate-600">
          Todavía no ha corrido ninguna búsqueda. La búsqueda automática diaria aún no está encendida.
        </p>
      )}
      <ul className="space-y-2">
        {filas.map((b) => {
          const cortada = !b.terminado_en && !b.error && ahora - new Date(b.iniciado_en).getTime() > 10 * 60 * 1000;
          const estado = b.error ? "Falló" : b.terminado_en ? "Terminó" : cortada ? "Se cortó" : "Corriendo";
          const color = b.error || cortada ? "bg-red-100 text-red-800" : b.terminado_en ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900";
          return (
            <li key={b.id} className="rounded-lg border border-slate-300 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${color}`}>{estado}</span>
                <span className="text-sm font-semibold text-slate-900">{formatoFechaHora(new Date(b.iniciado_en))}</span>
                {b.ventana_desde && (
                  <span className="text-xs text-slate-600">publicados desde {new Date(b.ventana_desde).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {b.leidos.toLocaleString("es-CO")} leídos · {b.con_actividad} con nuestra actividad · <b>{b.relevantes} relevantes</b> ·{" "}
                <b className="text-emerald-700">{b.sin_rup} sin RUP</b> · {b.nuevos} nuevos
              </p>
              {b.error && <p className="mt-1 text-xs text-red-700">{b.error}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

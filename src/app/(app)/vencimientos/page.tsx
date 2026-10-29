import Link from "next/link";
import { ESTADO_VENC, FilaVencimiento, leerVencimientos, NOMBRE_MODULO_VENC, type Vencimiento } from "@/components/vencimientos/Vencimientos";

/**
 * Todo lo que se vence (migraciones 119 y 122), agrupado por estado: vencido, hoy, por vencer. Cada
 * quien ve lo de sus módulos (la vista es security_invoker). Los contadores por módulo filtran.
 */
export default async function VencimientosPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  const { modulo } = await searchParams;
  const { lista: todos, error } = await leerVencimientos();
  const modulos = [...new Set(todos.map((v) => v.modulo))];
  const lista = modulo ? todos.filter((v) => v.modulo === modulo) : todos;
  const chip = (activo: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/" className="text-sm text-slate-600 underline">
        ← Inicio
      </Link>
      <div>
        <h1 className="text-lg font-bold text-slate-900">Vencimientos</h1>
        <p className="text-sm text-slate-600">Certificados, exámenes, afiliaciones, EPP, equipos, pólizas, planillas, contratos, el plan de SG-SST y tareas con fecha.</p>
      </div>
      {error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer los vencimientos: {error}</p>
      ) : (
        <>
          {modulos.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Link href="/vencimientos" className={chip(!modulo)}>
                Todo · {todos.length}
              </Link>
              {modulos.map((m) => (
                <Link key={m} href={`/vencimientos?modulo=${m}`} className={chip(modulo === m)}>
                  {NOMBRE_MODULO_VENC[m] ?? m} · {todos.filter((v) => v.modulo === m).length}
                </Link>
              ))}
            </div>
          )}
          {lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">Nada vencido ni por vencer.</p>
          ) : (
            (["vencido", "hoy", "por_vencer"] as Vencimiento["estado"][]).map((s) => {
              const grupo = lista.filter((v) => v.estado === s);
              if (!grupo.length) return null;
              return (
                <section key={s} className="space-y-1.5">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    {ESTADO_VENC[s].nombre} · {grupo.length}
                  </h2>
                  <ul className="space-y-1.5">
                    {grupo.map((v) => (
                      <FilaVencimiento key={`${v.origen_tabla}-${v.origen_id}`} v={v} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

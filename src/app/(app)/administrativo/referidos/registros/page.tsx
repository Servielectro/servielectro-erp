import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { ListaRegistros, type RegistroVista } from "./Registros";

const FILTROS = [
  { key: "vigente", label: "Vigentes" },
  { key: "por-vencer", label: "Vencen en 15 días" },
  { key: "vencido", label: "Vencidos" },
  { key: "ganado", label: "Ganados" },
  { key: "perdido", label: "Perdidos" },
  { key: "todos", label: "Todos" },
] as const;

/** Registros de oportunidad (migración 127): qué prospecto es de qué referido y hasta cuándo. */
export default async function RegistrosPage(props: PageProps<"/administrativo/referidos/registros">) {
  const sp = await props.searchParams;
  const filtro = (FILTROS.find((x) => x.key === sp.ver)?.key ?? "vigente") as (typeof FILTROS)[number]["key"];
  const supabase = await createClient();
  const [escribe, res] = await Promise.all([
    tienePermiso("administrativo", "trabajar"),
    supabase.from("v_referido_registros").select("*").order("vence_el", { ascending: true }).limit(1000),
  ]);
  const todos = (res.data ?? []) as RegistroVista[];
  const filas = todos.filter((g) => {
    if (filtro === "todos") return true;
    if (filtro === "por-vencer") return g.estado_real === "vigente" && g.dias_restantes <= 15;
    return g.estado_real === filtro;
  });
  // Vencidos por fecha que siguen "vigentes" en la tabla: bloquean el prospecto para otro referido.
  const sinMarcar = todos.filter((g) => g.estado === "vigente" && g.estado_real === "vencido").length;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/administrativo/referidos" className="text-sm text-slate-600 underline">
        ← Referenciados
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Registros de oportunidad</h1>
      <p className="text-xs text-slate-600">
        Cada prospecto queda a nombre de un solo referido mientras su registro esté vigente. Pasada la fecha, el referido ya no puede cobrar por ese cliente si llega solo.
      </p>
      {sinMarcar > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {sinMarcar} registro{sinMarcar === 1 ? "" : "s"} ya pasaron su fecha pero siguen sin marcar como vencidos.{" "}
          <Link href="/administrativo/referidos/registros?ver=vencido" className="font-semibold underline">
            Ver
          </Link>
        </p>
      )}
      <nav className="flex flex-wrap gap-1.5">
        {FILTROS.map((x) => (
          <Link
            key={x.key}
            href={`/administrativo/referidos/registros?ver=${x.key}`}
            className={`flex min-h-9 items-center rounded-full border px-3 text-sm ${x.key === filtro ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {res.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer los registros: {res.error.message}</p>
      ) : (
        <>
          <ListaRegistros registros={filas} escribe={escribe} conReferido />
          <p className="text-xs text-slate-500">Para registrar un prospecto nuevo, se entra a la ficha del referido.</p>
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { PESTANAS } from "@/lib/personal";
import { FICHA_VACIA, TabDatos } from "../TabDatos";

// Nuevo empleado: primero los datos. Como en NEXGO, "guarde la ficha para asignar dotación,
// generar carnet, liquidar o emitir desprendibles": las demás pestañas aparecen al guardar.
export default async function NuevoEmpleadoPage() {
  const supabase = await createClient();
  const [{ data: veTodo }, vigentes] = await Promise.all([supabase.rpc("fn_rrhh_ve_todo"), supabase.rpc("fn_parametros_vigentes")]);
  if (veTodo !== true) {
    return (
      <MarcoRrhh titulo="Nuevo empleado">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Crear fichas del personal requiere RRHH en nivel “trabajar”.</p>
      </MarcoRrhh>
    );
  }
  const auxilio = ((vigentes.data ?? []) as { clave: string; valor: number | null }[]).find((p) => p.clave === "auxilio_transporte")?.valor ?? null;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Link href="/rrhh/personal" className="mb-1 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600">
        ← Personal
      </Link>
      <h1 className="mb-2 text-lg font-bold text-slate-900">Nuevo empleado</h1>
      <p className="mb-2 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">
        Guarde la ficha para asignar dotación, enlazar el usuario del ERP, generar carnet, registrar liquidaciones o emitir desprendibles.
      </p>
      <nav className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 pb-1">
        {PESTANAS.map((p) => (
          <span
            key={p.id}
            className={`flex min-h-9 shrink-0 items-center rounded-md border px-3 text-xs font-semibold ${
              p.id === "datos" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
            title={p.id === "datos" ? undefined : "Guarde la ficha primero"}
          >
            {p.nombre}
          </span>
        ))}
      </nav>
      <TabDatos inicial={FICHA_VACIA} auxilioEmpresa={auxilio === null ? null : Number(auxilio)} auxilioPropio={null} />
    </div>
  );
}

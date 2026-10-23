import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarcoRrhh } from "@/components/rrhh/FiltrosRrhh";
import { FICHA_VACIA, TabDatos } from "../TabDatos";
import { PestanasNuevo } from "./PestanasNuevo";

// Nuevo empleado: primero los datos. Como en NEXGO, "guarde la ficha para asignar dotación,
// generar carnet, liquidar o emitir desprendibles": las demás pestañas aparecen al guardar. Se
// dice como un paso (no como nota al pie) y tocar una pestaña apagada explica qué hacer.
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
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/rrhh/personal" className="mb-1 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600">
        ← Personal
      </Link>
      <h1 className="mb-2 text-lg font-bold text-slate-900">Nuevo empleado</h1>
      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
        <p className="text-sm font-semibold">Paso 1 de 2: llena los datos y toca “Guardar ficha”.</p>
        <p className="text-sm">
          Al guardar se habilitan las demás pestañas: hoja de vida, contrato, usuario del ERP, dotación, liquidaciones, desprendibles y caja menor.
        </p>
      </div>
      <PestanasNuevo />
      <TabDatos inicial={FICHA_VACIA} auxilioEmpresa={auxilio === null ? null : Number(auxilio)} auxilioPropio={null} />
    </div>
  );
}

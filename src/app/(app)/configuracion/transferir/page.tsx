import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requierePermiso } from "@/lib/permisos";
import { TransferirTareas } from "./TransferirTareas";

// Transferir tareas (migración 53): cuando alguien se va y sus pendientes quedan en una
// cuenta que nadie abre. Solo configuracion/responsable; exige motivo y deja rastro en el
// historial de CADA tarea. No muestra el contenido: devuelve solo cuántas se movieron.
export default async function TransferirPage() {
  await requierePermiso("configuracion", "responsable");
  const supabase = await createClient();
  const { data } = await supabase.rpc("fn_listar_usuarios");
  const usuarios = ((data ?? []) as { id: string; email: string; nombre?: string | null }[])
    .map((u) => ({ id: u.id, nombre: u.nombre ? `${u.nombre} (${u.email})` : u.email }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="mx-auto w-full max-w-xl flex-1 p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href="/configuracion" className="flex min-h-11 items-center text-slate-600">
          ← Configuración
        </Link>
        <h1 className="flex-1 text-center text-base font-bold text-slate-900">Transferir tareas</h1>
        <span className="w-24" />
      </div>
      <TransferirTareas usuarios={usuarios} />
    </div>
  );
}

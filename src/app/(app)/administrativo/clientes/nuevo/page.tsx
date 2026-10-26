import Link from "next/link";
import { tienePermiso } from "@/lib/permisos";
import { FichaCliente } from "../FichaCliente";

export default async function NuevoClientePage() {
  const edita = (await tienePermiso("administrativo", "trabajar")) || (await tienePermiso("comercial", "trabajar"));
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:p-6">
      <div>
        <Link href="/administrativo/clientes" className="text-sm text-slate-600 underline">
          ← Clientes
        </Link>
        <h1 className="mt-2 text-lg font-bold text-slate-900">Nuevo cliente</h1>
        <p className="text-sm text-slate-600">Al crearlo podrás agregarle sedes y subir su RUT.</p>
      </div>
      <FichaCliente cliente={null} edita={edita} />
    </div>
  );
}

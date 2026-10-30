import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { Cuentas, type Cuenta } from "./Cuentas";

/**
 * Las cuentas de redes (migración 125), en su estado real. Fase 1: todas "manual" (se publica
 * copiando y pegando); "conectada" es cuando ya publica la API (fase 3).
 */
export default async function CuentasPage() {
  const supabase = await createClient();
  const [escribe, res] = await Promise.all([
    tienePermiso("marketing", "trabajar"),
    supabase.from("marketing_cuentas").select("id, canal, nombre, handle, url, estado, notas, activa").order("activa", { ascending: false }).order("canal"),
  ]);
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/marketing" className="text-sm text-slate-600 underline">
        ← Marketing
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Cuentas conectadas</h1>
      <p className="text-sm text-slate-600">Por ahora todo se publica a mano. «Conectada» es cuando el ERP ya puede publicar solo en esa cuenta.</p>
      {res.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer las cuentas: {res.error.message}</p>
      ) : (
        <Cuentas escribe={escribe} cuentas={(res.data ?? []) as Cuenta[]} />
      )}
    </div>
  );
}

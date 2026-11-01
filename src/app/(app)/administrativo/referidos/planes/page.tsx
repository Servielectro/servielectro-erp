import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import type { Plan } from "@/lib/referidos";
import { Planes } from "./Planes";

/** Planes de comisión de los referidos (migración 127). */
export default async function PlanesPage() {
  const supabase = await createClient();
  const [escribe, res] = await Promise.all([
    tienePermiso("administrativo", "trabajar"),
    supabase.from("referido_planes").select("*").order("activo", { ascending: false }).order("nombre"),
  ]);
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href="/administrativo/referidos" className="text-sm text-slate-600 underline">
        ← Referenciados
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Planes de comisión</h1>
      <p className="text-xs text-slate-600">
        Cambiar un plan cambia lo que se le carga desde ahí a las cotizaciones nuevas. Las comisiones ya causadas no cambian.
      </p>
      {res.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer los planes: {res.error.message}</p>
      ) : (
        <Planes planes={(res.data ?? []) as Plan[]} escribe={escribe} />
      )}
    </div>
  );
}

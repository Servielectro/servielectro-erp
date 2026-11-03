import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COLUMNAS_PLANTILLA, type Plantilla } from "@/lib/sst/plantillas";
import { NuevaCapacitacion } from "./NuevaCapacitacion";

export default async function NuevaCapacitacionPage() {
  const supabase = await createClient();
  const { data: nivel } = await supabase.rpc("fn_permiso_seccion", { p_modulo: "sgsst", p_seccion: "capacitaciones" });
  if (nivel !== "trabajar" && nivel !== "responsable") redirect("/sgsst/capacitaciones");
  const { data } = await supabase
    .from("sst_plantillas")
    .select(COLUMNAS_PLANTILLA)
    .eq("codigo", "FOR-02")
    .eq("ambito", "sgsst")
    .eq("estado", "publicada")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const plantilla = data as Plantilla | null;
  return (
    <div className="mx-auto w-full max-w-xl flex-1 space-y-3 p-4">
      <Link href="/sgsst/capacitaciones" className="text-sm text-slate-600 underline">
        ← Capacitaciones
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Nueva capacitación (FOR-02)</h1>
      {plantilla ? (
        <NuevaCapacitacion plantillaId={plantilla.id} campos={plantilla.campos} />
      ) : (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se encontró la plantilla FOR-02 publicada.</p>
      )}
    </div>
  );
}

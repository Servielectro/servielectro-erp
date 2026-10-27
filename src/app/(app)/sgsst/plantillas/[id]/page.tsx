import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { COLUMNAS_PLANTILLA, type Plantilla } from "@/lib/sst/plantillas";
import { EditorPlantilla } from "./EditorPlantilla";

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data, error }, gestiona] = await Promise.all([
    supabase.from("sst_plantillas").select(COLUMNAS_PLANTILLA).eq("id", id).maybeSingle(),
    tienePermiso("sgsst", "responsable"),
  ]);
  if (error) return <p className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo leer la plantilla: {error.message}</p>;
  if (!data) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/sgsst/plantillas" className="text-sm text-slate-600 underline">
        ← Plantillas
      </Link>
      <EditorPlantilla inicial={data as Plantilla} gestiona={gestiona} />
    </div>
  );
}

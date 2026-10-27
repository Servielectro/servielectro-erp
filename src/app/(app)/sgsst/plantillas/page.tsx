import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { COLUMNAS_PLANTILLA, type Plantilla } from "@/lib/sst/plantillas";
import { NuevaPlantilla } from "./NuevaPlantilla";

const ESTADO: Record<Plantilla["estado"], string> = { borrador: "Borrador", publicada: "Publicada", archivada: "Archivada" };

export default async function PlantillasPage() {
  const supabase = await createClient();
  const gestiona = await tienePermiso("sgsst", "responsable");
  const { data, error } = await supabase.from("sst_plantillas").select(COLUMNAS_PLANTILLA).order("codigo").order("version", { ascending: false });
  const plantillas = (data ?? []) as Plantilla[];
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Plantillas de formatos</h1>
      <p className="text-sm text-slate-600">
        Cada formato (ATS, permiso de trabajo, inspección…) se arma aquí con sus campos y sus firmas, tal como está en el documento de la
        responsable SST. Publicada, ya no se edita: para cambiarla se crea una versión nueva, y lo ya llenado queda con la versión con que se llenó.
      </p>
      {gestiona ? <NuevaPlantilla /> : <p className="text-sm text-slate-500">Armar plantillas lo hace la gestión SST (nivel “responsable”).</p>}
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer las plantillas: {error.message}</p>
      ) : plantillas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-600">
          Todavía no hay plantillas. Se cargan cuando lleguen los formatos de la responsable SST.
        </p>
      ) : (
        <ul className="space-y-2">
          {plantillas.map((p) => (
            <li key={p.id}>
              <Link href={`/sgsst/plantillas/${p.id}`} className={`block rounded-lg border border-slate-200 bg-white p-3 ${p.estado === "archivada" ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {p.codigo} · {p.nombre}
                  </p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${p.estado === "publicada" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                    {ESTADO[p.estado]} · v{p.version}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  {p.campos.length} campos · {p.firmas.length} bloques de firma
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { COLUMNAS_PLANTILLA, type Plantilla } from "@/lib/sst/plantillas";
import { NuevaPlantilla } from "@/app/(app)/sgsst/plantillas/NuevaPlantilla";

const ESTADO: Record<Plantilla["estado"], string> = { borrador: "Borrador", publicada: "Publicada", archivada: "Archivada" };

// Plantillas de actas (migración 85): el mismo armador de SG-SST, en el ámbito de Proyectos.
export default async function PlantillasActasPage() {
  const supabase = await createClient();
  const gestiona = await tienePermiso("proyectos", "responsable");
  const { data, error } = await supabase
    .from("sst_plantillas")
    .select(COLUMNAS_PLANTILLA)
    .eq("ambito", "proyectos")
    .order("codigo")
    .order("version", { ascending: false });
  const plantillas = (data ?? []) as Plantilla[];
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/proyectos/actas" className="text-sm text-slate-600 underline">
        ← Actas de obra
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Plantillas de actas</h1>
      <p className="text-sm text-slate-600">
        Cada acta (inicio, reunión, entrega…) se arma aquí con sus campos y sus firmas, tal como la usa la empresa. Publicada, ya no se edita: para
        cambiarla se crea una versión nueva, y lo ya firmado queda con la versión con que se llenó.
      </p>
      {gestiona ? <NuevaPlantilla ambito="proyectos" /> : <p className="text-sm text-slate-500">Armar plantillas de actas lo hace el responsable de Proyectos.</p>}
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer las plantillas: {error.message}</p>
      ) : plantillas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-600">
          Todavía no hay plantillas de actas. Crea la primera con los campos de tu acta (el texto lo pones tú: el ERP no lo inventa).
        </p>
      ) : (
        <ul className="space-y-2">
          {plantillas.map((p) => (
            <li key={p.id}>
              <Link href={`/proyectos/actas/plantillas/${p.id}`} className={`block rounded-lg border border-slate-200 bg-white p-3 ${p.estado === "archivada" ? "opacity-60" : ""}`}>
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

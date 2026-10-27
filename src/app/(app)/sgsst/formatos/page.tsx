import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { ESTADO_FORMATO } from "@/lib/sst/plantillas";

const FILTROS = [
  { id: "por_aprobar", nombre: "Firmados por aprobar", estados: ["firmado"] },
  { id: "llenado", nombre: "En llenado", estados: ["borrador"] },
  { id: "aprobados", nombre: "Aprobados", estados: ["aprobado"] },
  { id: "todos", nombre: "Todos", estados: ["borrador", "firmado", "aprobado", "anulado"] },
];

export default async function FormatosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === ver) ?? FILTROS[0];
  const supabase = await createClient();
  const [{ data, error }, plantillasRes, trabaja] = await Promise.all([
    supabase.from("sst_formatos").select("id, plantilla_id, lugar, fecha, estado, creado_en").eq("ambito", "sgsst").in("estado", filtro.estados).order("fecha", { ascending: false }).limit(300),
    supabase.from("sst_plantillas").select("id, codigo, nombre, version").eq("ambito", "sgsst"),
    tienePermiso("sgsst", "trabajar"),
  ]);
  const plantillas = new Map(((plantillasRes.data ?? []) as { id: string; codigo: string; nombre: string; version: number }[]).map((p) => [p.id, p]));
  const formatos = (data ?? []) as { id: string; plantilla_id: string; lugar: string | null; fecha: string; estado: string; creado_en: string }[];
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-900">Formatos llenados</h1>
        {trabaja && (
          <Link href="/sgsst/campo" className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 text-sm font-semibold text-white">
            Llenar en sitio
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link key={f.id} href={`/sgsst/formatos?ver=${f.id}`} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${f.id === filtro.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
            {f.nombre}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer los formatos: {error.message}</p>
      ) : formatos.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">No hay formatos en este filtro.</p>
      ) : (
        <ul className="space-y-2">
          {formatos.map((f) => {
            const p = plantillas.get(f.plantilla_id);
            return (
              <li key={f.id}>
                <Link href={`/sgsst/formatos/${f.id}`} className="block rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{p?.nombre ?? "Formato"}</p>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{ESTADO_FORMATO[f.estado]}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {f.fecha} · {f.lugar || "sin lugar"} · {p?.codigo} v{p?.version}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

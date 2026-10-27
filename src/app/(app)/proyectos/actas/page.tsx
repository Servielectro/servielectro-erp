import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { ESTADO_FORMATO } from "@/lib/sst/plantillas";

const FILTROS = [
  { id: "todos", nombre: "Todas", estados: ["borrador", "firmado", "aprobado", "anulado"] },
  { id: "llenado", nombre: "En llenado", estados: ["borrador"] },
  { id: "por_aprobar", nombre: "Firmadas por aprobar", estados: ["firmado"] },
  { id: "aprobados", nombre: "Aprobadas", estados: ["aprobado"] },
];

// Actas de obra (migración 85): el mismo motor de plantillas de SG-SST, en el ámbito de Proyectos.
// Acta de inicio, de reunión, de entrega…: cada una se arma como plantilla, se llena en la obra con
// sus firmas, queda sellada con la primera firma y sale en PDF.
export default async function ActasPage({ searchParams }: { searchParams: Promise<{ ver?: string; proyecto?: string }> }) {
  const { ver, proyecto } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === ver) ?? FILTROS[0];
  const supabase = await createClient();
  let q = supabase
    .from("sst_formatos")
    .select("id, plantilla_id, proyecto_id, lugar, fecha, estado")
    .eq("ambito", "proyectos")
    .in("estado", filtro.estados)
    .order("fecha", { ascending: false })
    .limit(300);
  if (proyecto) q = q.eq("proyecto_id", proyecto);
  const [{ data, error }, plantillasRes, proyectosRes, trabaja, gestiona] = await Promise.all([
    q,
    supabase.from("sst_plantillas").select("id, codigo, nombre, version").eq("ambito", "proyectos"),
    supabase.rpc("fn_proyectos_nombres"),
    tienePermiso("proyectos", "trabajar"),
    tienePermiso("proyectos", "responsable"),
  ]);
  const plantillas = new Map(((plantillasRes.data ?? []) as { id: string; codigo: string; nombre: string; version: number }[]).map((p) => [p.id, p]));
  const obras = new Map(((proyectosRes.data ?? []) as { id: string; codigo: string; nombre: string }[]).map((p) => [p.id, `${p.codigo} · ${p.nombre}`]));
  const actas = (data ?? []) as { id: string; plantilla_id: string; proyecto_id: string; lugar: string | null; fecha: string; estado: string }[];
  const enlace = (v: string) => `/proyectos/actas?${new URLSearchParams({ ...(v !== "todos" ? { ver: v } : {}), ...(proyecto ? { proyecto } : {}) })}`;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href={proyecto ? `/proyectos/${proyecto}` : "/proyectos"} className="text-sm text-slate-600 underline">
        ← {proyecto ? (obras.get(proyecto) ?? "Proyecto") : "Proyectos"}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-900">Actas de obra{proyecto ? ` · ${obras.get(proyecto) ?? ""}` : ""}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/proyectos/actas/plantillas" className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold">
            Plantillas de actas
          </Link>
          {trabaja && (
            <Link href={proyecto ? `/actas/campo?proyecto=${proyecto}` : "/actas/campo"} className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 text-sm font-semibold text-white">
              + Llenar un acta
            </Link>
          )}
        </div>
      </div>
      {!trabaja && <p className="text-sm text-slate-500">Llenar actas requiere Proyectos en nivel “trabajar”; armar plantillas y aprobar, “responsable”.</p>}
      {plantillasRes.data?.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Todavía no hay plantillas de actas. {gestiona ? "Arma la primera en “Plantillas de actas”, con los campos de tu acta." : "Las arma el responsable de Proyectos."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link key={f.id} href={enlace(f.id)} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${f.id === filtro.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
            {f.nombre}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer las actas: {error.message}</p>
      ) : actas.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">No hay actas en este filtro.</p>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
          {actas.map((a) => {
            const p = plantillas.get(a.plantilla_id);
            return (
              <li key={a.id}>
                <Link href={`/proyectos/actas/${a.id}`} className="block h-full rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{p?.nombre ?? "Acta"}</p>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{ESTADO_FORMATO[a.estado]}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {a.fecha} · {obras.get(a.proyecto_id) ?? "obra"}
                    {a.lugar ? ` · ${a.lugar}` : ""}
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

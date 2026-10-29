import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ESTADO_FORMATO } from "@/lib/sst/plantillas";

const FILTROS = [
  { id: "todas", nombre: "Todas", estados: ["firmado", "aprobado", "anulado"] },
  { id: "firmadas", nombre: "Firmadas por aprobar", estados: ["firmado"] },
  { id: "aprobadas", nombre: "Aprobadas", estados: ["aprobado"] },
  { id: "anuladas", nombre: "Anuladas", estados: ["anulado"] },
];

interface Acta {
  id: string;
  plantilla_id: string;
  proyecto_id: string | null;
  lugar: string | null;
  fecha: string;
  estado: string;
  tecnicos_en_obra: { nombre: string; documento: string }[] | null;
}

/**
 * Actas de obra para SG-SST (migración 105). Jhojan: "que ella sepa cuáles actas se firmaron,
 * quiénes están trabajando en cada sitio". Las actas de Proyectos YA FIRMADAS, leídas donde viven
 * (no es copia): solo lectura, sin borradores, sin entrar a Proyectos. Por obra, con quiénes
 * estuvieron (la lista sellada de técnicos en obra) y quiénes firmaron.
 */
export default async function ActasDeObraPage({ searchParams }: { searchParams: Promise<{ ver?: string; obra?: string }> }) {
  const { ver, obra } = await searchParams;
  const filtro = FILTROS.find((f) => f.id === ver) ?? FILTROS[0];
  const supabase = await createClient();
  const [actasRes, plantillasRes, obrasRes] = await Promise.all([
    supabase
      .from("sst_formatos")
      .select("id, plantilla_id, proyecto_id, lugar, fecha, estado, tecnicos_en_obra")
      .eq("ambito", "proyectos")
      .in("estado", filtro.estados)
      .order("fecha", { ascending: false })
      .limit(500),
    supabase.from("sst_plantillas").select("id, codigo, nombre, version").eq("ambito", "proyectos"),
    supabase.rpc("fn_sgsst_obras_de_actas"),
  ]);
  // Sin la migración 105, quien tiene Proyectos igual ve los nombres por la función de siempre.
  const obrasLista = (
    obrasRes.error ? ((await supabase.rpc("fn_proyectos_nombres")).data ?? []) : (obrasRes.data ?? [])
  ) as { id: string; codigo: string; nombre: string }[];
  const obras = new Map(obrasLista.map((p) => [p.id, `${p.codigo} · ${p.nombre}`]));
  const plantillas = new Map(((plantillasRes.data ?? []) as { id: string; codigo: string; nombre: string; version: number }[]).map((p) => [p.id, p]));
  const todas = (actasRes.data ?? []) as Acta[];

  const ids = todas.map((a) => a.id);
  const firmasRes = ids.length
    ? await supabase.from("sst_formato_firmas").select("formato_id, nombre, cargo, rol").in("formato_id", ids).order("recibida_en")
    : { data: [] };
  const firmas = new Map<string, { nombre: string; cargo: string | null }[]>();
  for (const x of (firmasRes.data ?? []) as { formato_id: string; nombre: string; cargo: string | null }[]) {
    (firmas.get(x.formato_id) ?? firmas.set(x.formato_id, []).get(x.formato_id)!).push(x);
  }

  // Los contadores por obra son el filtro.
  const porObra = new Map<string, number>();
  for (const a of todas) porObra.set(a.proyecto_id ?? "", (porObra.get(a.proyecto_id ?? "") ?? 0) + 1);
  const actas = obra !== undefined ? todas.filter((a) => (a.proyecto_id ?? "") === obra) : todas;
  const enlace = (cambio: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ver: filtro.id === "todas" ? undefined : filtro.id, obra, ...cambio })) if (v !== undefined) q.set(k, v);
    return `/sgsst/actas-obra${q.size ? `?${q}` : ""}`;
  };
  const chip = (activo: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-5xl">
      <Link href="/sgsst" className="text-sm text-slate-600 underline">
        ← SG-SST
      </Link>
      <div>
        <h1 className="text-lg font-bold text-slate-900">Actas de obra</h1>
        <p className="text-sm text-slate-600">Las actas de Proyectos ya firmadas en sitio: de qué obra, qué día, quiénes estuvieron y quiénes firmaron. Solo lectura.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link key={f.id} href={enlace({ ver: f.id === "todas" ? undefined : f.id })} className={chip(f.id === filtro.id)}>
            {f.nombre}
          </Link>
        ))}
      </div>
      {porObra.size > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link href={enlace({ obra: undefined })} className={chip(obra === undefined)}>
            Todas las obras · {todas.length}
          </Link>
          {[...porObra.entries()].map(([id, n]) => (
            <Link key={id} href={enlace({ obra: id })} className={chip(obra === id)}>
              {obras.get(id) ?? "Sin obra"} · {n}
            </Link>
          ))}
        </div>
      )}
      {actasRes.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer las actas: {actasRes.error.message}</p>
      ) : actas.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">
          {obrasRes.error ? "Para ver las actas de obra falta correr la migración 105." : "No hay actas firmadas en este filtro."}
        </p>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
          {actas.map((a) => {
            const p = plantillas.get(a.plantilla_id);
            const f = firmas.get(a.id) ?? [];
            const tecnicos = a.tecnicos_en_obra ?? [];
            return (
              <li key={a.id}>
                <Link href={`/sgsst/actas-obra/${a.id}`} className="block h-full rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{p?.nombre ?? "Acta"}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${a.estado === "anulado" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                      {ESTADO_FORMATO[a.estado]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {a.fecha} · {obras.get(a.proyecto_id ?? "") ?? "obra"}
                    {a.lugar ? ` · ${a.lugar}` : ""}
                  </p>
                  {tecnicos.length > 0 && (
                    <p className="mt-1 text-xs text-slate-700">
                      <span className="font-semibold">En obra:</span> {tecnicos.map((t) => t.nombre).join(", ")}
                    </p>
                  )}
                  {f.length > 0 && (
                    <p className="mt-0.5 text-xs text-slate-700">
                      <span className="font-semibold">Firmaron:</span> {f.map((x) => (x.cargo ? `${x.nombre} (${x.cargo})` : x.nombre)).join(", ")}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

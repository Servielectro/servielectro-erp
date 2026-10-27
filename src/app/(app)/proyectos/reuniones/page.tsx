import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { ESTADO_REUNION, type EstadoReunion } from "@/lib/reuniones/acta";
import { NuevaReunion } from "./NuevaReunion";

// Reuniones presenciales (migración 86): grabar o subir el audio → transcripción → acta → revisión de
// Jhojan → firma y PDF. La lógica de las dos etapas es la de su app actas-servielectro.
export default async function ReunionesPage({ searchParams }: { searchParams: Promise<{ proyecto?: string }> }) {
  const { proyecto } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("reuniones").select("id, proyecto_id, titulo, fecha, estado, duracion_s").order("fecha", { ascending: false }).order("creada_en", { ascending: false }).limit(200);
  if (proyecto) q = q.eq("proyecto_id", proyecto);
  const [{ data, error }, obrasRes, trabaja] = await Promise.all([q, supabase.rpc("fn_proyectos_nombres"), tienePermiso("proyectos", "trabajar")]);
  const obrasLista = ((obrasRes.data ?? []) as { id: string; codigo: string; nombre: string; estado: string }[]).map((o) => ({ id: o.id, nombre: `${o.codigo} · ${o.nombre}` }));
  const obras = new Map(obrasLista.map((o) => [o.id, o.nombre]));
  const reuniones = (data ?? []) as { id: string; proyecto_id: string; titulo: string; fecha: string; estado: EstadoReunion; duracion_s: number | null }[];
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <Link href={proyecto ? `/proyectos/${proyecto}` : "/proyectos"} className="text-sm text-slate-600 underline">
        ← {proyecto ? (obras.get(proyecto) ?? "Proyecto") : "Proyectos"}
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Reuniones{proyecto ? ` · ${obras.get(proyecto) ?? ""}` : ""}</h1>
      <p className="text-sm text-slate-600">
        Graba la reunión desde el celular (avisando antes a los presentes): sale la transcripción y el acta con decisiones y compromisos. Tú la revisas y la
        apruebas; después se firma y los compromisos se vuelven tareas del tablero.
      </p>
      {trabaja ? <NuevaReunion obras={obrasLista} obraInicial={proyecto ?? null} /> : <p className="text-sm text-slate-500">Grabar reuniones requiere Proyectos en nivel “trabajar”.</p>}
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No se pudieron leer las reuniones: {error.message}</p>
      ) : reuniones.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-600">Todavía no hay reuniones.</p>
      ) : (
        <ul className="space-y-2">
          {reuniones.map((r) => (
            <li key={r.id}>
              <Link href={`/proyectos/reuniones/${r.id}`} className={`block rounded-lg border border-slate-200 bg-white p-3 ${r.estado === "anulada" ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{r.titulo}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.estado === "lista" ? "bg-amber-100 text-amber-900" : r.estado === "aprobada" ? "bg-green-100 text-green-800" : r.estado === "error" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                    {ESTADO_REUNION[r.estado]}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  {r.fecha} · {obras.get(r.proyecto_id) ?? "obra"}
                  {r.duracion_s ? ` · ${Math.round(r.duracion_s / 60)} min` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { CAMINO, COLOR_ESTADO, ETIQUETA_CANAL, ETIQUETA_TIPO, fechaCorta, type EstadoIdea } from "@/lib/marketing";
import { NuevaIdea } from "./NuevaIdea";

interface IdeaFila {
  id: string;
  titulo: string;
  tipo: string;
  canales: string[];
  estado: EstadoIdea;
  fecha_programada: string | null;
  motivo_descarte: string | null;
  marketing_campanas: { nombre: string } | null;
}

/** Las ideas en un tablero por estado (migración 125). Moverlas de estado se hace en su ficha. */
export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ descartadas?: string }> }) {
  const { descartadas } = await searchParams;
  const verDescartadas = descartadas === "1";
  const supabase = await createClient();
  const [escribe, ideasRes, campRes] = await Promise.all([
    tienePermiso("marketing", "trabajar"),
    supabase
      .from("marketing_ideas")
      .select("id, titulo, tipo, canales, estado, fecha_programada, motivo_descarte, marketing_campanas(nombre)")
      .order("fecha_programada", { ascending: true, nullsFirst: false })
      .order("creado_en", { ascending: false })
      .limit(500),
    supabase.from("marketing_campanas").select("id, nombre").in("estado", ["borrador", "activa"]).order("nombre"),
  ]);
  const ideas = (ideasRes.data ?? []) as unknown as IdeaFila[];
  const descartadasN = ideas.filter((i) => i.estado === "descartada").length;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-7xl">
      <Link href="/marketing" className="text-sm text-slate-600 underline">
        ← Marketing
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Ideas</h1>
          <p className="text-sm text-slate-600">Cada idea avanza: idea → guion → arte → aprobada → programada → publicada. Ábrela para moverla.</p>
        </div>
        <Link href={verDescartadas ? "/marketing/ideas" : "/marketing/ideas?descartadas=1"} className="text-sm text-slate-600 underline">
          {verDescartadas ? "Ocultar descartadas" : `Ver descartadas (${descartadasN})`}
        </Link>
      </div>
      {escribe && <NuevaIdea campanas={(campRes.data ?? []) as { id: string; nombre: string }[]} />}
      {ideasRes.error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudieron leer las ideas: {ideasRes.error.message}</p>
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-6 lg:items-start lg:gap-2 lg:space-y-0">
          {CAMINO.map((c) => {
            const deEstado = ideas.filter((i) => i.estado === c.key);
            return (
              <section key={c.key} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                  {c.label} · {deEstado.length}
                </h2>
                <p className="mb-2 px-1 text-[11px] text-slate-500">{c.ayuda}</p>
                <ul className="space-y-1.5">
                  {deEstado.map((i) => (
                    <TarjetaIdea key={i.id} i={i} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {verDescartadas && (
        <section className="rounded-lg border border-slate-200 bg-white p-2">
          <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-slate-600">Descartadas · {descartadasN}</h2>
          <ul className="mt-2 space-y-1.5">
            {ideas
              .filter((i) => i.estado === "descartada")
              .map((i) => (
                <TarjetaIdea key={i.id} i={i} />
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TarjetaIdea({ i }: { i: IdeaFila }) {
  return (
    <li>
      <Link href={`/marketing/ideas/${i.id}`} className={`block rounded-md border px-2 py-1.5 ${COLOR_ESTADO[i.estado]}`}>
        <p className="text-sm font-semibold leading-snug">{i.titulo}</p>
        <p className="text-[11px] opacity-80">
          {[ETIQUETA_TIPO[i.tipo] ?? i.tipo, i.canales.map((c) => ETIQUETA_CANAL[c] ?? c).join(", "), i.fecha_programada && fechaCorta(i.fecha_programada), i.marketing_campanas?.nombre]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {i.estado === "descartada" && i.motivo_descarte && <p className="text-[11px] no-underline">Motivo: {i.motivo_descarte}</p>}
      </Link>
    </li>
  );
}

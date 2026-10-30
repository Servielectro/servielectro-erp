import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CADENCIA_SEMANAL, COLOR_ESTADO, ETIQUETA_CANAL, ETIQUETA_ESTADO, ETIQUETA_TIPO, fechaCorta, hoyBogota, type EstadoIdea } from "@/lib/marketing";

interface IdeaCal {
  id: string;
  titulo: string;
  tipo: string;
  canales: string[];
  estado: EstadoIdea;
  fecha_programada: string;
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * El calendario de contenido (migración 125): lo que tiene fecha, en vista de mes o de lista. Cada
 * semana muestra cuántas lleva contra la cadencia aprobada (3 por semana). Las ideas sin fecha
 * viven en el tablero de Ideas.
 */
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string; vista?: string }> }) {
  const { mes: mesParam, vista } = await searchParams;
  const hoy = hoyBogota();
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? (mesParam as string) : hoy.slice(0, 7);
  const [anio, m] = mes.split("-").map(Number);
  const primero = new Date(anio, m - 1, 1);
  const ultimo = new Date(anio, m, 0);
  // La cuadrícula va de lunes a domingo: arranca en el lunes de la semana del día 1.
  const inicio = new Date(primero);
  inicio.setDate(1 - ((primero.getDay() + 6) % 7));
  const fin = new Date(ultimo);
  fin.setDate(ultimo.getDate() + (6 - ((ultimo.getDay() + 6) % 7)));

  const supabase = await createClient();
  const [ideasRes, sinFechaRes] = await Promise.all([
    supabase
      .from("marketing_ideas")
      .select("id, titulo, tipo, canales, estado, fecha_programada")
      .neq("estado", "descartada")
      .gte("fecha_programada", iso(inicio))
      .lte("fecha_programada", iso(fin))
      .order("fecha_programada"),
    supabase.from("marketing_ideas").select("id", { count: "exact", head: true }).is("fecha_programada", null).not("estado", "in", "(descartada,publicada)"),
  ]);
  const ideas = (ideasRes.data ?? []) as IdeaCal[];
  const porDia = new Map<string, IdeaCal[]>();
  for (const i of ideas) porDia.set(i.fecha_programada, [...(porDia.get(i.fecha_programada) ?? []), i]);

  const semanas: Date[][] = [];
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    if (!semanas.length || semanas[semanas.length - 1].length === 7) semanas.push([]);
    semanas[semanas.length - 1].push(new Date(d));
  }
  const cuentanEnSemana = (s: Date[]) => s.reduce((n, d) => n + (porDia.get(iso(d)) ?? []).filter((i) => i.estado === "programada" || i.estado === "publicada").length, 0);

  const otroMes = (delta: number) => {
    const d = new Date(anio, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const esLista = vista === "lista";
  const enlace = (mm: string, v = vista) => `/marketing/calendario?mes=${mm}${v === "lista" ? "&vista=lista" : ""}`;
  const nombreMes = primero.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6 lg:max-w-6xl">
      <Link href="/marketing" className="text-sm text-slate-600 underline">
        ← Marketing
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-900">Calendario de contenido</h1>
        <div className="flex gap-1 rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <Link href={enlace(mes, "mes")} className={`flex min-h-10 items-center rounded-md px-3 ${!esLista ? "bg-slate-900 text-white" : "text-slate-700"}`}>
            Mes
          </Link>
          <Link href={enlace(mes, "lista")} className={`flex min-h-10 items-center rounded-md px-3 ${esLista ? "bg-slate-900 text-white" : "text-slate-700"}`}>
            Lista
          </Link>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Link href={enlace(otroMes(-1))} className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm">
          ← Anterior
        </Link>
        <p className="text-sm font-semibold capitalize text-slate-900">{nombreMes}</p>
        <Link href={enlace(otroMes(1))} className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm">
          Siguiente →
        </Link>
      </div>
      {(sinFechaRes.count ?? 0) > 0 && (
        <p className="text-sm text-slate-600">
          {sinFechaRes.count} idea{sinFechaRes.count === 1 ? "" : "s"} sin fecha:{" "}
          <Link href="/marketing/ideas" className="underline">
            ponles fecha en Ideas
          </Link>
          .
        </p>
      )}
      {ideasRes.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No se pudo leer el calendario: {ideasRes.error.message}</p>}

      {esLista ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-300 bg-white">
          {ideas.filter((i) => i.fecha_programada.startsWith(mes)).length === 0 && <li className="p-4 text-center text-sm text-slate-500">Nada con fecha en este mes.</li>}
          {ideas
            .filter((i) => i.fecha_programada.startsWith(mes))
            .map((i) => (
              <li key={i.id}>
                <Link href={`/marketing/ideas/${i.id}`} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  <span className={`w-24 shrink-0 text-xs font-semibold ${i.fecha_programada < hoy && i.estado !== "publicada" ? "text-red-700" : "text-slate-700"}`}>{fechaCorta(i.fecha_programada)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{i.titulo}</span>
                    <span className="block text-xs text-slate-600">
                      {ETIQUETA_TIPO[i.tipo] ?? i.tipo} · {i.canales.map((c) => ETIQUETA_CANAL[c] ?? c).join(", ")}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[i.estado]}`}>{ETIQUETA_ESTADO[i.estado]}</span>
                </Link>
              </li>
            ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-slate-300 bg-white">
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_2.5rem] border-b border-slate-200 text-center text-[11px] font-semibold text-slate-500">
            {DIAS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
            <div className="py-1" title={`Programadas o publicadas en la semana, contra ${CADENCIA_SEMANAL}`}>
              Sem.
            </div>
          </div>
          {semanas.map((s) => {
            const n = cuentanEnSemana(s);
            return (
              <div key={iso(s[0])} className="grid grid-cols-[repeat(7,minmax(0,1fr))_2.5rem] border-b border-slate-100 last:border-b-0">
                {s.map((d) => {
                  const dia = iso(d);
                  const delDia = porDia.get(dia) ?? [];
                  const fuera = d.getMonth() !== m - 1;
                  return (
                    <div key={dia} className={`min-h-16 border-r border-slate-100 p-0.5 sm:min-h-24 sm:p-1 ${fuera ? "bg-slate-50" : ""}`}>
                      <p className={`text-[11px] ${dia === hoy ? "inline-block rounded-full bg-brand-red px-1.5 font-bold text-white" : fuera ? "text-slate-400" : "text-slate-600"}`}>{d.getDate()}</p>
                      <ul className="space-y-0.5">
                        {delDia.map((i) => (
                          <li key={i.id}>
                            <Link href={`/marketing/ideas/${i.id}`} title={`${i.titulo} · ${ETIQUETA_ESTADO[i.estado]}`} className={`block truncate rounded border px-0.5 text-[10px] leading-4 sm:px-1 sm:text-[11px] ${COLOR_ESTADO[i.estado]}`}>
                              {i.titulo}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                <div className={`flex items-center justify-center text-[11px] font-semibold ${n >= CADENCIA_SEMANAL ? "text-green-700" : "text-amber-700"}`}>
                  {n}/{CADENCIA_SEMANAL}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-500">
        La columna «Sem.» cuenta lo programado o publicado en cada semana contra la cadencia acordada: {CADENCIA_SEMANAL} por semana, LinkedIn primero. Para ponerle fecha a una idea, ábrela.
      </p>
    </div>
  );
}

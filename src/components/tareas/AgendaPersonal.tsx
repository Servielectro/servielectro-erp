"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  diaAgenda,
  diasEntre,
  fechaCorta,
  GRUPOS_AGENDA,
  grupoAgenda,
  grupoDeDia,
  hoyBogota,
  PRIORIDADES,
  proximoLunes,
  sumarDias,
  type GrupoAgenda,
  type Obra,
  type Tarea,
} from "@/lib/tareas";
import { borradorVacio, guardarTarea, moverTarea } from "@/lib/tareas-guardar";
import { FormTarea } from "./FormTarea";
import type { VisitaAgenda } from "./AgendaEquipo";

type Atajo = "hoy" | "manana" | "lunes" | "elegir" | "sin";
const RANGO_PRIORIDAD = { urgente: 0, alta: 1, media: 2, baja: 3 } as const;

/**
 * Agenda personal: el reemplazo de Notion de Jhojan (y de cualquiera). Sus tareas
 * internas —que nadie más ve, ni el administrador— y las de equipo que le asignaron.
 * Lo que la hace usable a diario: escribir arriba, Enter, y un atajo de fecha.
 */
export function AgendaPersonal({
  yo,
  puedeAsignar,
  tareasIniciales,
  obras,
  personas,
  visitas = [],
}: {
  yo: string;
  puedeAsignar: boolean;
  tareasIniciales: Tarea[];
  obras: Obra[];
  personas: { id: string; nombre: string }[];
  /** Las visitas que le asignaron (técnico): también van en su agenda, por día. */
  visitas?: VisitaAgenda[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const hoy = hoyBogota();
  const [tareas, setTareas] = useState<Tarea[]>(tareasIniciales);
  const [texto, setTexto] = useState("");
  const [atajo, setAtajo] = useState<Atajo>("hoy");
  const [fechaElegida, setFechaElegida] = useState(sumarDias(hoy, 2));
  const [hora, setHora] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Error que NO se va solo: una tarea que no se guardó tiene que quedar a la vista.
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [soloPersonales, setSoloPersonales] = useState(false);
  const [hechasAbiertas, setHechasAbiertas] = useState(false);
  const [form, setForm] = useState<{ original: Tarea | null } | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 2500);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const nombreObra = useMemo(() => new Map(obras.map((o) => [o.clave, o.nombre])), [obras]);

  // Lo mío: internas creadas por mí y las de equipo asignadas a mí.
  const mias = useMemo(
    () =>
      tareas.filter(
        (t) =>
          !t.archivada &&
          ((t.visibilidad === "interna" && t.creadaPor === yo) ||
            (!soloPersonales && t.visibilidad === "equipo" && t.asignados.includes(yo))),
      ),
    [tareas, yo, soloPersonales],
  );

  const fechaDelAtajo = (a: Atajo): string => {
    if (a === "hoy") return hoy;
    if (a === "manana") return sumarDias(hoy, 1);
    if (a === "lunes") return proximoLunes(hoy);
    if (a === "elegir") return fechaElegida;
    return "";
  };

  async function anotar() {
    const titulo = texto.trim();
    if (!titulo || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const b = borradorVacio("por_hacer");
      b.titulo = titulo;
      b.visibilidad = "interna";
      b.fechaProgramada = fechaDelAtajo(atajo);
      b.hora = b.fechaProgramada ? hora : "";
      // Al final de "Por hacer" en el tablero.
      const ultima = tareas.filter((t) => t.estado === "por_hacer").reduce((m, t) => Math.max(m, t.orden), 0);
      const res = await guardarTarea(supabase, null, b, { soloMover: false, ordenNueva: ultima + 1000 });
      if (!res.ok) {
        setError(`No se guardó: ${res.error} Tu texto sigue en el campo.`);
        return;
      }
      setTareas((p) => [...p, res.tarea]);
      setTexto("");
      setHora("");
      setAviso("Anotada");
    } catch (e) {
      setError(
        `No se guardó${e instanceof Error && /fetch|network/i.test(e.message) ? " (sin conexión)" : ""}. Tu texto sigue en el campo; vuelve a intentar.`,
      );
    } finally {
      setGuardando(false);
    }
  }

  async function marcar(t: Tarea) {
    const estado = t.estado === "hecho" ? "por_hacer" : "hecho";
    const previa = t;
    setTareas((p) => p.map((x) => (x.id === t.id ? { ...x, estado, cerradaEn: estado === "hecho" ? new Date().toISOString() : null } : x)));
    try {
      const res = await moverTarea(supabase, t.id, estado, t.orden);
      if (!res.ok) {
        setTareas((p) => p.map((x) => (x.id === t.id ? previa : x)));
        setError(res.error); // p. ej. "No puede pasar a Hecho: la bloquea …"
      }
    } catch {
      setTareas((p) => p.map((x) => (x.id === t.id ? previa : x)));
      setError("No se guardó el cambio (sin conexión). La tarea sigue como estaba.");
    }
  }

  const abiertas = mias.filter((t) => t.estado !== "hecho");
  const grupos = new Map<GrupoAgenda, Tarea[]>();
  for (const t of abiertas) {
    const g = grupoAgenda(t, hoy);
    grupos.set(g, [...(grupos.get(g) ?? []), t]);
  }
  for (const lista of grupos.values()) {
    lista.sort(
      (a, b) =>
        (diaAgenda(a) ?? "9999").localeCompare(diaAgenda(b) ?? "9999") ||
        (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99") ||
        RANGO_PRIORIDAD[a.prioridad] - RANGO_PRIORIDAD[b.prioridad],
    );
  }
  // Visitas del técnico, por día (se trabajan en la app de campo).
  const visitasPorGrupo = new Map<GrupoAgenda, VisitaAgenda[]>();
  for (const v of visitas.filter((x) => ["programada", "en_curso"].includes(x.estado))) {
    const g = grupoDeDia(v.fecha, hoy);
    visitasPorGrupo.set(g, [...(visitasPorGrupo.get(g) ?? []), v]);
  }

  const hechasRecientes = mias
    .filter((t) => t.estado === "hecho" && t.cerradaEn && diasEntre(t.cerradaEn.slice(0, 10), hoy) <= 7)
    .sort((a, b) => (b.cerradaEn ?? "").localeCompare(a.cerradaEn ?? ""));

  function renglon(t: Tarea) {
    const dia = diaAgenda(t);
    const obraClave = t.proyectoId ? `p:${t.proyectoId}` : t.visitaId ? `v:${t.visitaId}` : "";
    const prioridad = PRIORIDADES.find((p) => p.valor === t.prioridad)!;
    const hechas = t.subtareas.filter((s) => s.hecha).length;
    return (
      <li key={t.id} className="flex min-h-14 items-center gap-3 px-3 py-2 md:min-h-16 md:px-4">
        <button
          type="button"
          role="checkbox"
          aria-checked={t.estado === "hecho"}
          onClick={() => marcar(t)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-lg md:h-9 md:w-9 ${
            t.estado === "hecho" ? "border-green-600 bg-green-600 text-white" : "border-slate-400"
          }`}
          aria-label={t.estado === "hecho" ? "Marcar pendiente" : "Marcar hecha"}
        >
          {t.estado === "hecho" ? "✓" : ""}
        </button>
        <button type="button" onClick={() => setForm({ original: t })} className="min-w-0 flex-1 text-left">
          <p className={`text-base leading-snug ${t.estado === "hecho" ? "text-slate-400 line-through" : "text-slate-900"}`}>
            {t.hora && <span className="mr-1 font-semibold">{t.hora}</span>}
            {t.titulo}
          </p>
          <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
            {dia && grupoAgenda(t, hoy) !== "hoy" && <span>{fechaCorta(dia)}</span>}
            {t.prioridad !== "media" && <span className={`rounded px-1 ${prioridad.clase}`}>{prioridad.etiqueta}</span>}
            {t.subtareas.length > 0 && (
              <span>
                {hechas}/{t.subtareas.length} subtareas
              </span>
            )}
            {t.visibilidad === "equipo" && <span>👥 {obraClave ? nombreObra.get(obraClave) ?? "Obra" : "Equipo"}</span>}
          </p>
        </button>
      </li>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 p-3 sm:p-4">
      <h1 className="mb-3 text-center text-base font-bold">Mi agenda</h1>

      {/* Anotar en un segundo */}
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-3 md:p-4">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              anotar();
            }
          }}
          enterKeyHint="done"
          placeholder="¿Qué tienes que hacer?"
          className="min-h-12 w-full rounded-lg border border-slate-300 px-3 text-lg md:min-h-14"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(
            [
              ["hoy", "Hoy"],
              ["manana", "Mañana"],
              ["lunes", `Lunes ${fechaCorta(proximoLunes(hoy)).split(" ").slice(1).join(" ")}`],
              ["elegir", "Elegir"],
              ["sin", "Sin fecha"],
            ] as [Atajo, string][]
          ).map(([a, etiqueta]) => (
            <button
              key={a}
              type="button"
              onClick={() => setAtajo(a)}
              className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${
                atajo === a ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"
              }`}
            >
              {etiqueta}
            </button>
          ))}
          {atajo === "elegir" && (
            <input type="date" value={fechaElegida} onChange={(e) => setFechaElegida(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-2 text-base" />
          )}
          {atajo !== "sin" && (
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              aria-label="Hora (opcional)"
              className="min-h-11 rounded-lg border border-slate-300 px-2 text-base"
            />
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={anotar}
            disabled={!texto.trim() || guardando}
            className="min-h-11 rounded-lg bg-slate-900 px-5 text-base font-semibold text-white disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Anotar"}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-start justify-between gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-base text-red-900">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="min-h-10 min-w-10 text-xl" aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}
      {aviso && <p role="status" className="mt-3 rounded-xl bg-green-600 px-4 py-2 text-base font-semibold text-white">{aviso}</p>}

      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={soloPersonales} onChange={(e) => setSoloPersonales(e.target.checked)} className="h-5 w-5" />
        Solo personales (esconder las de equipo)
      </label>

      <div className="mt-2 space-y-4">
        {GRUPOS_AGENDA.map((g) => {
          const lista = grupos.get(g.valor) ?? [];
          const susVisitas = visitasPorGrupo.get(g.valor) ?? [];
          if (lista.length === 0 && susVisitas.length === 0) return null;
          return (
            <section key={g.valor}>
              <h2 className={`mb-1 text-sm font-bold uppercase ${g.valor === "atrasadas" ? "text-red-700" : "text-slate-600"}`}>
                {g.titulo} <span className="font-normal text-slate-400">{lista.length + susVisitas.length}</span>
              </h2>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {susVisitas.map((v) => (
                  <li key={`v-${v.id}`}>
                    <Link href="/tecnico" className="flex min-h-14 items-center gap-3 px-3 py-2 md:min-h-16 md:px-4">
                      <span className="text-xl" aria-hidden>
                        🔧
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base leading-snug">
                          Visita: {v.titulo}
                          {v.cliente ? ` · ${v.cliente}` : ""}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {v.fecha && g.valor !== "hoy" ? `${fechaCorta(v.fecha)} · ` : ""}
                          {v.estado === "en_curso" ? "En curso" : "Programada"} · abrir en la app de campo
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {lista.map(renglon)}
              </ul>
            </section>
          );
        })}
        {abiertas.length === 0 && visitas.length === 0 && <p className="py-6 text-center text-base text-slate-500">Nada pendiente. Anota lo que tengas que hacer arriba.</p>}

        {hechasRecientes.length > 0 && (
          <section>
            <button type="button" onClick={() => setHechasAbiertas((a) => !a)} className="min-h-11 text-sm font-semibold text-slate-600">
              {hechasAbiertas ? "▾" : "▸"} Hechas en los últimos 7 días ({hechasRecientes.length})
            </button>
            {hechasAbiertas && <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{hechasRecientes.map(renglon)}</ul>}
          </section>
        )}
      </div>

      {form && (
        <FormTarea
          original={form.original}
          yo={yo}
          puedeAsignar={puedeAsignar}
          personas={personas}
          obras={obras}
          tareas={tareas}
          onCerrar={() => setForm(null)}
          onGuardada={(t) => {
            setTareas((p) => (p.some((x) => x.id === t.id) ? p.map((x) => (x.id === t.id ? t : x)) : [...p, t]));
            setForm(null);
            setAviso("Guardada");
          }}
          onArchivada={(id) => {
            setTareas((p) => p.filter((x) => x.id !== id));
            setForm(null);
            setAviso("Archivada");
          }}
        />
      )}
    </div>
  );
}

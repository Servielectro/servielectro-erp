"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  diaAgenda,
  fechaCorta,
  GRUPOS_AGENDA,
  grupoDeDia,
  hoyBogota,
  PRIORIDADES,
  type GrupoAgenda,
  type Obra,
  type Tarea,
} from "@/lib/tareas";

export interface VisitaAgenda {
  id: string;
  titulo: string;
  cliente: string | null;
  fecha: string | null;
  estado: string;
  tecnicoId: string | null;
}

type Item =
  | { tipo: "tarea"; dia: string | null; hora: string | null; tarea: Tarea }
  | { tipo: "visita"; dia: string | null; hora: null; visita: VisitaAgenda };

/**
 * Agenda del equipo (coordinador / Operativo): por día, las tareas de equipo y las
 * visitas de cada técnico, con filtro por persona. Solo lectura: asignar y mover se hace
 * en el tablero. Las tareas internas de cada uno no aparecen: son de quien las creó.
 */
export function AgendaEquipo({
  tareas,
  visitas,
  obras,
  personas,
}: {
  tareas: Tarea[];
  visitas: VisitaAgenda[];
  obras: Obra[];
  personas: { id: string; nombre: string }[];
}) {
  const hoy = hoyBogota();
  const [persona, setPersona] = useState("");
  const nombre = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);
  const nombreObra = useMemo(() => new Map(obras.map((o) => [o.clave, o.nombre])), [obras]);

  const items: Item[] = [
    ...tareas
      .filter((t) => t.visibilidad === "equipo" && t.estado !== "hecho" && !t.archivada)
      .filter((t) => !persona || t.asignados.includes(persona))
      .map((t) => ({ tipo: "tarea" as const, dia: diaAgenda(t), hora: t.hora, tarea: t })),
    ...visitas
      .filter((v) => ["programada", "en_curso"].includes(v.estado))
      .filter((v) => !persona || v.tecnicoId === persona)
      .map((v) => ({ tipo: "visita" as const, dia: v.fecha, hora: null, visita: v })),
  ];

  const grupos = new Map<GrupoAgenda, Item[]>();
  for (const it of items) {
    const g = grupoDeDia(it.dia, hoy);
    grupos.set(g, [...(grupos.get(g) ?? []), it]);
  }
  for (const lista of grupos.values()) {
    lista.sort((a, b) => (a.dia ?? "9999").localeCompare(b.dia ?? "9999") || (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99"));
  }

  return (
    <div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <span className="font-semibold">Persona</span>
        <select value={persona} onChange={(e) => setPersona(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-slate-300 px-2 text-base">
          <option value="">Todo el equipo</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 space-y-4">
        {GRUPOS_AGENDA.map((g) => {
          const lista = grupos.get(g.valor) ?? [];
          if (lista.length === 0) return null;
          return (
            <section key={g.valor}>
              <h2 className={`mb-1 text-sm font-bold uppercase ${g.valor === "atrasadas" ? "text-red-700" : "text-slate-600"}`}>
                {g.titulo} <span className="font-normal text-slate-400">{lista.length}</span>
              </h2>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {lista.map((it) =>
                  it.tipo === "visita" ? (
                    <li key={`v-${it.visita.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 md:min-h-16 md:px-4">
                      <span className="text-xl" aria-hidden>
                        🔧
                      </span>
                      <Link href="/operativo" className="min-w-0 flex-1">
                        <p className="text-base leading-snug">
                          Visita: {it.visita.titulo}
                          {it.visita.cliente ? ` · ${it.visita.cliente}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          {it.dia && g.valor !== "hoy" ? `${fechaCorta(it.dia)} · ` : ""}
                          {it.visita.tecnicoId ? nombre.get(it.visita.tecnicoId) ?? "técnico" : "sin técnico"}
                          {it.visita.estado === "en_curso" ? " · en curso" : ""}
                        </p>
                      </Link>
                    </li>
                  ) : (
                    <li key={`t-${it.tarea.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 md:min-h-16 md:px-4">
                      <span className="text-xl" aria-hidden>
                        🗂️
                      </span>
                      <Link href="/operativo/tareas" className="min-w-0 flex-1">
                        <p className="text-base leading-snug">
                          {it.hora && <span className="mr-1 font-semibold">{it.hora}</span>}
                          {it.tarea.titulo}
                        </p>
                        <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                          {it.dia && g.valor !== "hoy" && <span>{fechaCorta(it.dia)}</span>}
                          {it.tarea.prioridad !== "media" && (
                            <span className={`rounded px-1 ${PRIORIDADES.find((p) => p.valor === it.tarea.prioridad)!.clase}`}>
                              {it.tarea.prioridad.toUpperCase()}
                            </span>
                          )}
                          <span>{it.tarea.asignados.map((a) => nombre.get(a) ?? "—").join(", ") || "sin asignar"}</span>
                          {(it.tarea.proyectoId || it.tarea.visitaId) && (
                            <span>
                              {nombreObra.get(it.tarea.proyectoId ? `p:${it.tarea.proyectoId}` : `v:${it.tarea.visitaId}`) ?? "Obra"}
                            </span>
                          )}
                        </p>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </section>
          );
        })}
        {items.length === 0 && <p className="py-6 text-center text-base text-slate-500">Nada agendado para {persona ? "esta persona" : "el equipo"}.</p>}
      </div>
    </div>
  );
}

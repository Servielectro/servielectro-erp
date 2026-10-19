"use client";

import { useEffect, useMemo, useState } from "react";
import type { GrupoCompartir } from "@/lib/supabase/tareas";
import { diaBogota, eventoEnDia, horaBogota, type Evento } from "@/lib/eventos";
import { hoyBogota, PRIORIDADES, sumarDias, type Obra, type Tarea } from "@/lib/tareas";
import { FormTarea } from "@/components/tareas/FormTarea";
import { FormEvento } from "./FormEvento";

type Vista = "mes" | "semana" | "dia" | "lista";
type Mostrar = "todo" | "eventos" | "tareas";
type DeQuien = "todas" | "compartida" | "interna";

const VISTAS: { valor: Vista; etiqueta: string }[] = [
  { valor: "mes", etiqueta: "Mes" },
  { valor: "semana", etiqueta: "Semana" },
  { valor: "dia", etiqueta: "Día" },
  { valor: "lista", etiqueta: "Lista" },
];
const INICIALES = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type Item =
  | { tipo: "evento"; id: string; titulo: string; hora: string | null; evento: Evento }
  | { tipo: "tarea"; id: string; titulo: string; hora: string | null; tarea: Tarea };

const mesDe = (dia: string) => dia.slice(0, 7);
const diaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 domingo
/** Lunes de la semana del día. */
const lunesDe = (dia: string) => sumarDias(dia, -((diaSemana(dia) + 6) % 7));
const numeroDia = (dia: string) => Number(dia.slice(8, 10));
function moverMes(dia: string, n: number): string {
  const [a, m] = dia.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1, 12));
  return d.toISOString().slice(0, 10);
}
const nombreMes = (dia: string) => `${MESES[Number(dia.slice(5, 7)) - 1]} ${dia.slice(0, 4)}`;
const nombreDia = (dia: string) => `${DIAS[diaSemana(dia)]} ${numeroDia(dia)} de ${MESES[Number(dia.slice(5, 7)) - 1].toLowerCase()}`;

/** El día de una tarea en el calendario: su fecha límite; si no tiene, el día programado. */
const diaTarea = (t: Tarea) => t.fechaLimite ?? t.fechaProgramada;

/**
 * Agenda: el calendario donde se ven los eventos (citas, reuniones, recordatorios) y las
 * tareas de Planificación con fecha. Las tareas se trabajan en el tablero de Planificación;
 * acá se abren con el mismo formulario.
 */
export function CalendarioAgenda({
  yo,
  eventosIniciales,
  eventosDisponibles,
  tareasIniciales,
  obras,
  personas,
  grupos,
  conResponsable,
}: {
  yo: string;
  eventosIniciales: Evento[];
  /** false mientras la migración 55 no esté corrida. */
  eventosDisponibles: boolean;
  tareasIniciales: Tarea[];
  obras: Obra[];
  personas: { id: string; nombre: string }[];
  grupos: GrupoCompartir[];
  conResponsable: boolean;
}) {
  const hoy = hoyBogota();
  const [eventos, setEventos] = useState(eventosIniciales);
  const [tareas, setTareas] = useState(tareasIniciales);
  const [vista, setVista] = useState<Vista>("mes");
  const [mostrar, setMostrar] = useState<Mostrar>("todo");
  const [deQuien, setDeQuien] = useState<DeQuien>("todas");
  const [foco, setFoco] = useState(hoy);
  const [formEvento, setFormEvento] = useState<{ original: Evento | null; dia: string } | null>(null);
  const [formTarea, setFormTarea] = useState<Tarea | null>(null);
  const [franja, setFranja] = useState<string | null>(null);

  useEffect(() => {
    if (!franja) return;
    const t = window.setTimeout(() => setFranja(null), 3000);
    return () => window.clearTimeout(t);
  }, [franja]);

  const [verEliminados, setVerEliminados] = useState(false);

  const pasa = (v: string) => deQuien === "todas" || v === deQuien;
  const eventosVisibles = mostrar === "tareas" ? [] : eventos.filter((e) => !e.archivado && pasa(e.visibilidad));
  const tareasVisibles = mostrar === "eventos" ? [] : tareas.filter((t) => !t.archivada && diaTarea(t) && pasa(t.visibilidad));
  // Los eventos propios eliminados (archivados): "Eliminar" promete que se recuperan.
  const eliminados = eventos.filter((e) => e.archivado && e.creadoPor === yo);

  function itemsDe(dia: string): Item[] {
    const ev: Item[] = eventosVisibles
      .filter((e) => eventoEnDia(e, dia))
      .map((e) => ({
        tipo: "evento",
        id: e.id,
        titulo: e.titulo,
        // Hora solo el día en que empieza.
        hora: e.todoElDia || diaBogota(e.inicio) !== dia ? null : horaBogota(e.inicio),
        evento: e,
      }));
    const ta: Item[] = tareasVisibles
      .filter((t) => diaTarea(t) === dia)
      .map((t) => ({ tipo: "tarea", id: t.id, titulo: t.titulo, hora: t.fechaLimite ? null : t.hora, tarea: t }));
    // Primero lo de todo el día, después por hora.
    return [...ev, ...ta].sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
  }

  function abrir(i: Item) {
    if (i.tipo === "evento") setFormEvento({ original: i.evento, dia: diaBogota(i.evento.inicio) });
    else setFormTarea(i.tarea);
  }

  function pastilla(i: Item, chica: boolean) {
    const p = i.tipo === "tarea" ? PRIORIDADES.find((x) => x.valor === i.tarea.prioridad)! : null;
    const hecha = i.tipo === "tarea" && i.tarea.estado === "hecho";
    const clase =
      i.tipo === "evento" ? "bg-brand-navy text-white" : `${p!.clase} ${hecha ? "line-through opacity-60" : ""}`;
    return (
      <button
        key={`${i.tipo}-${i.id}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          abrir(i);
        }}
        title={i.titulo}
        className={`block w-full truncate rounded text-left ${clase} ${chica ? "px-1 text-xs leading-5" : "min-h-11 px-3 py-2 text-base"}`}
      >
        {!chica && <span className="mr-2 text-sm opacity-80">{i.tipo === "evento" ? "📅" : "☑"}</span>}
        {i.hora && <span className={chica ? "mr-1 font-semibold" : "mr-2 font-semibold"}>{i.hora}</span>}
        {i.titulo}
      </button>
    );
  }

  // ------------------------------------------------------------ periodo
  function mover(n: number) {
    if (vista === "mes" || vista === "lista") setFoco((f) => moverMes(f, n));
    else if (vista === "semana") setFoco((f) => sumarDias(f, 7 * n));
    else setFoco((f) => sumarDias(f, n));
  }

  const mostrando =
    vista === "mes" || vista === "lista"
      ? nombreMes(foco)
      : vista === "semana"
        ? (() => {
            const l = lunesDe(foco);
            const d = sumarDias(l, 6);
            return mesDe(l) === mesDe(d)
              ? `${numeroDia(l)} – ${numeroDia(d)} ${nombreMes(d)}`
              : `${numeroDia(l)} ${MESES[Number(l.slice(5, 7)) - 1].slice(0, 3)} – ${numeroDia(d)} ${MESES[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${d.slice(0, 4)}`;
          })()
        : nombreDia(foco);

  // Rejilla del mes: de lunes a domingo, con los días de los meses vecinos.
  const semanasMes = useMemo(() => {
    const primero = `${mesDe(foco)}-01`;
    const inicio = lunesDe(primero);
    const ultimo = sumarDias(moverMes(primero, 1), -1);
    const fin = sumarDias(lunesDe(ultimo), 6);
    const semanas: string[][] = [];
    for (let d = inicio; d <= fin; d = sumarDias(d, 7)) semanas.push(Array.from({ length: 7 }, (_, i) => sumarDias(d, i)));
    return semanas;
  }, [foco]);

  const diasLista = useMemo(() => {
    const primero = `${mesDe(foco)}-01`;
    const ultimo = sumarDias(moverMes(primero, 1), -1);
    const dias: string[] = [];
    for (let d = primero; d <= ultimo; d = sumarDias(d, 1)) dias.push(d);
    return dias;
  }, [foco]);

  const SELECT = "min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-base";

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-4">
      {franja && (
        <div role="status" className="sticky top-[57px] z-20 mb-3 rounded-xl bg-green-600 px-4 py-3 text-base font-semibold text-white sm:top-[65px]">
          {franja}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900">Agenda</h1>
          <p className="text-sm text-slate-600">
            Citas, reuniones y recordatorios. Las tareas con fecha límite también aparecen en el calendario.
          </p>
        </div>
        <button
          type="button"
          disabled={!eventosDisponibles}
          onClick={() => setFormEvento({ original: null, dia: vista === "dia" || mesDe(foco) !== mesDe(hoy) ? foco : hoy })}
          className="min-h-11 rounded-lg bg-brand-red px-4 text-base font-semibold text-white disabled:opacity-40"
        >
          + Nuevo evento
        </button>
      </div>
      {!eventosDisponibles && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Los eventos aparecen cuando se corra la migración 55 en la base. Mientras tanto se ven las tareas.
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.6fr_1.3fr]">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Periodo</p>
          <div className="mt-1 flex gap-1">
            <button type="button" onClick={() => mover(-1)} className="min-h-11 min-w-11 rounded-lg border border-slate-300 text-xl" aria-label="Anterior">
              ‹
            </button>
            <button type="button" onClick={() => setFoco(hoy)} className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3 text-base font-medium">
              Hoy
            </button>
            <button type="button" onClick={() => mover(1)} className="min-h-11 min-w-11 rounded-lg border border-slate-300 text-xl" aria-label="Siguiente">
              ›
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Mostrando</p>
          <p className="mt-1 flex min-h-11 items-center text-base font-bold text-slate-900">{mostrando}</p>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Mostrar</span>
          <div className="mt-1 flex gap-2">
            <select value={mostrar} onChange={(e) => setMostrar(e.target.value as Mostrar)} className={`${SELECT} flex-1`}>
              <option value="todo">Eventos y tareas</option>
              <option value="eventos">Solo eventos</option>
              <option value="tareas">Solo tareas</option>
            </select>
            <select value={deQuien} onChange={(e) => setDeQuien(e.target.value as DeQuien)} className={`${SELECT} flex-1`} aria-label="De quién">
              <option value="todas">Todas</option>
              <option value="compartida">Tareas de grupo</option>
              <option value="interna">Tareas personales</option>
            </select>
          </div>
        </label>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Vista</p>
          <div className="mt-1 flex rounded-lg border border-slate-300 bg-white p-0.5">
            {VISTAS.map((v) => (
              <button
                key={v.valor}
                type="button"
                onClick={() => setVista(v.valor)}
                aria-pressed={vista === v.valor}
                className={`min-h-10 flex-1 rounded-md px-2 text-sm font-medium ${vista === v.valor ? "bg-slate-900 text-white" : "text-slate-700"}`}
              >
                {v.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </div>

      {vista === "mes" && (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {INICIALES.map((d) => (
              <p key={d} className="py-2 text-center text-xs font-bold text-slate-500">
                {d}
              </p>
            ))}
          </div>
          {semanasMes.map((semana) => (
            <div key={semana[0]} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
              {semana.map((dia) => {
                const items = itemsDe(dia);
                const deEsteMes = mesDe(dia) === mesDe(foco);
                const esHoy = dia === hoy;
                return (
                  <div
                    key={dia}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setFoco(dia);
                      setVista("dia");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setFoco(dia);
                        setVista("dia");
                      }
                    }}
                    aria-label={`${nombreDia(dia)}: ${items.length} en la agenda`}
                    className={`min-h-20 min-w-0 cursor-pointer border-r border-slate-100 p-1 last:border-r-0 sm:min-h-28 ${deEsteMes ? "" : "bg-slate-50"}`}
                  >
                    <p className="flex justify-center sm:justify-start">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                          esHoy ? "border-2 border-brand-red font-bold text-brand-red" : deEsteMes ? "text-slate-800" : "text-slate-400"
                        }`}
                      >
                        {numeroDia(dia)}
                      </span>
                    </p>
                    <div className="mt-0.5 space-y-0.5">
                      {items.slice(0, 3).map((i) => pastilla(i, true))}
                      {items.length > 3 && <p className="px-1 text-xs text-slate-500">+{items.length - 3} más</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {vista === "semana" && (
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => sumarDias(lunesDe(foco), i)).map((dia) => {
            const items = itemsDe(dia);
            return (
              <section key={dia} className={`rounded-xl border bg-white p-2 ${dia === hoy ? "border-brand-red" : "border-slate-200"}`}>
                <button
                  type="button"
                  onClick={() => {
                    setFoco(dia);
                    setVista("dia");
                  }}
                  className={`min-h-11 w-full text-left text-sm font-bold ${dia === hoy ? "text-brand-red" : "text-slate-700"}`}
                >
                  {INICIALES[(diaSemana(dia) + 6) % 7]} {numeroDia(dia)}
                </button>
                <div className="space-y-1">
                  {items.map((i) => pastilla(i, false))}
                  {items.length === 0 && <p className="text-sm text-slate-400">—</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {vista === "dia" && (
        <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="space-y-2">
            {itemsDe(foco).map((i) => pastilla(i, false))}
            {itemsDe(foco).length === 0 && <p className="py-6 text-center text-base text-slate-500">Nada en la agenda este día.</p>}
          </div>
          {eventosDisponibles && (
            <button
              type="button"
              onClick={() => setFormEvento({ original: null, dia: foco })}
              className="mt-3 min-h-11 w-full rounded-lg border-2 border-dashed border-slate-300 text-base text-slate-600"
            >
              + Nuevo evento este día
            </button>
          )}
        </section>
      )}

      {vista === "lista" && (
        <div className="mt-3 space-y-3">
          {diasLista
            .map((dia) => ({ dia, items: itemsDe(dia) }))
            .filter((x) => x.items.length > 0)
            .map(({ dia, items }) => (
              <section key={dia}>
                <h3 className={`mb-1 text-base font-bold ${dia === hoy ? "text-brand-red" : "text-slate-800"}`}>
                  {nombreDia(dia)}
                  {dia === hoy && " · Hoy"}
                </h3>
                <div className="space-y-1">{items.map((i) => pastilla(i, false))}</div>
              </section>
            ))}
          {diasLista.every((d) => itemsDe(d).length === 0) && (
            <p className="text-base text-slate-500">Nada en la agenda en {nombreMes(foco).toLowerCase()}.</p>
          )}
        </div>
      )}

      {eventosDisponibles && eliminados.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setVerEliminados((v) => !v)}
            aria-expanded={verEliminados}
            className="min-h-11 text-sm font-medium text-slate-600"
          >
            {verEliminados ? "▼" : "►"} Eventos eliminados ({eliminados.length})
          </button>
          {verEliminados && (
            <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {eliminados.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setFormEvento({ original: e, dia: diaBogota(e.inicio) })}
                    className="flex min-h-12 w-full items-center gap-2 px-3 text-left text-base"
                  >
                    <span className="flex-1">{e.titulo}</span>
                    <span className="text-sm text-slate-500">{nombreDia(diaBogota(e.inicio))} · Recuperar</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {formEvento && (
        <FormEvento
          original={formEvento.original}
          diaInicial={formEvento.dia}
          yo={yo}
          personas={personas}
          grupos={grupos}
          onCerrar={() => setFormEvento(null)}
          onGuardado={(e, nuevo) => {
            setEventos((prev) => (prev.some((x) => x.id === e.id) ? prev.map((x) => (x.id === e.id ? e : x)) : [...prev, e]));
            setFormEvento(null);
            const antes = eventos.find((x) => x.id === e.id);
            setFranja(
              nuevo
                ? "Evento creado"
                : e.archivado
                  ? "Evento eliminado (archivado): se recupera desde “Eventos eliminados”"
                  : antes?.archivado
                    ? "Evento recuperado"
                    : "Evento guardado",
            );
          }}
        />
      )}

      {formTarea && (
        <FormTarea
          modo="planificacion"
          original={formTarea}
          yo={yo}
          puedeAsignar
          personas={personas}
          grupos={grupos}
          conResponsable={conResponsable}
          obras={obras}
          tareas={tareas}
          onCerrar={() => setFormTarea(null)}
          onGuardada={(t) => {
            setTareas((prev) => prev.map((x) => (x.id === t.id ? t : x)));
            setFormTarea(null);
            setFranja("Tarea guardada");
          }}
          onArchivada={(id) => {
            setTareas((prev) => prev.filter((x) => x.id !== id));
            setFormTarea(null);
            setFranja("Tarea eliminada (archivada)");
          }}
        />
      )}
    </div>
  );
}

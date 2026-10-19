"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GrupoCompartir } from "@/lib/supabase/tareas";
import { fechaHoraBogota } from "@/lib/tareas";
import {
  archivarEvento,
  borradorEventoDe,
  borradorEventoVacio,
  guardarEvento,
  historialEvento,
  type BorradorEvento,
  type Evento,
  type HistorialEvento,
} from "@/lib/eventos";
import { ElegirParticipantes } from "@/components/tareas/ElegirParticipantes";

const CAMPO = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base";
const ETIQUETA = "text-sm font-semibold text-slate-700";

function describir(e: HistorialEvento): string {
  const d = e.detalle as Record<string, string | null>;
  switch (e.tipo) {
    case "creado":
      return "Creó el evento";
    case "fechas":
      return "Fecha u hora cambiadas";
    case "editado":
      return "Título, descripción o lugar editados";
    case "visibilidad":
      return d.a === "compartida" ? "Visibilidad: Interna (solo yo) → Equipo" : "Visibilidad: Equipo → Interna (solo yo)";
    case "archivado":
      return "Eliminado (archivado)";
    case "recuperado":
      return "Recuperado";
    case "participante":
      return `${d.accion === "quitado" ? "Dejó de compartir con" : "Compartió con"} ${d.nombre ?? "alguien"}`;
    default:
      return e.tipo;
  }
}

export function FormEvento({
  original,
  diaInicial,
  yo,
  personas,
  grupos,
  onCerrar,
  onGuardado,
}: {
  original: Evento | null;
  diaInicial: string;
  yo: string;
  personas: { id: string; nombre: string }[];
  grupos: GrupoCompartir[];
  onCerrar: () => void;
  onGuardado: (e: Evento, nuevo: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [b, setB] = useState<BorradorEvento>(() => (original ? borradorEventoDe(original) : borradorEventoVacio(diaInicial)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<HistorialEvento[] | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  // Solo quien lo creó lo cambia: los participantes lo ven, como una invitación.
  const soloVer = Boolean(original && original.creadoPor !== yo);
  const archivado = Boolean(original?.archivado);
  const cambiar = <K extends keyof BorradorEvento>(k: K, v: BorradorEvento[K]) => setB((p) => ({ ...p, [k]: v }));

  async function ejecutar(accion: () => Promise<{ ok: true; evento: Evento } | { ok: false; error: string }>, nuevo: boolean) {
    setError(null);
    setGuardando(true);
    try {
      const res = await accion();
      if (!res.ok) return setError(res.error);
      onGuardado(res.evento, nuevo);
    } catch (e) {
      setError(
        e instanceof Error && /fetch|network/i.test(e.message)
          ? "No hay conexión: el evento NO se guardó. Sigue escrito aquí; vuelve a intentar cuando tengas señal."
          : `No se guardó: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setGuardando(false);
    }
  }

  function eliminar() {
    if (
      !original ||
      !window.confirm("El evento se archiva: deja de verse en la agenda, queda en el historial y se puede recuperar.\n\n¿Eliminarlo?")
    )
      return;
    ejecutar(() => archivarEvento(supabase, original.id, true), false);
  }

  async function abrirHistorial() {
    setHistorialAbierto((a) => !a);
    if (original && historial === null) setHistorial(await historialEvento(supabase, original.id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl md:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{original ? "Evento" : "Nuevo evento"}</h2>
          <button type="button" onClick={onCerrar} className="min-h-11 min-w-11 rounded-lg text-2xl text-slate-500" aria-label="Cerrar">
            ×
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-base text-red-800">{error}</p>}
        {archivado && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Este evento está eliminado (archivado). Con “Recuperar” vuelve a la agenda.
          </p>
        )}
        {soloVer && (
          <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            Te lo compartieron: solo quien lo creó lo cambia.
          </p>
        )}

        <fieldset disabled={soloVer || archivado} className="space-y-4">
          <label className="block">
            <span className={ETIQUETA}>Título *</span>
            <input value={b.titulo} onChange={(e) => cambiar("titulo", e.target.value)} placeholder="Cita, reunión o recordatorio" className={CAMPO} />
          </label>

          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={b.todoElDia} onChange={(e) => cambiar("todoElDia", e.target.checked)} className="h-6 w-6" />
            <span className="text-base">Todo el día</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={ETIQUETA}>Inicio</span>
              <input
                type="date"
                value={b.diaInicio}
                onChange={(e) => setB((p) => ({ ...p, diaInicio: e.target.value, diaFin: p.diaFin < e.target.value ? e.target.value : p.diaFin }))}
                className={CAMPO}
              />
            </label>
            {!b.todoElDia && (
              <label className="block">
                <span className={ETIQUETA}>Hora</span>
                <input type="time" value={b.horaInicio} onChange={(e) => cambiar("horaInicio", e.target.value)} className={CAMPO} />
              </label>
            )}
            <label className="block">
              <span className={ETIQUETA}>Fin</span>
              <input type="date" value={b.diaFin} min={b.diaInicio} onChange={(e) => cambiar("diaFin", e.target.value)} className={CAMPO} />
            </label>
            {!b.todoElDia && (
              <label className="block">
                <span className={ETIQUETA}>Hora</span>
                <input type="time" value={b.horaFin} onChange={(e) => cambiar("horaFin", e.target.value)} className={CAMPO} />
              </label>
            )}
          </div>

          <label className="block">
            <span className={ETIQUETA}>Lugar (opcional)</span>
            <input value={b.lugar} onChange={(e) => cambiar("lugar", e.target.value)} className={CAMPO} />
          </label>

          <label className="block">
            <span className={ETIQUETA}>Descripción</span>
            <textarea rows={3} value={b.descripcion} onChange={(e) => cambiar("descripcion", e.target.value)} className={CAMPO} />
          </label>

          <div>
            <span className={ETIQUETA}>Visibilidad</span>
            <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup">
              {(
                [
                  { v: "interna", t: "🔒 Interna (solo yo)", d: "Tu agenda: nadie más lo ve." },
                  { v: "compartida", t: "👥 Asignar al equipo", d: "Lo ven las personas y grupos que elijas." },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="radio"
                  aria-checked={b.visibilidad === o.v}
                  onClick={() => setB((p) => ({ ...p, visibilidad: o.v, participantes: o.v === "interna" ? [] : p.participantes }))}
                  className={`flex min-h-11 items-start gap-2 rounded-lg border-2 p-3 text-left ${b.visibilidad === o.v ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${b.visibilidad === o.v ? "border-[6px] border-slate-900" : "border-slate-400"}`}
                  />
                  <span>
                    <span className="block text-sm font-semibold">{o.t}</span>
                    <span className="block text-xs text-slate-600">{o.d}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {b.visibilidad === "compartida" && (
            <div>
              <span className={ETIQUETA}>Con quién</span>
              <ElegirParticipantes
                yo={yo}
                personas={personas}
                grupos={grupos}
                valor={b.participantes}
                onCambiar={(v) => cambiar("participantes", v)}
                soloLectura={soloVer}
                que="lo"
              />
            </div>
          )}
        </fieldset>

        {original && (
          <div className="mt-4">
            <button type="button" onClick={abrirHistorial} aria-expanded={historialAbierto} className="min-h-11 text-base font-semibold text-slate-700">
              {historialAbierto ? "▼" : "►"} Seguimiento / historial
            </button>
            {historialAbierto && (
              <ul className="mt-1 space-y-2 border-l-2 border-slate-200 pl-3">
                {historial === null && <li className="text-sm text-slate-500">Cargando…</li>}
                {historial?.map((e) => (
                  <li key={e.id}>
                    <p className="text-xs text-slate-500">
                      {fechaHoraBogota(e.creadoEn)} · {e.actorNombre ?? "—"}
                    </p>
                    <p className="text-sm text-slate-800">{describir(e)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Eliminar · Cancelar · Guardar */}
        <div className="mt-5 flex flex-wrap gap-2">
          {original && !soloVer && !archivado && (
            <button type="button" onClick={eliminar} disabled={guardando} className="min-h-12 rounded-lg border-2 border-red-200 px-4 text-base font-medium text-red-700">
              Eliminar
            </button>
          )}
          {original && !soloVer && archivado && (
            <button
              type="button"
              onClick={() => ejecutar(() => archivarEvento(supabase, original.id, false), false)}
              disabled={guardando}
              className="min-h-12 rounded-lg border-2 border-green-300 px-4 text-base font-medium text-green-800"
            >
              Recuperar
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onCerrar} disabled={guardando} className="min-h-12 rounded-lg border-2 border-slate-300 px-5 text-base font-medium">
            {soloVer ? "Cerrar" : "Cancelar"}
          </button>
          {!soloVer && !archivado && (
            <button
              type="button"
              onClick={() => ejecutar(() => guardarEvento(supabase, original, b), !original)}
              disabled={guardando || !b.titulo.trim()}
              className="min-h-12 rounded-lg bg-slate-900 px-6 text-base font-semibold text-white disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  COLUMNAS,
  ETIQUETA_ESTADO,
  PRIORIDADES,
  type EstadoTarea,
  type Obra,
  type Tarea,
} from "@/lib/tareas";
import {
  archivarTarea,
  borradorDe,
  borradorVacio,
  guardarTarea,
  historialTarea,
  type BorradorTarea,
  type EventoTarea,
} from "@/lib/tareas-guardar";

const CAMPO = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base md:text-lg";
const ETIQUETA = "text-sm font-semibold text-slate-700 md:text-base";

function describirEvento(e: EventoTarea, nombreDe: (id: string) => string): string {
  const d = e.detalle as Record<string, string | boolean | null>;
  switch (e.tipo) {
    case "creada":
      return "Creó la tarea";
    case "estado":
      return `Movió de ${ETIQUETA_ESTADO[d.de as EstadoTarea] ?? d.de} a ${ETIQUETA_ESTADO[d.a as EstadoTarea] ?? d.a}`;
    case "prioridad":
      return `Prioridad: ${String(d.de).toUpperCase()} → ${String(d.a).toUpperCase()}`;
    case "fechas":
      return "Cambió las fechas";
    case "visibilidad":
      return d.a === "equipo" ? "La pasó al equipo" : "La volvió interna";
    case "obra":
      return "Cambió la obra";
    case "edicion":
      return "Editó el título o la descripción";
    case "archivada":
      return d.archivada ? "La archivó" : "La sacó del archivo";
    case "asignacion":
      return `${d.accion === "quitado" ? "Quitó a" : "Asignó a"} ${d.nombre ?? "alguien"}`;
    case "subtarea":
      return `Subtarea ${d.accion}: ${d.titulo}`;
    case "dependencia":
      return `${d.accion === "quitada" ? "Quitó la espera a" : "Ahora espera a"} ${nombreDe(String(d.bloqueante_id))} (${d.tipo === "para_cerrar" ? "para cerrar" : "para empezar"})`;
    case "nota":
      return `Nota: ${e.nota ?? ""}`;
    default:
      return e.tipo;
  }
}

export function FormTarea({
  original,
  estadoInicial = "por_hacer",
  obraInicial = "",
  fechaInicial = "",
  borradorInicial,
  yo,
  puedeAsignar,
  personas,
  obras,
  tareas,
  onCerrar,
  onGuardada,
  onArchivada,
}: {
  original: Tarea | null;
  estadoInicial?: EstadoTarea;
  obraInicial?: string;
  fechaInicial?: string;
  /** Borrador ya armado (p. ej. desde una sugerencia del técnico). */
  borradorInicial?: BorradorTarea;
  yo: string;
  puedeAsignar: boolean;
  personas: { id: string; nombre: string }[];
  obras: Obra[];
  tareas: Tarea[];
  onCerrar: () => void;
  onGuardada: (t: Tarea, nueva: boolean) => void;
  onArchivada?: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [b, setB] = useState<BorradorTarea>(() => {
    if (original) return borradorDe(original);
    if (borradorInicial) return borradorInicial;
    const v = borradorVacio(estadoInicial);
    // Una obra elegida en el tablero y permiso de asignar: arranca como tarea de equipo.
    if (obraInicial && puedeAsignar) {
      v.visibilidad = "equipo";
      v.obra = obraInicial;
    }
    v.fechaProgramada = fechaInicial;
    return v;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevaSubtarea, setNuevaSubtarea] = useState("");
  const [dependeDe, setDependeDe] = useState("");
  const [tipoDependencia, setTipoDependencia] = useState<"para_empezar" | "para_cerrar">("para_empezar");
  const [historial, setHistorial] = useState<EventoTarea[] | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);

  // El asignado que no es Operativo ni la creó: solo mueve de columna, marca subtareas y
  // deja notas (la base lo exige igual; acá no se le ofrece lo que no puede hacer).
  const soloMover = Boolean(original && !puedeAsignar && original.creadaPor !== yo);
  const porId = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas]);
  const nombreDe = (id: string) => porId.get(id)?.titulo ?? "una tarea que no puedes ver";
  const cambiar = <K extends keyof BorradorTarea>(k: K, v: BorradorTarea[K]) => setB((p) => ({ ...p, [k]: v }));

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const minimo = tareas.filter((t) => t.estado === b.estado).reduce((m, t) => Math.min(m, t.orden), Infinity);
      const res = await guardarTarea(supabase, original, b, {
        soloMover,
        ordenNueva: Number.isFinite(minimo) ? minimo - 1000 : 1000,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onGuardada(res.tarea, !original);
    } catch (e) {
      // Nunca en silencio: el formulario queda abierto con todo lo escrito.
      setError(
        e instanceof Error && /fetch|network/i.test(e.message)
          ? "No hay conexión: la tarea NO se guardó. Sigue escrita aquí; vuelve a intentar cuando tengas señal."
          : `No se guardó: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setGuardando(false);
    }
  }

  async function archivar() {
    if (!original || !window.confirm("¿Archivar esta tarea? No se borra: queda en el historial.")) return;
    const res = await archivarTarea(supabase, original.id);
    if (!res.ok) return setError(res.error);
    onArchivada?.(original.id);
  }

  async function abrirHistorial() {
    setHistorialAbierto((a) => !a);
    if (original && historial === null) setHistorial(await historialTarea(supabase, original.id));
  }

  const opcionesDependencia = tareas.filter(
    (t) => t.id !== original?.id && !b.dependencias.some((d) => d.bloqueanteId === t.id),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl md:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold md:text-xl">{original ? "Tarea" : "Nueva tarea"}</h2>
          <button type="button" onClick={onCerrar} className="min-h-11 min-w-11 rounded-lg text-2xl text-slate-500" aria-label="Cerrar">
            ×
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-base text-red-800">{error}</p>}
        {soloMover && (
          <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            Estás asignado: puedes moverla de columna, marcar subtareas y dejar notas. El resto lo cambia Operativo.
          </p>
        )}

        <div className="space-y-4">
          <label className="block">
            <span className={ETIQUETA}>Título *</span>
            <input value={b.titulo} disabled={soloMover} onChange={(e) => cambiar("titulo", e.target.value)} className={CAMPO} />
          </label>

          <label className="block">
            <span className={ETIQUETA}>Descripción</span>
            <textarea
              rows={3}
              value={b.descripcion}
              disabled={soloMover}
              onChange={(e) => cambiar("descripcion", e.target.value)}
              placeholder="Contexto o criterio de listo"
              className={CAMPO}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={ETIQUETA}>Día</span>
              <input type="date" value={b.fechaProgramada} disabled={soloMover} onChange={(e) => cambiar("fechaProgramada", e.target.value)} className={CAMPO} />
            </label>
            <label className="block">
              <span className={ETIQUETA}>Hora (opcional)</span>
              <input type="time" value={b.hora} disabled={soloMover || !b.fechaProgramada} onChange={(e) => cambiar("hora", e.target.value)} className={CAMPO} />
            </label>
          </div>

          <label className="block">
            <span className={ETIQUETA}>Fecha límite</span>
            <input type="date" value={b.fechaLimite} disabled={soloMover} onChange={(e) => cambiar("fechaLimite", e.target.value)} className={CAMPO} />
          </label>

          <div>
            <span className={ETIQUETA}>Prioridad</span>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {PRIORIDADES.map((p) => (
                <button
                  key={p.valor}
                  type="button"
                  disabled={soloMover}
                  onClick={() => cambiar("prioridad", p.valor)}
                  className={`min-h-11 rounded-lg border-2 text-xs font-bold md:text-sm ${
                    b.prioridad === p.valor ? `border-slate-900 ${p.clase}` : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {p.etiqueta}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={ETIQUETA}>Columna</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {COLUMNAS.map((c) => (
                <button
                  key={c.estado}
                  type="button"
                  onClick={() => cambiar("estado", c.estado)}
                  className={`min-h-11 rounded-lg border-2 border-t-4 text-sm font-semibold ${c.borde} ${
                    b.estado === c.estado ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {c.titulo}
                </button>
              ))}
            </div>
          </div>

          {/* Visibilidad: al que no puede asignar (el técnico) ni se le muestra "equipo". */}
          {puedeAsignar && !soloMover && (
            <div>
              <span className={ETIQUETA}>Visibilidad</span>
              <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup">
                {(
                  [
                    { v: "interna", t: "🔒 Interna (solo yo)", d: "Tu agenda: nadie más la ve." },
                    { v: "equipo", t: "👥 Asignar al equipo", d: "La ven los asignados y Operativo." },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={b.visibilidad === o.v}
                    onClick={() => setB((p) => ({ ...p, visibilidad: o.v, asignados: o.v === "interna" ? [] : p.asignados }))}
                    className={`rounded-lg border-2 p-3 text-left ${b.visibilidad === o.v ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                  >
                    <span className="block text-sm font-semibold md:text-base">{o.t}</span>
                    <span className="block text-xs text-slate-600">{o.d}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className={ETIQUETA}>
              {b.visibilidad === "equipo" ? "Obra (proyecto o visita) *" : "Obra (opcional)"}
            </span>
            <select value={b.obra} disabled={soloMover} onChange={(e) => cambiar("obra", e.target.value)} className={CAMPO}>
              <option value="">{b.visibilidad === "equipo" ? "Elegir la obra…" : "Sin obra"}</option>
              {obras.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.clave.startsWith("p:") ? "Proyecto · " : "Visita · "}
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>

          {b.visibilidad === "equipo" && puedeAsignar && !soloMover && (
            <div>
              <span className={ETIQUETA}>Asignar a</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {personas.map((p) => {
                  const activo = b.asignados.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        cambiar("asignados", activo ? b.asignados.filter((x) => x !== p.id) : [...b.asignados, p.id])
                      }
                      className={`min-h-11 rounded-full border-2 px-3 text-sm ${activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
                    >
                      {p.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <span className={ETIQUETA}>Subtareas</span>
            <ul className="mt-1 space-y-1">
              {b.subtareas.map((s, i) => (
                <li key={s.id ?? `nueva-${i}`} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.hecha}
                    onChange={(e) =>
                      cambiar("subtareas", b.subtareas.map((x, j) => (j === i ? { ...x, hecha: e.target.checked } : x)))
                    }
                    className="h-6 w-6"
                  />
                  <span className={`flex-1 text-base ${s.hecha ? "text-slate-400 line-through" : ""}`}>{s.titulo}</span>
                  {!soloMover && (
                    <button
                      type="button"
                      onClick={() => cambiar("subtareas", b.subtareas.filter((_, j) => j !== i))}
                      className="min-h-11 min-w-11 text-slate-400"
                      aria-label="Quitar subtarea"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <input
              value={nuevaSubtarea}
              onChange={(e) => setNuevaSubtarea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nuevaSubtarea.trim()) {
                  e.preventDefault();
                  cambiar("subtareas", [...b.subtareas, { id: null, titulo: nuevaSubtarea.trim(), hecha: false }]);
                  setNuevaSubtarea("");
                }
              }}
              enterKeyHint="enter"
              placeholder="Escribe una subtarea y da Enter"
              className={CAMPO}
            />
          </div>

          <div>
            <span className={ETIQUETA}>Espera a (dependencias)</span>
            <ul className="mt-1 space-y-1">
              {b.dependencias.map((d) => (
                <li key={d.bloqueanteId} className="flex min-h-11 items-center gap-2 text-base">
                  <span className="flex-1">
                    {nombreDe(d.bloqueanteId)}{" "}
                    <span className="text-sm text-slate-500">({d.tipo === "para_cerrar" ? "para cerrar" : "para empezar"})</span>
                  </span>
                  {!soloMover && (
                    <button
                      type="button"
                      onClick={() => cambiar("dependencias", b.dependencias.filter((x) => x.bloqueanteId !== d.bloqueanteId))}
                      className="min-h-11 min-w-11 text-slate-400"
                      aria-label="Quitar dependencia"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!soloMover && opcionesDependencia.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                <select value={dependeDe} onChange={(e) => setDependeDe(e.target.value)} className={`${CAMPO} mt-0 flex-1`}>
                  <option value="">Elegir la tarea que debe terminar antes…</option>
                  {opcionesDependencia.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.titulo} ({ETIQUETA_ESTADO[t.estado]})
                    </option>
                  ))}
                </select>
                <select
                  value={tipoDependencia}
                  onChange={(e) => setTipoDependencia(e.target.value as "para_empezar" | "para_cerrar")}
                  className={`${CAMPO} mt-0 w-auto`}
                >
                  <option value="para_empezar">para empezar</option>
                  <option value="para_cerrar">para cerrar</option>
                </select>
                <button
                  type="button"
                  disabled={!dependeDe}
                  onClick={() => {
                    cambiar("dependencias", [...b.dependencias, { bloqueanteId: dependeDe, tipo: tipoDependencia }]);
                    setDependeDe("");
                  }}
                  className="min-h-11 rounded-lg border-2 border-slate-400 px-4 text-sm font-semibold disabled:opacity-40"
                >
                  Agregar
                </button>
              </div>
            )}
          </div>

          <label className="block">
            <span className={ETIQUETA}>Nota de seguimiento (queda en el historial)</span>
            <textarea rows={2} value={b.nota} onChange={(e) => cambiar("nota", e.target.value)} className={CAMPO} />
          </label>

          {original && (
            <div>
              <button type="button" onClick={abrirHistorial} className="min-h-11 text-base font-semibold text-slate-700">
                {historialAbierto ? "▾" : "▸"} Historial
              </button>
              {historialAbierto && (
                <ul className="mt-1 space-y-1 border-l-2 border-slate-200 pl-3 text-sm">
                  {historial === null && <li className="text-slate-500">Cargando…</li>}
                  {historial?.map((e) => (
                    <li key={e.id}>
                      <span className="text-slate-500">
                        {new Date(e.creadoEn).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })} ·{" "}
                        {e.actorNombre ?? "—"}:
                      </span>{" "}
                      {describirEvento(e, nombreDe)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {original && !soloMover && (
            <button type="button" onClick={archivar} disabled={guardando} className="min-h-12 rounded-lg px-3 text-sm font-medium text-slate-500">
              Archivar
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onCerrar} disabled={guardando} className="min-h-12 rounded-lg border-2 border-slate-300 px-5 text-base font-medium">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !b.titulo.trim()}
            className="min-h-12 rounded-lg bg-slate-900 px-6 text-base font-semibold text-white disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

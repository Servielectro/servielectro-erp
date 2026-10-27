"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GrupoCompartir, ModoTareas } from "@/lib/supabase/tareas";
import {
  COLUMNAS,
  ETIQUETA_ESTADO,
  fechaHoraBogota,
  PRIORIDADES,
  type EstadoTarea,
  type Obra,
  type Tarea,
  type VisibilidadTarea,
} from "@/lib/tareas";
import {
  archivarTarea,
  borradorDe,
  borradorVacio,
  guardarTarea,
  historialTarea,
  recuperarTarea,
  type BorradorTarea,
  type EventoTarea,
} from "@/lib/tareas-guardar";
import { ElegirParticipantes } from "./ElegirParticipantes";
import { EliminarDefinitivo } from "@/components/eliminar/EliminarDefinitivo";

const CAMPO = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base";
const ETIQUETA = "text-sm font-semibold text-slate-700";

const NOMBRE_VISIBILIDAD: Record<VisibilidadTarea, string> = {
  interna: "Interna (solo yo)",
  compartida: "Equipo",
  equipo: "Obra",
};

/** El cambio, en el formato del pantallazo: "Columna: Por hacer → En progreso". */
function describirEvento(e: EventoTarea, nombreDe: (id: string) => string): string {
  const d = e.detalle as Record<string, string | boolean | null>;
  switch (e.tipo) {
    case "creada":
      return "Creó la tarea";
    case "estado":
      return `Columna: ${ETIQUETA_ESTADO[d.de as EstadoTarea] ?? d.de} → ${ETIQUETA_ESTADO[d.a as EstadoTarea] ?? d.a}`;
    case "prioridad":
      return `Prioridad: ${String(d.de).toUpperCase()} → ${String(d.a).toUpperCase()}`;
    case "fechas":
      return "Fechas cambiadas";
    case "visibilidad":
      return `Visibilidad: ${NOMBRE_VISIBILIDAD[d.de as VisibilidadTarea] ?? d.de} → ${NOMBRE_VISIBILIDAD[d.a as VisibilidadTarea] ?? d.a}`;
    case "obra":
      return "Obra cambiada";
    case "edicion":
      return "Título o descripción editados";
    case "archivada":
      return d.archivada ? "Eliminada (archivada)" : "Recuperada";
    case "asignacion":
      return `${d.accion === "quitado" ? "Quitó a" : "Asignó a"} ${d.nombre ?? "alguien"}`;
    case "participante":
      return `${d.accion === "quitado" ? "Dejó de compartir con" : "Compartió con"} ${d.nombre ?? "alguien"}`;
    case "subtarea":
      if (d.accion === "responsable") return `Subtarea “${d.titulo}”: responsable ${d.responsable ?? "Sin asignar"}`;
      return `Subtarea ${d.accion}: ${d.titulo}`;
    case "dependencia":
      return `${d.accion === "quitada" ? "Quitó la espera a" : "Ahora espera a"} ${nombreDe(String(d.bloqueante_id))} (${d.tipo === "para_cerrar" ? "para cerrar" : "para empezar"})`;
    case "transferida":
      return `Transferida de ${d.de_nombre ?? "—"} a ${d.a_nombre ?? "—"}. Motivo: ${d.motivo ?? ""}`;
    case "nota":
      return e.nota ?? "";
    default:
      return e.tipo;
  }
}

export function FormTarea({
  modo = "operativo",
  original,
  estadoInicial = "por_hacer",
  obraInicial = "",
  fechaInicial = "",
  borradorInicial,
  yo,
  puedeAsignar,
  personas,
  grupos = [],
  conResponsable = true,
  obras,
  tareas,
  onCerrar,
  onGuardada,
  onArchivada,
  puedeEliminar = false,
  onEliminada,
  onRecuperada,
}: {
  /** operativo: tarea de obra (equipo) · planificacion: interna o compartida. */
  modo?: ModoTareas;
  original: Tarea | null;
  estadoInicial?: EstadoTarea;
  obraInicial?: string;
  fechaInicial?: string;
  /** Borrador ya armado (p. ej. desde una sugerencia del técnico). */
  borradorInicial?: BorradorTarea;
  yo: string;
  /** operativo/trabajar u planificacion/trabajar, según el modo. */
  puedeAsignar: boolean;
  personas: { id: string; nombre: string }[];
  grupos?: GrupoCompartir[];
  /** false si la migración 54 no está corrida: no se ofrece responsable de subtarea. */
  conResponsable?: boolean;
  obras: Obra[];
  tareas: Tarea[];
  onCerrar: () => void;
  onGuardada: (t: Tarea, nueva: boolean) => void;
  onArchivada?: (id: string) => void;
  /** operativo/trabajar: puede eliminar definitivamente (con contraseña). */
  puedeEliminar?: boolean;
  onEliminada?: (id: string) => void;
  onRecuperada?: (t: Tarea) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const planificacion = modo === "planificacion";
  const [b, setB] = useState<BorradorTarea>(() => {
    if (original) return borradorDe(original);
    if (borradorInicial) return borradorInicial;
    const v = borradorVacio(estadoInicial);
    // En Operativo toda tarea es de obra; en Planificación arranca interna.
    if (!planificacion) {
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

  // Quien no la creó: solo la mueve de columna, marca subtareas y deja notas. En Operativo,
  // además quien tiene operativo/trabajar edita las de obra. La base lo exige igual; acá no
  // se le ofrece lo que no puede hacer.
  const soloMover = Boolean(original && original.creadaPor !== yo && (planificacion || !puedeAsignar));
  const archivada = Boolean(original?.archivada);
  const porId = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas]);
  const nombreDe = (id: string) => porId.get(id)?.titulo ?? "una tarea que no puedes ver";
  const nombrePersona = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);
  const [avisoGrupo, setAvisoGrupo] = useState<string | null>(null);
  const cambiar = <K extends keyof BorradorTarea>(k: K, v: BorradorTarea[K]) => setB((p) => ({ ...p, [k]: v }));

  function agregarSubtarea() {
    const titulo = nuevaSubtarea.trim();
    if (!titulo) return;
    cambiar("subtareas", [...b.subtareas, { id: null, titulo, hecha: false, responsableId: null }]);
    setNuevaSubtarea("");
  }

  async function guardar() {
    setError(null);
    if (!planificacion && !b.obra) return setError("Una tarea de obra necesita la obra (proyecto o visita).");
    if (b.visibilidad === "compartida" && b.participantes.length === 0 && !soloMover)
      return setError("Elige con quién la compartes, o déjala interna (solo yo).");
    setGuardando(true);
    try {
      const minimo = tareas.filter((t) => t.estado === b.estado).reduce((m, t) => Math.min(m, t.orden), Infinity);
      const res = await guardarTarea(supabase, original, b, {
        soloMover,
        conResponsable,
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

  // ARCHIVAR = guardar: reversible y sin contraseña. Eliminar de verdad es otro botón
  // ("Eliminar definitivamente"), que pide la contraseña y no se recupera.
  async function archivar(confirmar = true) {
    if (
      !original ||
      (confirmar &&
        !window.confirm(
          "La tarea se archiva: deja de verse en el tablero y la agenda, queda en el historial y se puede recuperar desde el filtro “Archivadas”.\n\n¿Archivarla?",
        ))
    )
      return;
    const res = await archivarTarea(supabase, original.id);
    if (!res.ok) return setError(res.error);
    onArchivada?.(original.id);
  }

  async function recuperar() {
    if (!original) return;
    const res = await recuperarTarea(supabase, original.id);
    if (!res.ok) return setError(res.error);
    onRecuperada?.(res.tarea);
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
          <h2 className="text-lg font-bold">{original ? "Tarea" : "Nueva tarea"}</h2>
          <button type="button" onClick={onCerrar} className="min-h-11 min-w-11 rounded-lg text-2xl text-slate-500" aria-label="Cerrar">
            ×
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-base text-red-800">{error}</p>}
        {archivada && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Esta tarea está eliminada (archivada). Con “Recuperar” vuelve al tablero y a la agenda.
          </p>
        )}
        {soloMover && !archivada && (
          <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {planificacion
              ? "Te la compartieron: puedes moverla de columna, marcar subtareas y dejar notas. El resto lo cambia quien la creó."
              : "Estás asignado: puedes moverla de columna, marcar subtareas y dejar notas. El resto lo cambia Operativo."}
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
              <span className={ETIQUETA}>Fecha</span>
              <input type="date" value={b.fechaProgramada} disabled={soloMover} onChange={(e) => cambiar("fechaProgramada", e.target.value)} className={CAMPO} />
            </label>
            <label className="block">
              <span className={ETIQUETA}>Hora (opcional)</span>
              <input type="time" value={b.hora} disabled={soloMover || !b.fechaProgramada} onChange={(e) => cambiar("hora", e.target.value)} className={CAMPO} />
            </label>
          </div>
          {/* La base no acepta hora sin fecha (migración 50): se dice, no se apaga en silencio. */}
          {!soloMover && !b.fechaProgramada && (
            <p className="-mt-2 text-sm text-slate-600">Para poner la hora, elige primero la fecha.</p>
          )}

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
                  className={`min-h-11 rounded-lg border-2 text-xs font-bold ${
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

          {/* Visibilidad (Planificación): "👥 Asignar al equipo" = compartida con personas y grupos. */}
          {planificacion && !soloMover && (
            <div>
              <span className={ETIQUETA}>Visibilidad</span>
              <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup">
                {(
                  [
                    { v: "interna", t: "🔒 Interna (solo yo)", d: "Tu agenda: nadie más la ve." },
                    { v: "compartida", t: "👥 Asignar al equipo", d: "La ven las personas y grupos que elijas." },
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
          )}

          {planificacion && b.visibilidad === "compartida" && (
            <div>
              <span className={ETIQUETA}>Con quién</span>
              <ElegirParticipantes
                yo={yo}
                personas={personas}
                grupos={grupos}
                valor={b.participantes}
                onCambiar={(v) => cambiar("participantes", v)}
                soloLectura={soloMover}
              />
            </div>
          )}

          <label className="block">
            <span className={ETIQUETA}>{planificacion ? "Obra (opcional)" : "Obra (proyecto o visita) *"}</span>
            <select value={b.obra} disabled={soloMover} onChange={(e) => cambiar("obra", e.target.value)} className={CAMPO}>
              <option value="">{planificacion ? "Sin obra" : "Elegir la obra…"}</option>
              {obras.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.clave.startsWith("p:") ? "Proyecto · " : "Visita · "}
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>

          {!planificacion && puedeAsignar && !soloMover && (
            <div>
              <span className={ETIQUETA}>Asignar a</span>
              {/* Un grupo agrega a cada uno de sus miembros como asignado: cada técnico la ve como suya
                  y marca su avance (una tarea "del grupo" sin responsable concreto no la hace nadie). */}
              {grupos.some((g) => g.miembrosIds?.length) && (
                <div className="mt-1">
                  <p className="text-xs text-slate-500">Grupos: tocar uno agrega a todos sus miembros (después puedes quitar a alguien).</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {grupos
                      .filter((g) => g.miembrosIds?.length)
                      .map((g) => {
                        const asignables = (g.miembrosIds ?? []).filter((id) => nombrePersona.has(id));
                        const faltan = asignables.filter((id) => !b.asignados.includes(id));
                        return (
                          <button
                            key={g.id}
                            type="button"
                            disabled={!faltan.length}
                            onClick={() => {
                              cambiar("asignados", [...b.asignados, ...faltan]);
                              const fuera = (g.miembrosIds ?? []).length - asignables.length;
                              setAvisoGrupo(
                                fuera > 0
                                  ? `Del grupo ${g.nombre} se agregaron ${faltan.length}; ${fuera} no pueden recibir tareas de obra (no tienen Técnico ni Operativo).`
                                  : `Se agregaron los ${faltan.length} del grupo ${g.nombre}.`,
                              );
                            }}
                            className="min-h-11 rounded-full border-2 border-dashed border-slate-500 px-3 text-sm disabled:opacity-50"
                          >
                            👥 {g.nombre} ({asignables.length}){!faltan.length && asignables.length ? " · ya están" : ""}
                          </button>
                        );
                      })}
                  </div>
                  {avisoGrupo && <p className="mt-1 text-xs text-slate-600">{avisoGrupo}</p>}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">Personas:</p>
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
              <p className={`mt-2 rounded-md px-3 py-2 text-sm ${b.asignados.length ? "bg-slate-100 text-slate-800" : "bg-amber-50 text-amber-900"}`}>
                {b.asignados.length === 0
                  ? "Sin asignar: nadie la va a ver como suya."
                  : `Se asigna a ${b.asignados.length} ${b.asignados.length === 1 ? "persona" : "personas"}: ${b.asignados.map((id) => nombrePersona.get(id) ?? "—").join(", ")}. A cada una le llega el aviso.`}
              </p>
            </div>
          )}

          <div>
            <span className={ETIQUETA}>Subtareas</span>
            <ul className="mt-1 space-y-1">
              {b.subtareas.map((s, i) => (
                <li key={s.id ?? `nueva-${i}`} className="flex min-h-11 flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.hecha}
                    onChange={(e) =>
                      cambiar("subtareas", b.subtareas.map((x, j) => (j === i ? { ...x, hecha: e.target.checked } : x)))
                    }
                    className="h-6 w-6"
                    aria-label={`Marcar ${s.titulo}`}
                  />
                  <span className={`min-w-0 flex-1 text-base ${s.hecha ? "text-slate-400 line-through" : ""}`}>{s.titulo}</span>
                  {conResponsable &&
                    (soloMover ? (
                      <span className="text-sm text-slate-500">{s.responsableId ? nombrePersona.get(s.responsableId) ?? "—" : "Sin asignar"}</span>
                    ) : (
                      <select
                        value={s.responsableId ?? ""}
                        onChange={(e) =>
                          cambiar(
                            "subtareas",
                            b.subtareas.map((x, j) => (j === i ? { ...x, responsableId: e.target.value || null } : x)),
                          )
                        }
                        className="min-h-11 max-w-[45%] rounded-lg border border-slate-300 bg-white px-2 text-sm"
                        aria-label={`Responsable de ${s.titulo}`}
                      >
                        <option value="">Sin asignar</option>
                        {personas.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id === yo ? `${p.nombre} (yo)` : p.nombre}
                          </option>
                        ))}
                      </select>
                    ))}
                  {!soloMover && (
                    <button
                      type="button"
                      onClick={() => cambiar("subtareas", b.subtareas.filter((_, j) => j !== i))}
                      className="min-h-11 min-w-11 text-xl text-slate-400"
                      aria-label="Quitar subtarea"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!soloMover && (
              <div className="mt-1 flex gap-2">
                <input
                  value={nuevaSubtarea}
                  onChange={(e) => setNuevaSubtarea(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      agregarSubtarea();
                    }
                  }}
                  enterKeyHint="enter"
                  placeholder="Agregar subtarea y Enter"
                  className={`${CAMPO} mt-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={agregarSubtarea}
                  disabled={!nuevaSubtarea.trim()}
                  className="min-h-11 min-w-11 rounded-lg border-2 border-slate-400 text-xl font-bold disabled:opacity-40"
                  aria-label="Agregar subtarea"
                >
                  +
                </button>
              </div>
            )}
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
            <span className={ETIQUETA}>Nota de seguimiento (opcional)</span>
            <textarea
              rows={2}
              value={b.nota}
              onChange={(e) => cambiar("nota", e.target.value)}
              placeholder="Comentario al guardar"
              className={CAMPO}
            />
          </label>

          {original && (
            <div>
              <button
                type="button"
                onClick={abrirHistorial}
                aria-expanded={historialAbierto}
                className="min-h-11 text-base font-semibold text-slate-700"
              >
                {historialAbierto ? "▼" : "►"} Seguimiento / historial
              </button>
              {historialAbierto && (
                <ul className="mt-1 space-y-2 border-l-2 border-slate-200 pl-3">
                  {historial === null && <li className="text-sm text-slate-500">Cargando…</li>}
                  {historial?.length === 0 && <li className="text-sm text-slate-500">Sin movimientos todavía.</li>}
                  {historial?.map((e) => (
                    <li key={e.id}>
                      <p className="text-xs text-slate-500">
                        {fechaHoraBogota(e.creadoEn)} · {e.actorNombre ?? "—"}
                      </p>
                      <p className="text-sm text-slate-800">{describirEvento(e, nombreDe)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Archivar · Eliminar definitivamente · Cancelar · Guardar. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {original && !soloMover && !archivada && (
            <button
              type="button"
              onClick={() => archivar()}
              disabled={guardando}
              className="min-h-12 rounded-lg border-2 border-slate-300 px-4 text-base font-medium text-slate-800"
            >
              Archivar
            </button>
          )}
          {original && puedeEliminar && (
            <EliminarDefinitivo
              tipo="tarea"
              id={original.id}
              titulo={original.titulo}
              onEliminado={() => onEliminada?.(original.id)}
              onArchivar={archivada ? undefined : () => archivar(false)}
            />
          )}
          {original && !soloMover && archivada && (
            <button
              type="button"
              onClick={recuperar}
              disabled={guardando}
              className="min-h-12 rounded-lg border-2 border-green-300 px-4 text-base font-medium text-green-800"
            >
              Recuperar
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onCerrar} disabled={guardando} className="min-h-12 rounded-lg border-2 border-slate-300 px-5 text-base font-medium">
            Cancelar
          </button>
          {!archivada && (
            <button
              type="button"
              onClick={guardar}
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

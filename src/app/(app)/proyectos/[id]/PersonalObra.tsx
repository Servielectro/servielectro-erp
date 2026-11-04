"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { asignarPersonal, quitarAsignacion, terminarAsignacion } from "./portal-actions";

const CAMPO = "mt-0.5 w-full min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm";

export interface Asignacion {
  id: string;
  empleado_id: string;
  rol_en_obra: string | null;
  desde: string;
  hasta: string | null;
}
export interface PersonaElegible {
  id: string;
  nombre: string;
  cargo: string | null;
  estado_laboral: string | null;
}

/**
 * Personal asignado a la obra (proyecto_personal, migración 134). Es lo que alimenta la ficha
 * técnica que ve el cliente en «Personal en obra»: nombre, cédula, cargo y cursos. Asignar a alguien
 * aquí es decirle al cliente «esta persona puede entrar».
 */
export function PersonalObra({
  proyectoId,
  puedeEditar,
  asignaciones,
  personas,
  hoy,
}: {
  proyectoId: string;
  puedeEditar: boolean;
  asignaciones: Asignacion[];
  personas: PersonaElegible[];
  hoy: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [empleadoId, setEmpleadoId] = useState("");
  const [rol, setRol] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [terminando, setTerminando] = useState<string | null>(null);
  const [fechaFin, setFechaFin] = useState(hoy);

  const nombre = new Map(personas.map((p) => [p.id, p]));
  const vigente = (a: Asignacion) => a.desde <= hoy && (!a.hasta || a.hasta >= hoy);
  const futuras = asignaciones.filter((a) => a.desde > hoy);
  const actuales = asignaciones.filter(vigente);
  const pasadas = asignaciones.filter((a) => a.hasta && a.hasta < hoy);
  const yaAsignados = new Set([...actuales, ...futuras].map((a) => a.empleado_id));
  const elegibles = personas.filter((p) => p.estado_laboral !== "retirado" && !yaAsignados.has(p.id));

  function correr(f: () => Promise<{ ok: true } | { ok: false; error: string }>, despues?: () => void) {
    setError(null);
    iniciar(async () => {
      const r = await f();
      if (!r.ok) return setError(r.error);
      despues?.();
      router.refresh();
    });
  }

  function fila(a: Asignacion) {
    const p = nombre.get(a.empleado_id);
    return (
      <li key={a.id} className="space-y-1 p-3 text-sm">
        <p className="font-semibold text-slate-900">{p?.nombre ?? "(persona sin permiso de lectura)"}</p>
        <p className="text-xs text-slate-600">
          {a.rol_en_obra || p?.cargo || "—"} · desde {a.desde}
          {a.hasta ? ` hasta ${a.hasta}` : ""}
        </p>
        {puedeEditar &&
          (terminando === a.id ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-xs text-slate-600">Último día en la obra</span>
                <input type="date" value={fechaFin} min={a.desde} onChange={(e) => setFechaFin(e.target.value)} className={CAMPO} />
              </label>
              <button type="button" disabled={pendiente} onClick={() => correr(() => terminarAsignacion(a.id, proyectoId, fechaFin), () => setTerminando(null))} className="min-h-11 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">
                Guardar
              </button>
              <button type="button" onClick={() => setTerminando(null)} className="min-h-11 px-2 text-xs underline">
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {!a.hasta && (
                <button
                  type="button"
                  onClick={() => {
                    setTerminando(a.id);
                    setFechaFin(hoy < a.desde ? a.desde : hoy);
                  }}
                  className="min-h-11 text-xs font-semibold underline"
                >
                  Sale de la obra
                </button>
              )}
              <button
                type="button"
                disabled={pendiente}
                onClick={() => {
                  if (window.confirm("¿Quitar esta asignación? Úsalo solo si se asignó por error; si la persona salió de la obra, usa «Sale de la obra».")) {
                    correr(() => quitarAsignacion(a.id, proyectoId));
                  }
                }}
                className="min-h-11 text-xs text-red-700 underline"
              >
                Quitar (error)
              </button>
            </div>
          ))}
      </li>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Personal asignado a la obra</h2>
        {puedeEditar && !abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">
            + Asignar persona
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-slate-500">El cliente ve a estas personas en su portal (nombre, cédula, cargo y cursos) para autorizarles la entrada.</p>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}

      {abierto && (
        <div className="mb-3 space-y-2 rounded-lg border-2 border-slate-900 bg-white p-3 text-sm">
          <label className="block">
            <span className="text-xs text-slate-600">Persona</span>
            <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={CAMPO}>
              <option value="">— Escoge —</option>
              {elegibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.cargo ? ` · ${p.cargo}` : ""}
                </option>
              ))}
            </select>
            {personas.length === 0 && <span className="text-xs text-slate-500">No hay personal cargado en RRHH (o no tienes permiso de verlo).</span>}
          </label>
          <label className="block">
            <span className="text-xs text-slate-600">Rol en la obra (opcional; si no, su cargo)</span>
            <input value={rol} onChange={(e) => setRol(e.target.value)} placeholder="Ej.: Técnico electricista, Supervisor" className={CAMPO} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-slate-600">Desde</span>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">Hasta (opcional)</span>
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="min-h-11 rounded-md border border-slate-300 text-sm font-semibold text-slate-700">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente || !empleadoId}
              onClick={() =>
                correr(
                  () => asignarPersonal({ proyectoId, empleadoId, rolEnObra: rol, desde, hasta }),
                  () => {
                    setEmpleadoId("");
                    setRol("");
                    setHasta("");
                    setAbierto(false);
                  },
                )
              }
              className="min-h-11 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:bg-slate-400"
            >
              {pendiente ? "Guardando…" : "Asignar"}
            </button>
          </div>
        </div>
      )}

      {actuales.length === 0 && futuras.length === 0 ? (
        <p className="text-xs text-slate-500">Nadie asignado hoy.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {[...actuales, ...futuras].map((a) => (
            fila(a)
          ))}
        </ul>
      )}
      {pasadas.length > 0 && (
        <details className="mt-2 text-xs text-slate-600">
          <summary className="min-h-11 cursor-pointer content-center">Estuvieron en la obra ({pasadas.length})</summary>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
            {pasadas.map((a) => (
              fila(a)
            ))}
          </ul>
        </details>
      )}
      {!puedeEditar && <p className="mt-1 text-xs text-slate-500">Asignar personal requiere Proyectos en nivel “trabajar”.</p>}
    </section>
  );
}

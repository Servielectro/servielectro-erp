"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fechaHoraBogota } from "@/lib/tareas";

export interface GrupoAdmin {
  id: string;
  nombre: string;
  descripcion: string | null;
  archivado: boolean;
  miembros: string[];
  historial: { id: string; tipo: string; detalle: Record<string, string | null>; actorNombre: string | null; creadoEn: string }[];
}

function describir(tipo: string, d: Record<string, string | null>): string {
  switch (tipo) {
    case "creado":
      return `Creó el grupo “${d.nombre ?? ""}”`;
    case "renombrado":
      return `Nombre: ${d.de} → ${d.a}`;
    case "archivado":
      return "Archivó el grupo";
    case "desarchivado":
      return "Sacó el grupo del archivo";
    case "miembro_agregado":
      return `Agregó a ${d.nombre ?? "alguien"}`;
    case "miembro_quitado":
      return `Quitó a ${d.nombre ?? "alguien"}`;
    default:
      return tipo;
  }
}

function mensaje(e: { message?: string; code?: string } | null): string {
  const m = e?.message ?? "No se pudo guardar.";
  if (/failed to fetch|network/i.test(m)) return "No hay conexión: no se guardó. Vuelve a intentar.";
  if (/uq_grupos_nombre|duplicate key/i.test(m)) return "Ya hay un grupo con ese nombre.";
  if (/row-level security/i.test(m)) return "No tienes permiso para eso.";
  return m;
}

export function GruposAdmin({ gruposIniciales, usuarios }: { gruposIniciales: GrupoAdmin[]; usuarios: { id: string; nombre: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [grupos, setGrupos] = useState(gruposIniciales);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState<string | null>(null);
  const [verArchivados, setVerArchivados] = useState(false);
  const [agregar, setAgregar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nombreDe = new Map(usuarios.map((u) => [u.id, u.nombre]));

  /** Relee un grupo (con miembros e historial) después de un cambio. */
  async function releer(id: string) {
    const [g, m, h] = await Promise.all([
      supabase.from("grupos").select("id, nombre, descripcion, archivado").eq("id", id).single(),
      supabase.from("grupo_miembros").select("perfil_id").eq("grupo_id", id),
      supabase.from("grupo_eventos").select("id, tipo, detalle, actor_nombre, creado_en").eq("grupo_id", id).order("creado_en", { ascending: false }),
    ]);
    if (!g.data) return;
    const nuevo: GrupoAdmin = {
      id: g.data.id,
      nombre: g.data.nombre,
      descripcion: g.data.descripcion,
      archivado: g.data.archivado,
      miembros: (m.data ?? []).map((x) => x.perfil_id as string),
      historial: (h.data ?? []).map((e) => ({
        id: e.id,
        tipo: e.tipo,
        detalle: (e.detalle ?? {}) as Record<string, string | null>,
        actorNombre: e.actor_nombre,
        creadoEn: e.creado_en,
      })),
    };
    setGrupos((prev) =>
      (prev.some((x) => x.id === id) ? prev.map((x) => (x.id === id ? nuevo : x)) : [...prev, nuevo]).sort((a, b) =>
        a.nombre.localeCompare(b.nombre),
      ),
    );
  }

  async function hacer(accion: () => PromiseLike<{ error: { message: string } | null }>, id: string | null, texto: string) {
    setError(null);
    setOcupado(true);
    try {
      const { error: err } = await accion();
      if (err) return setError(mensaje(err));
      if (id) await releer(id);
      setAviso(texto);
      window.setTimeout(() => setAviso(null), 3000);
    } catch (e) {
      setError(mensaje(e instanceof Error ? e : null));
    } finally {
      setOcupado(false);
    }
  }

  async function crear() {
    if (!nombre.trim()) return;
    setError(null);
    setOcupado(true);
    const { data, error: err } = await supabase
      .from("grupos")
      .insert({ nombre: nombre.trim(), descripcion: descripcion.trim() || null })
      .select("id")
      .single();
    setOcupado(false);
    if (err || !data) return setError(mensaje(err));
    await releer(data.id);
    setNombre("");
    setDescripcion("");
    setAbierto(data.id);
    setAviso("Grupo creado: agrégale miembros");
    window.setTimeout(() => setAviso(null), 3000);
  }

  const visibles = grupos.filter((g) => g.archivado === verArchivados);
  const archivados = grupos.filter((g) => g.archivado).length;

  return (
    <div className="space-y-4">
      {aviso && <p role="status" className="rounded-xl bg-green-600 px-4 py-3 text-base font-semibold text-white">{aviso}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-base text-red-800">{error}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold">Nuevo grupo</h2>
        <p className="text-sm text-slate-600">
          Un grupo sirve para compartir tareas y eventos de Planificación con varias personas a la vez. Lo ven sus miembros
          actuales: quien sale del grupo deja de verlas.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (p. ej. Oficina)" className="min-h-11 rounded-lg border border-slate-300 px-3 text-base" />
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" className="min-h-11 rounded-lg border border-slate-300 px-3 text-base" />
        </div>
        <button
          type="button"
          onClick={crear}
          disabled={ocupado || !nombre.trim()}
          className="mt-2 min-h-11 rounded-lg bg-slate-900 px-4 text-base font-semibold text-white disabled:opacity-40"
        >
          Crear grupo
        </button>
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setVerArchivados(false)}
          className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${!verArchivados ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
        >
          Activos {grupos.length - archivados}
        </button>
        <button
          type="button"
          onClick={() => setVerArchivados(true)}
          className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${verArchivados ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
        >
          Archivados {archivados}
        </button>
      </div>

      {visibles.length === 0 && <p className="text-base text-slate-500">{verArchivados ? "No hay grupos archivados." : "Todavía no hay grupos."}</p>}

      <ul className="space-y-3">
        {visibles.map((g) => {
          const estaAbierto = abierto === g.id;
          const noMiembros = usuarios.filter((u) => !g.miembros.includes(u.id));
          return (
            <li key={g.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setAbierto(estaAbierto ? null : g.id)}
                aria-expanded={estaAbierto}
                className="flex min-h-12 w-full items-center gap-2 px-4 py-2 text-left"
              >
                <span className="text-slate-500">{estaAbierto ? "▼" : "►"}</span>
                <span className="flex-1">
                  <span className="block text-base font-semibold">👥 {g.nombre}</span>
                  {g.descripcion && <span className="block text-sm text-slate-600">{g.descripcion}</span>}
                </span>
                <span className="text-sm text-slate-500">{g.miembros.length} miembros</span>
              </button>

              {estaAbierto && (
                <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Miembros</p>
                    {g.miembros.length === 0 && <p className="text-sm text-slate-500">Sin miembros todavía.</p>}
                    <ul className="mt-1 divide-y divide-slate-100">
                      {g.miembros.map((m) => (
                        <li key={m} className="flex min-h-11 items-center gap-2">
                          <span className="flex-1 text-base">{nombreDe.get(m) ?? "—"}</span>
                          {!g.archivado && (
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                hacer(
                                  () => supabase.from("grupo_miembros").delete().eq("grupo_id", g.id).eq("perfil_id", m),
                                  g.id,
                                  "Miembro quitado: deja de ver lo compartido con el grupo",
                                )
                              }
                              className="min-h-11 rounded-lg px-3 text-sm text-red-700"
                            >
                              Quitar
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {!g.archivado && noMiembros.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        <select value={agregar} onChange={(e) => setAgregar(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-base">
                          <option value="">Agregar a…</option>
                          {noMiembros.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nombre}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={ocupado || !agregar}
                          onClick={() => {
                            const perfil = agregar;
                            setAgregar("");
                            hacer(() => supabase.from("grupo_miembros").insert({ grupo_id: g.id, perfil_id: perfil }), g.id, "Miembro agregado");
                          }}
                          className="min-h-11 rounded-lg border-2 border-slate-400 px-4 text-sm font-semibold disabled:opacity-40"
                        >
                          Agregar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!g.archivado && (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => {
                          const nuevo = window.prompt("Nuevo nombre del grupo", g.nombre)?.trim();
                          if (!nuevo || nuevo === g.nombre) return;
                          hacer(() => supabase.from("grupos").update({ nombre: nuevo }).eq("id", g.id), g.id, "Grupo renombrado");
                        }}
                        className="min-h-11 rounded-lg border-2 border-slate-300 px-4 text-sm font-medium"
                      >
                        Renombrar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        if (
                          !g.archivado &&
                          !window.confirm(
                            "El grupo se archiva, no se borra: no se le agregan miembros ni se le comparte nada nuevo. Lo que ya estaba compartido con él lo siguen viendo sus miembros. Se puede sacar del archivo.\n\n¿Archivarlo?",
                          )
                        )
                          return;
                        hacer(
                          () => supabase.from("grupos").update({ archivado: !g.archivado }).eq("id", g.id),
                          g.id,
                          g.archivado ? "Grupo sacado del archivo" : "Grupo archivado",
                        );
                      }}
                      className="min-h-11 rounded-lg border-2 border-slate-300 px-4 text-sm font-medium"
                    >
                      {g.archivado ? "Sacar del archivo" : "Archivar"}
                    </button>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setVerHistorial(verHistorial === g.id ? null : g.id)}
                      aria-expanded={verHistorial === g.id}
                      className="min-h-11 text-sm font-semibold text-slate-700"
                    >
                      {verHistorial === g.id ? "▼" : "►"} Historial
                    </button>
                    {verHistorial === g.id && (
                      <ul className="mt-1 space-y-2 border-l-2 border-slate-200 pl-3">
                        {g.historial.map((e) => (
                          <li key={e.id}>
                            <p className="text-xs text-slate-500">
                              {fechaHoraBogota(e.creadoEn)} · {e.actorNombre ?? "—"}
                            </p>
                            <p className="text-sm text-slate-800">{describir(e.tipo, e.detalle)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

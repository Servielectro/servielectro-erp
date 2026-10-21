"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { diasEntre, ETIQUETA_ESTADO, fechaCorta, hoyBogota, type Obra, type Tarea } from "@/lib/tareas";
import { borradorVacio } from "@/lib/tareas-guardar";
import { FormTarea } from "@/components/tareas/FormTarea";

export interface SugerenciaBandeja {
  id: string;
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  motivo: string | null;
  requeridoPara: string | null;
  sugeridaEn: string;
  estado: "pendiente" | "en_revision" | "cotizada" | "descartada";
  motivoDescarte: string | null;
  cotizacionId: string | null;
  visita: string;
  visitaId: string;
  cliente: string | null;
  sugeridaPor: string | null;
  eventos: { de: string | null; a: string; comentario: string | null; quien: string | null; cuando: string }[];
}

const ESTADOS: { valor: SugerenciaBandeja["estado"]; etiqueta: string }[] = [
  { valor: "pendiente", etiqueta: "Pendientes" },
  { valor: "en_revision", etiqueta: "En revisión" },
  { valor: "cotizada", etiqueta: "Cotizadas" },
  { valor: "descartada", etiqueta: "Descartadas" },
];
const ETIQUETA: Record<string, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  cotizada: "Cotizada",
  descartada: "Descartada",
};

function cuando(para: string | null, hoy: string): { texto: string; clase: string } | null {
  if (!para) return null;
  const d = diasEntre(hoy, para);
  if (d < 0) return { texto: `Para el ${fechaCorta(para)} (ya pasó)`, clase: "bg-red-100 text-red-800" };
  if (d === 0) return { texto: "Para hoy", clase: "bg-red-100 text-red-800" };
  if (d === 1) return { texto: "Para mañana", clase: "bg-amber-100 text-amber-900" };
  return { texto: `Para el ${fechaCorta(para)}`, clase: "bg-slate-100 text-slate-700" };
}

export function BandejaSugerencias({
  sugerenciasIniciales,
  puedeComercial,
  puedeOperativo,
  cotizaciones,
  codigos,
  yo,
  tareasIniciales,
  obras,
  personas,
}: {
  sugerenciasIniciales: SugerenciaBandeja[];
  puedeComercial: boolean;
  puedeOperativo: boolean;
  cotizaciones: { id: string; etiqueta: string }[];
  codigos: Record<string, string>;
  yo: string;
  tareasIniciales: Tarea[];
  obras: Obra[];
  personas: { id: string; nombre: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const hoy = hoyBogota();
  const [sugerencias, setSugerencias] = useState(sugerenciasIniciales);
  const [filtro, setFiltro] = useState<SugerenciaBandeja["estado"]>("pendiente");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [accion, setAccion] = useState<{ id: string; tipo: "descartar" | "cotizar" } | null>(null);
  const [comentario, setComentario] = useState("");
  const [cotizacion, setCotizacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tareas, setTareas] = useState(tareasIniciales);
  const [tareaDesde, setTareaDesde] = useState<SugerenciaBandeja | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const tareasDe = (id: string) => tareas.filter((t) => t.sugerenciaId === id);
  // Varias sugerencias de la MISMA visita se cotizan juntas en una cotización.
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const visitaSeleccion = sugerencias.find((x) => x.id === seleccion[0])?.visitaId ?? null;

  // Borrador de tarea a partir de la sugerencia: qué conseguir, en qué obra, para cuándo.
  function borradorDesde(s: SugerenciaBandeja) {
    const b = borradorVacio("por_hacer");
    b.titulo = `Conseguir ${[s.cantidad ?? "", s.unidad ?? "", s.descripcion].join(" ").replace(/\s+/g, " ").trim()}`;
    b.descripcion = [s.motivo, `Sugerido por ${s.sugeridaPor ?? "el técnico"} en la visita "${s.visita}".`].filter(Boolean).join("\n");
    b.visibilidad = "equipo";
    b.obra = `v:${s.visitaId}`;
    b.fechaLimite = s.requeridoPara ?? "";
    b.prioridad = s.requeridoPara && diasEntre(hoy, s.requeridoPara) <= 1 ? "alta" : "media";
    b.sugerenciaId = s.id;
    return b;
  }

  async function cambiar(s: SugerenciaBandeja, estado: SugerenciaBandeja["estado"], extra: { comentario?: string; cotizacionId?: string } = {}) {
    setError(null);
    setOcupado(true);
    const { error: err } = await supabase.rpc("fn_cambiar_estado_sugerencia", {
      p_sugerencia_id: s.id,
      p_estado: estado,
      p_comentario: extra.comentario ?? null,
      p_cotizacion_id: extra.cotizacionId ?? null,
    });
    setOcupado(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSugerencias((p) =>
      p.map((x) =>
        x.id === s.id
          ? {
              ...x,
              estado,
              motivoDescarte: estado === "descartada" ? extra.comentario ?? null : estado === "pendiente" ? null : x.motivoDescarte,
              cotizacionId: estado === "cotizada" ? extra.cotizacionId ?? null : estado === "pendiente" ? null : x.cotizacionId,
              eventos: [...x.eventos, { de: x.estado, a: estado, comentario: extra.comentario ?? null, quien: "Tú", cuando: new Date().toISOString() }],
            }
          : x,
      ),
    );
    setAccion(null);
    setComentario("");
    setCotizacion("");
  }

  const lista = sugerencias.filter((s) => s.estado === filtro);

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {ESTADOS.map((e) => (
          <button
            key={e.valor}
            type="button"
            onClick={() => setFiltro(e.valor)}
            className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-semibold ${
              filtro === e.valor ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
            }`}
          >
            {e.etiqueta} <span className="opacity-70">{sugerencias.filter((s) => s.estado === e.valor).length}</span>
          </button>
        ))}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p role="status" className="mb-3 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white">{aviso}</p>}

      {puedeComercial && seleccion.length > 0 && (
        <div className="sticky top-[57px] z-10 mb-3 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-white sm:top-[65px]">
          <span className="flex-1 text-sm">
            {seleccion.length} {seleccion.length === 1 ? "sugerencia elegida" : "sugerencias elegidas"} (misma visita)
          </span>
          <button type="button" onClick={() => setSeleccion([])} className="min-h-11 px-2 text-sm underline">
            Limpiar
          </button>
          <Link
            href={`/comercial/cotizaciones/nueva?sugerencias=${seleccion.join(",")}`}
            className="min-h-11 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
          >
            Cotizar en el armador
          </Link>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No hay sugerencias en este estado.</p>
      ) : (
        <ul className="space-y-3">
          {lista.map((s) => {
            const para = cuando(s.requeridoPara, hoy);
            return (
              <li key={s.id} className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  {puedeComercial && (s.estado === "pendiente" || s.estado === "en_revision") && (
                    <label className="flex min-h-11 items-center gap-1.5 pr-1 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={seleccion.includes(s.id)}
                        disabled={Boolean(visitaSeleccion && visitaSeleccion !== s.visitaId)}
                        onChange={(e) =>
                          setSeleccion((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))
                        }
                        className="h-5 w-5"
                      />
                      Cotizar
                    </label>
                  )}
                  {para && <span className={`rounded px-1.5 py-0.5 ${para.clase}`}>{para.texto}</span>}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{ETIQUETA[s.estado]}</span>
                </div>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {s.cantidad ?? ""} {s.unidad ?? ""} {s.descripcion}
                </p>
                {s.motivo && <p className="text-sm text-slate-700">{s.motivo}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {s.visita}
                  {s.cliente ? ` · ${s.cliente}` : ""} · sugerida por {s.sugeridaPor ?? "—"} el{" "}
                  {new Date(s.sugeridaEn).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
                </p>
                {s.estado === "descartada" && s.motivoDescarte && (
                  <p className="mt-1 text-sm text-slate-700">Descartada: {s.motivoDescarte}</p>
                )}
                {s.estado === "cotizada" && s.cotizacionId && (
                  <p className="mt-1 text-sm text-green-800">Cotizada en {codigos[s.cotizacionId] ?? "una cotización"}</p>
                )}
                {tareasDe(s.id).map((t) => (
                  <p key={t.id} className="mt-1 text-sm text-slate-700">
                    🗂️ Tarea: {t.titulo} · {ETIQUETA_ESTADO[t.estado]}
                  </p>
                ))}

                {/* Acciones según permiso: tomar y cotizar, Comercial; descartar, Comercial u Operativo. */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {puedeComercial && s.estado === "pendiente" && (
                    <button type="button" disabled={ocupado} onClick={() => cambiar(s, "en_revision")} className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">
                      Tomar
                    </button>
                  )}
                  {puedeComercial && (s.estado === "pendiente" || s.estado === "en_revision") && (
                    <button type="button" disabled={ocupado} onClick={() => setAccion({ id: s.id, tipo: "cotizar" })} className="min-h-11 rounded-lg border-2 border-slate-400 px-4 text-sm font-semibold">
                      Marcar cotizada
                    </button>
                  )}
                  {(puedeComercial || puedeOperativo) && (s.estado === "pendiente" || s.estado === "en_revision") && (
                    <button type="button" disabled={ocupado} onClick={() => setAccion({ id: s.id, tipo: "descartar" })} className="min-h-11 rounded-lg border-2 border-slate-300 px-4 text-sm font-medium text-slate-700">
                      Descartar
                    </button>
                  )}
                  {(puedeComercial || puedeOperativo) && (s.estado === "descartada" || s.estado === "en_revision") && (
                    <button type="button" disabled={ocupado} onClick={() => cambiar(s, "pendiente")} className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 underline">
                      Volver a pendiente
                    </button>
                  )}
                  {puedeOperativo && s.estado !== "descartada" && tareasDe(s.id).length === 0 && (
                    <button type="button" onClick={() => setTareaDesde(s)} className="min-h-11 rounded-lg border-2 border-slate-400 px-4 text-sm font-semibold">
                      Crear tarea
                    </button>
                  )}
                  <span className="flex-1" />
                  <button type="button" onClick={() => setAbierta(abierta === s.id ? null : s.id)} className="min-h-11 text-sm text-slate-600">
                    {abierta === s.id ? "▾" : "▸"} Historial ({s.eventos.length})
                  </button>
                </div>

                {accion?.id === s.id && accion.tipo === "descartar" && (
                  <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                    <textarea
                      rows={2}
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      placeholder="Por qué se descarta (queda en el historial)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAccion(null)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={!comentario.trim() || ocupado}
                        onClick={() => cambiar(s, "descartada", { comentario: comentario.trim() })}
                        className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                )}
                {accion?.id === s.id && accion.tipo === "cotizar" && (
                  <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                    <select value={cotizacion} onChange={(e) => setCotizacion(e.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-2 text-base">
                      <option value="">¿En qué cotización quedó?</option>
                      {cotizaciones.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.etiqueta}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAccion(null)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={!cotizacion || ocupado}
                        onClick={() => cambiar(s, "cotizada", { cotizacionId: cotizacion })}
                        className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        Marcar cotizada
                      </button>
                    </div>
                  </div>
                )}

                {abierta === s.id && (
                  <ul className="mt-3 space-y-1 border-l-2 border-slate-200 pl-3 text-sm text-slate-700">
                    {s.eventos.map((e, i) => (
                      <li key={i}>
                        <span className="text-slate-500">
                          {new Date(e.cuando).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })} ·{" "}
                          {e.quien ?? "—"}:
                        </span>{" "}
                        {e.de ? `${ETIQUETA[e.de] ?? e.de} → ` : ""}
                        {ETIQUETA[e.a] ?? e.a}
                        {e.comentario ? ` — ${e.comentario}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tareaDesde && (
        <FormTarea
          original={null}
          borradorInicial={borradorDesde(tareaDesde)}
          yo={yo}
          puedeAsignar={puedeOperativo}
          personas={personas}
          obras={obras}
          tareas={tareas}
          onCerrar={() => setTareaDesde(null)}
          onGuardada={(t) => {
            setTareas((p) => [...p, t]);
            setTareaDesde(null);
            setAviso("Tarea creada y enlazada a la sugerencia");
            window.setTimeout(() => setAviso(null), 3000);
          }}
        />
      )}
    </div>
  );
}

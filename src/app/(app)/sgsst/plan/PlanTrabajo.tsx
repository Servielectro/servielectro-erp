"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export interface ItemPlan {
  id: string;
  estandar: string;
  descripcion: string | null;
  responsable_id: string | null;
  fecha_limite: string | null;
  avance: number;
  orden: number;
  archivado_en: string | null;
  motivo_archivo: string | null;
  evidencias: {
    id: string;
    item_id: string;
    descripcion: string;
    path: string | null;
    formato_id: string | null;
    subida_en: string;
    anulada_en: string | null;
    motivo_anulacion: string | null;
    url?: string | null;
  }[];
}

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base";

export function PlanTrabajo({
  items,
  personas,
  formatos,
  trabaja,
  gestiona,
  hoy,
}: {
  items: ItemPlan[];
  personas: { id: string; nombre: string }[];
  formatos: { id: string; nombre: string }[];
  trabaja: boolean;
  gestiona: boolean;
  hoy: string;
}) {
  const activos = items.filter((i) => !i.archivado_en);
  const promedio = activos.length ? Math.round(activos.reduce((a, i) => a + i.avance, 0) / activos.length) : 0;
  const nombre = new Map(personas.map((p) => [p.id, p.nombre]));
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-600">Avance de las tareas del plan</p>
        <p className="text-2xl font-bold">{activos.length ? `${promedio} %` : "—"}</p>
        <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-green-600" style={{ width: `${promedio}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {activos.length ? `Promedio simple de ${activos.length} tareas.` : "Sin tareas aparte de los estándares."}
          {activos.some((i) => i.fecha_limite && i.fecha_limite < hoy && i.avance < 100) && ` ${activos.filter((i) => i.fecha_limite && i.fecha_limite < hoy && i.avance < 100).length} vencidos.`}
        </p>
      </div>
      {gestiona && <NuevoItem personas={personas} orden={items.length} />}
      <ul className="space-y-2">
        {items.map((i) => (
          <Item key={i.id} i={i} responsable={i.responsable_id ? (nombre.get(i.responsable_id) ?? "—") : "Sin responsable"} personas={personas} formatos={formatos} trabaja={trabaja} gestiona={gestiona} hoy={hoy} />
        ))}
      </ul>
    </div>
  );
}

function NuevoItem({ personas, orden }: { personas: { id: string; nombre: string }[]; orden: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [estandar, setEstandar] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [responsable, setResponsable] = useState("");
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white">
        + Agregar tarea al plan
      </button>
    );
  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <label className="block text-sm font-medium">
        Tarea (los estándares de la Resolución ya están arriba)
        <input value={estandar} onChange={(e) => setEstandar(e.target.value)} className={CAMPO} />
      </label>
      <label className="block text-sm font-medium">
        Qué hay que hacer (opcional)
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className={CAMPO} />
      </label>
      <label className="block text-sm font-medium">
        Responsable
        <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={CAMPO}>
          <option value="">— Sin asignar —</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Fecha límite
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente || !estandar.trim()}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const { error: e } = await createClient()
                .from("sst_plan_items")
                .insert({ estandar: estandar.trim(), descripcion: descripcion.trim() || null, responsable_id: responsable || null, fecha_limite: fecha || null, orden });
              if (e) return setError(e.message);
              setAbierto(false);
              setEstandar("");
              setDescripcion("");
              router.refresh();
            })
          }
          className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
      {!estandar.trim() && <p className="text-xs text-slate-500">Escribe el estándar.</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

export function Item({
  i,
  responsable,
  personas,
  formatos,
  trabaja,
  gestiona,
  hoy,
}: {
  i: ItemPlan;
  responsable: string;
  personas: { id: string; nombre: string }[];
  formatos: { id: string; nombre: string }[];
  trabaja: boolean;
  gestiona: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [avance, setAvance] = useState(String(i.avance));
  const [fecha, setFecha] = useState(i.fecha_limite ?? "");
  const [resp, setResp] = useState(i.responsable_id ?? "");
  const [ev, setEv] = useState({ descripcion: "", archivo: null as File | null, formato: "" });
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const vencido = !!i.fecha_limite && i.fecha_limite < hoy && i.avance < 100;
  const editable = trabaja && !i.archivado_en;

  const correr = (f: () => Promise<string | null>) =>
    empezar(async () => {
      setError(null);
      const e = await f();
      if (e) return setError(e);
      router.refresh();
    });
  const actualizar = (c: Record<string, unknown>) =>
    correr(async () => {
      const { data, error: e } = await createClient().from("sst_plan_items").update(c).eq("id", i.id).select("id");
      return e ? e.message : !data?.length ? "No se guardó: no tienes permiso." : null;
    });

  return (
    <li className={`rounded-lg border bg-white p-3 text-sm ${i.archivado_en ? "opacity-60" : vencido ? "border-red-300" : "border-slate-200"}`}>
      <button type="button" onClick={() => setAbierto(!abierto)} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-semibold text-slate-900">{i.estandar}</p>
          <span className="shrink-0 font-bold">{i.avance} %</span>
        </div>
        <p className="text-xs text-slate-600">
          {responsable} · {i.fecha_limite ? `límite ${i.fecha_limite}` : "sin fecha límite"}
          {vencido && <span className="font-semibold text-red-800"> · vencido</span>} · {i.evidencias.filter((e) => !e.anulada_en).length} evidencias
        </p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
          <div className="h-1.5 rounded-full bg-green-600" style={{ width: `${i.avance}%` }} />
        </div>
      </button>
      {i.archivado_en && <p className="mt-1 text-xs">Archivado: {i.motivo_archivo}</p>}
      {abierto && (
        <div className="mt-2 space-y-3 border-t border-slate-100 pt-2">
          {i.descripcion && <p className="whitespace-pre-line">{i.descripcion}</p>}
          {editable && (
            <div className="flex items-end gap-2">
              <label className="block text-xs">
                Avance %
                <input value={avance} onChange={(e) => setAvance(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-2 text-base" />
              </label>
              <button type="button" disabled={pendiente || Number(avance) > 100 || avance === String(i.avance) || avance === ""} onClick={() => actualizar({ avance: Number(avance) })} className="min-h-11 rounded-md border border-slate-900 px-3 text-xs font-semibold disabled:opacity-40">
                Guardar avance
              </button>
              {Number(avance) > 100 && <span className="text-xs text-red-800">Máximo 100.</span>}
            </div>
          )}
          {gestiona && !i.archivado_en && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">
                Responsable
                <select value={resp} onChange={(e) => setResp(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-base">
                  <option value="">— Sin asignar —</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                Fecha límite
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-base" />
              </label>
              <button
                type="button"
                disabled={pendiente || (resp === (i.responsable_id ?? "") && fecha === (i.fecha_limite ?? ""))}
                onClick={() => actualizar({ responsable_id: resp || null, fecha_limite: fecha || null })}
                className="min-h-11 rounded-md border border-slate-900 text-xs font-semibold disabled:opacity-40 sm:col-span-2"
              >
                Guardar responsable y fecha
              </button>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidencias</p>
            {i.evidencias.length === 0 && <p className="text-slate-500">Sin evidencias.</p>}
            {i.evidencias.map((e) => (
              <div key={e.id} className={`mt-1 ${e.anulada_en ? "line-through opacity-60" : ""}`}>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="font-semibold text-[#A82323] underline">
                    📎 {e.descripcion}
                  </a>
                ) : e.formato_id ? (
                  <Link href={`/sgsst/formatos/${e.formato_id}`} className="font-semibold text-[#A82323] underline">
                    📋 {e.descripcion}
                  </Link>
                ) : (
                  e.descripcion
                )}
                {e.anulada_en && <span className="ml-1 text-xs no-underline">(anulada: {e.motivo_anulacion})</span>}
                {editable && !e.anulada_en && (
                  <button
                    type="button"
                    onClick={() => {
                      const m = window.prompt("¿Por qué se anula esta evidencia?");
                      if (m?.trim())
                        correr(async () => {
                          const { data, error: er } = await createClient().from("sst_plan_evidencias").update({ motivo_anulacion: m.trim() }).eq("id", e.id).select("id");
                          return er ? er.message : !data?.length ? "No se guardó." : null;
                        });
                    }}
                    className="ml-2 min-h-9 text-xs text-slate-500 underline"
                  >
                    Anular
                  </button>
                )}
              </div>
            ))}
            {editable && (
              <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-2">
                <input value={ev.descripcion} onChange={(e) => setEv({ ...ev, descripcion: e.target.value })} placeholder="Qué es (ej. acta del COPASST de octubre)" className="block w-full rounded-md border border-slate-300 px-2 py-2 text-base" />
                <input type="file" onChange={(e) => setEv({ ...ev, archivo: e.target.files?.[0] ?? null, formato: "" })} className="block w-full text-sm" />
                <select value={ev.formato} onChange={(e) => setEv({ ...ev, formato: e.target.value, archivo: null })} className="block w-full rounded-md border border-slate-300 px-2 py-2 text-base">
                  <option value="">…o un formato llenado que lo soporta</option>
                  {formatos.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pendiente || !ev.descripcion.trim() || (!ev.archivo && !ev.formato)}
                  onClick={() =>
                    correr(async () => {
                      const supabase = createClient();
                      let path: string | null = null;
                      if (ev.archivo) {
                        path = `plan/${i.id}/${Date.now()}-${ev.archivo.name.replace(/[^\w.\-]+/g, "_")}`;
                        const { error: eS } = await supabase.storage.from("sgsst").upload(path, ev.archivo, { contentType: ev.archivo.type || undefined, upsert: false });
                        if (eS) return `No se subió el archivo: ${eS.message}`;
                      }
                      const { error: eR } = await supabase.from("sst_plan_evidencias").insert({ item_id: i.id, descripcion: ev.descripcion.trim(), path, formato_id: ev.formato || null });
                      if (eR) return eR.message;
                      setEv({ descripcion: "", archivo: null, formato: "" });
                      return null;
                    })
                  }
                  className="min-h-11 w-full rounded-md border border-slate-900 text-xs font-semibold disabled:opacity-40"
                >
                  Agregar evidencia
                </button>
                {(!ev.descripcion.trim() || (!ev.archivo && !ev.formato)) && <p className="text-xs text-slate-500">Escribe qué es y adjunta un archivo o elige un formato.</p>}
              </div>
            )}
          </div>

          {gestiona && !i.archivado_en && (
            <div className="space-y-1">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo para archivar este estándar" className="block w-full rounded-md border border-slate-300 px-2 py-2 text-base" />
              <button type="button" disabled={pendiente || !motivo.trim()} onClick={() => actualizar({ archivado_en: new Date().toISOString(), motivo_archivo: motivo.trim() })} className="min-h-11 w-full rounded-md border border-slate-300 text-xs disabled:opacity-40">
                Archivar (no se borra)
              </button>
            </div>
          )}
          {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
        </div>
      )}
    </li>
  );
}

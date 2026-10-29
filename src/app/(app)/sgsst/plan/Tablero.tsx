"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Item, type ItemPlan } from "./PlanTrabajo";

export interface FilaEstandar {
  id: string;
  anio: number;
  codigo: string;
  ciclo: Ciclo;
  grupo: string;
  estandar: string;
  valor: number;
  aplica_7: boolean;
  calificacion: Calificacion;
  motivo_no_aplica: string | null;
  puntaje: number;
  evidencias: number;
  formatos_esperados: string[];
}
export interface TotalAutoevaluacion {
  puntaje: number;
  valoracion: "critico" | "moderadamente_aceptable" | "aceptable";
  estandares: number;
  pendientes: number;
}
type Ciclo = "PLANEAR" | "HACER" | "VERIFICAR" | "ACTUAR";
type Calificacion = "pendiente" | "cumple" | "no_cumple" | "no_aplica";

// Colores (Jhojan: "los corporativos y los que hemos usado para filtros"). Clases fijas para Tailwind.
const CICLOS: { id: Ciclo; nombre: string; texto: string; barra: string; borde: string }[] = [
  { id: "PLANEAR", nombre: "Planear", texto: "text-brand-navy", barra: "bg-brand-navy", borde: "border-brand-navy" },
  { id: "HACER", nombre: "Hacer", texto: "text-green-700", barra: "bg-green-700", borde: "border-green-700" },
  { id: "VERIFICAR", nombre: "Verificar", texto: "text-amber-600", barra: "bg-amber-600", borde: "border-amber-600" },
  { id: "ACTUAR", nombre: "Actuar", texto: "text-brand-red", barra: "bg-brand-red", borde: "border-brand-red" },
];
const VALORACION = {
  critico: { nombre: "Crítico", texto: "text-brand-red", trazo: "stroke-brand-red" },
  moderadamente_aceptable: { nombre: "Moderadamente aceptable", texto: "text-amber-600", trazo: "stroke-amber-600" },
  aceptable: { nombre: "Aceptable", texto: "text-green-700", trazo: "stroke-green-700" },
};
const CALIFICACION: Record<Calificacion, { nombre: string; chip: string }> = {
  pendiente: { nombre: "Pendiente", chip: "bg-slate-100 text-slate-700" },
  cumple: { nombre: "Cumple", chip: "bg-green-100 text-green-800" },
  no_cumple: { nombre: "No cumple", chip: "bg-red-100 text-red-800" },
  no_aplica: { nombre: "No aplica", chip: "bg-slate-200 text-slate-800" },
};
const FILTROS: { id: "todos" | Calificacion; nombre: string }[] = [
  { id: "todos", nombre: "Todos" },
  { id: "pendiente", nombre: "Pendientes" },
  { id: "no_cumple", nombre: "No cumple" },
  { id: "cumple", nombre: "Cumple" },
  { id: "no_aplica", nombre: "No aplica" },
];
const chip = (activo: boolean) =>
  `inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`;
const pts = (n: number) => (Math.round(n * 100) / 100).toLocaleString("es-CO");
const orden = (c: string) => c.split(".").map((x) => x.padStart(3, "0")).join(".");

function Anillo({ puntaje, valoracion }: { puntaje: number; valoracion: TotalAutoevaluacion["valoracion"] }) {
  const r = 52;
  const largo = 2 * Math.PI * r;
  const v = VALORACION[valoracion];
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0" role="img" aria-label={`${pts(puntaje)} de 100`}>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="stroke-slate-100" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className={v.trazo}
          strokeDasharray={`${(Math.min(puntaje, 100) / 100) * largo} ${largo}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="66" textAnchor="middle" className="fill-slate-900 text-xl font-bold">
          {pts(puntaje)}%
        </text>
      </svg>
      <div>
        <p className="text-sm text-slate-600">Autoevaluación (Res. 0312, art. 27)</p>
        <p className={`text-lg font-bold ${v.texto}`}>{v.nombre}</p>
        <p className="text-xs text-slate-500">Hasta 60 crítico · 60,1 a 85 moderadamente aceptable · más de 85 aceptable.</p>
      </div>
    </div>
  );
}

/**
 * Tablero del plan de trabajo sobre los 60 estándares mínimos (migraciones 108, 113 y 115). Los
 * ciclos son el filtro y muestran PUNTOS (Hacer vale 60 de 100; contar ítems lo escondería). "No
 * aplica" otorga el máximo (art. 27) y pide motivo. Calificar es de la gestión SST.
 */
export function Tablero({
  filas,
  total,
  items,
  plantillas,
  personas,
  formatos,
  trabaja,
  gestiona,
  hoy,
}: {
  filas: FilaEstandar[];
  total: TotalAutoevaluacion | null;
  /** El ítem del plan de cada estándar (por id), con sus evidencias. */
  items: Record<string, ItemPlan>;
  plantillas: string[];
  personas: { id: string; nombre: string }[];
  formatos: { id: string; nombre: string }[];
  trabaja: boolean;
  gestiona: boolean;
  hoy: string;
}) {
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todos");
  const puntaje = total?.puntaje ?? filas.reduce((a, f) => a + Number(f.puntaje), 0);
  const visibles = filas.filter((f) => (!ciclo || f.ciclo === ciclo) && (filtro === "todos" || f.calificacion === filtro));
  const atacar = useMemo(
    () =>
      filas
        .filter((f) => (!ciclo || f.ciclo === ciclo) && (f.calificacion === "pendiente" || f.calificacion === "no_cumple"))
        .sort((a, b) => Number(b.valor) - Number(a.valor) || orden(a.codigo).localeCompare(orden(b.codigo)))
        .slice(0, 6),
    [filas, ciclo],
  );
  const grupos = [...new Set(visibles.map((f) => f.grupo))];

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        {total && <Anillo puntaje={puntaje} valoracion={total.valoracion} />}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { k: "Calificados", v: `${filas.filter((f) => f.calificacion !== "pendiente").length} de ${filas.length}` },
            { k: "Puntos sin asegurar", v: pts(Math.max(0, 100 - puntaje)) },
            { k: "Con evidencia", v: `${filas.filter((f) => f.evidencias > 0).length} de ${filas.length}` },
            { k: "Con formato del ERP asociado", v: `${filas.filter((f) => f.formatos_esperados.length > 0).length} de ${filas.length}` },
          ].map((x) => (
            <div key={x.k} className="rounded-md border border-slate-200 p-2">
              <p className="text-xs text-slate-500">{x.k}</p>
              <p className="text-lg font-bold text-slate-900">{x.v}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {CICLOS.map((c) => {
          const del = filas.filter((f) => f.ciclo === c.id);
          const posible = del.reduce((a, f) => a + Number(f.valor), 0);
          const obtenido = del.reduce((a, f) => a + Number(f.puntaje), 0);
          const activo = ciclo === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={activo}
              onClick={() => setCiclo(activo ? null : c.id)}
              className={`min-h-11 rounded-lg border-2 bg-white p-3 text-left ${activo ? c.borde : "border-slate-200"}`}
            >
              <p className={`text-sm font-bold ${c.texto}`}>{c.nombre}</p>
              <p className="text-lg font-bold text-slate-900">
                {pts(obtenido)} <span className="text-sm font-normal text-slate-500">de {pts(posible)} puntos</span>
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${c.barra}`} style={{ width: `${posible ? (obtenido / posible) * 100 : 0}%` }} />
              </div>
            </button>
          );
        })}
      </div>

      {atacar.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="text-sm font-bold text-slate-900">Lo que más conviene atacar</h2>
          <p className="mb-2 text-xs text-slate-500">Pendientes o sin cumplir, de mayor a menor peso{ciclo ? ` en ${CICLOS.find((c) => c.id === ciclo)?.nombre}` : ""}.</p>
          <ul className="divide-y divide-slate-100">
            {atacar.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-12 shrink-0 font-mono text-xs text-slate-500">{f.codigo}</span>
                <span className="min-w-0 flex-1">{f.estandar}</span>
                <span className="shrink-0 font-semibold">{pts(Number(f.valor))} pts</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFiltro(f.id)} className={chip(filtro === f.id)}>
            {f.nombre} · {f.id === "todos" ? filas.filter((x) => !ciclo || x.ciclo === ciclo).length : filas.filter((x) => (!ciclo || x.ciclo === ciclo) && x.calificacion === f.id).length}
          </button>
        ))}
      </div>

      {grupos.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Nada en este filtro.</p>
      ) : (
        grupos.map((g) => (
          <section key={g}>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">{g}</h3>
            <ul className="space-y-2">
              {visibles
                .filter((f) => f.grupo === g)
                .map((f) => (
                  <Fila
                    key={f.id}
                    f={f}
                    item={items[f.id] ?? null}
                    plantillas={plantillas}
                    personas={personas}
                    formatos={formatos}
                    trabaja={trabaja}
                    gestiona={gestiona}
                    hoy={hoy}
                  />
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Fila({
  f,
  item,
  plantillas,
  personas,
  formatos,
  trabaja,
  gestiona,
  hoy,
}: {
  f: FilaEstandar;
  item: ItemPlan | null;
  plantillas: string[];
  personas: { id: string; nombre: string }[];
  formatos: { id: string; nombre: string }[];
  trabaja: boolean;
  gestiona: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState(f.motivo_no_aplica ?? "");
  const [nuevaPlantilla, setNuevaPlantilla] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const correr = (accion: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>) =>
    empezar(async () => {
      setError(null);
      const { error: e } = await accion();
      if (e) return setError(e.message);
      setPidiendoMotivo(false);
      router.refresh();
    });
  const supabase = createClient();
  const calificar = (c: Calificacion, m?: string) =>
    correr(() =>
      supabase
        .from("sst_plan_items")
        .update({ calificacion: c, motivo_no_aplica: c === "no_aplica" ? (m ?? "").trim() : null })
        .eq("id", f.id),
    );
  const boton = (c: Calificacion, etiqueta: string, activo: string) => (
    <button
      type="button"
      disabled={pendiente}
      aria-pressed={f.calificacion === c}
      // Tocar la calificación activa la deja otra vez pendiente.
      onClick={() => (f.calificacion === c ? calificar("pendiente") : c === "no_aplica" ? setPidiendoMotivo(true) : calificar(c))}
      className={`min-h-11 min-w-11 flex-1 rounded-md border px-3 text-sm font-semibold disabled:opacity-40 sm:flex-none ${f.calificacion === c ? activo : "border-slate-300 bg-white text-slate-700"}`}
    >
      {etiqueta}
    </button>
  );

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-60">
          <p className="font-semibold text-slate-900">
            <span className="mr-1 font-mono text-xs text-slate-500">{f.codigo}</span>
            {f.estandar}
          </p>
          <p className="text-xs text-slate-600">
            {pts(Number(f.valor))} pts · {f.evidencias} evidencia{f.evidencias === 1 ? "" : "s"}
            {f.aplica_7 ? " · de los 7 del art. 3" : ""}
            {f.formatos_esperados.length ? ` · formatos: ${f.formatos_esperados.join(", ")}` : ""}
          </p>
          {f.calificacion === "no_aplica" && f.motivo_no_aplica && <p className="text-xs text-slate-700">No aplica porque: {f.motivo_no_aplica}</p>}
        </div>
        {gestiona ? (
          <div className="flex w-full gap-2 sm:w-auto">
            {boton("cumple", "✓", "border-green-700 bg-green-700 text-white")}
            {boton("no_cumple", "✕", "border-brand-red bg-brand-red text-white")}
            {boton("no_aplica", "NA", "border-slate-700 bg-slate-700 text-white")}
          </div>
        ) : (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CALIFICACION[f.calificacion].chip}`}>{CALIFICACION[f.calificacion].nombre}</span>
        )}
      </div>

      {pidiendoMotivo && (
        <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-2">
          <label className="block text-sm">
            ¿Por qué no aplica? <span className="text-xs text-slate-500">(“no aplica” otorga el puntaje máximo: el motivo es obligatorio)</span>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-base" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPidiendoMotivo(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
              Cancelar
            </button>
            <button type="button" disabled={pendiente || !motivo.trim()} onClick={() => calificar("no_aplica", motivo)} className="min-h-11 flex-1 rounded-md bg-brand-red text-sm font-semibold text-white disabled:opacity-40">
              Marcar “no aplica”
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={() => setAbierto(!abierto)} className="mt-1 min-h-11 text-xs font-semibold text-slate-600 underline">
        {abierto ? "Ocultar" : "Evidencias, responsable y formatos"}
      </button>
      {abierto && (
        <div className="mt-1 space-y-2">
          <div className="rounded-md border border-slate-100 p-2">
            <p className="text-xs font-semibold text-slate-700">Formatos del ERP que lo soportan</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {f.formatos_esperados.length === 0 && <span className="text-xs text-slate-500">Ninguno asociado.</span>}
              {f.formatos_esperados.map((p) => (
                <span key={p} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-3 text-xs">
                  {p}
                  {gestiona && (
                    <button
                      type="button"
                      aria-label={`Quitar ${p}`}
                      disabled={pendiente}
                      onClick={() => correr(() => supabase.from("sst_estandar_plantillas").delete().eq("codigo_estandar", f.codigo).eq("codigo_plantilla", p))}
                      className="min-h-11 min-w-11 font-bold text-slate-500"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            {gestiona && (
              <div className="mt-2 flex gap-2">
                <select value={nuevaPlantilla} onChange={(e) => setNuevaPlantilla(e.target.value)} className="min-h-11 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm">
                  <option value="">Asociar un formato…</option>
                  {plantillas.filter((p) => !f.formatos_esperados.includes(p)).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pendiente || !nuevaPlantilla}
                  onClick={() => correr(() => supabase.from("sst_estandar_plantillas").insert({ codigo_estandar: f.codigo, codigo_plantilla: nuevaPlantilla }))}
                  className="min-h-11 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Asociar
                </button>
              </div>
            )}
          </div>
          {item && (
            <ul>
              <Item i={item} responsable={item.responsable_id ? (personas.find((p) => p.id === item.responsable_id)?.nombre ?? "—") : "Sin responsable"} personas={personas} formatos={formatos} trabaja={trabaja} gestiona={gestiona} hoy={hoy} />
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </li>
  );
}

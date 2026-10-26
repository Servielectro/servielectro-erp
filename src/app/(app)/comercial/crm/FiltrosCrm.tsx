"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCOP } from "@/lib/pricing";
import {
  aParams,
  ATAJOS,
  CAMPOS_FECHA,
  NOMBRE_GRUPO,
  NOMBRE_ORIGEN,
  ORIGENES,
  type Atajo,
  type CampoFecha,
  type FilaCrm,
  type FiltrosCrm,
} from "@/lib/crm-filtros";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-base";
const AYUDA = "mt-0.5 block text-xs font-normal text-slate-500";

/**
 * Los filtros que no son el estado (el estado se elige tocando los contadores). Cada uno dice en
 * una línea para qué sirve. Se aplican con "Aplicar" y quedan en la URL.
 */
export function PanelFiltrosCrm({
  filtros,
  base,
  clientes,
  responsables,
  conOrigen,
  abierto: abiertoInicial,
}: {
  filtros: FiltrosCrm;
  base: Record<string, string>;
  clientes: { id: string; nombre: string }[];
  responsables: { id: string; nombre: string }[];
  conOrigen: boolean;
  abierto: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [f, setF] = useState(filtros);
  const [vmin, setVmin] = useState(filtros.valorMin !== null ? String(filtros.valorMin) : "");
  const [vmax, setVmax] = useState(filtros.valorMax !== null ? String(filtros.valorMax) : "");
  const [sm, setSm] = useState(filtros.sinMovimiento !== null ? String(filtros.sinMovimiento) : "");
  const poner = <K extends keyof FiltrosCrm>(k: K, v: FiltrosCrm[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (t: string) => (t.replace(/[^\d]/g, "") ? Number(t.replace(/[^\d]/g, "")) : null);
  const min = num(vmin);
  const max = num(vmax);
  const problema = min !== null && max !== null && min > max ? "El valor mínimo es mayor que el máximo." : f.desde && f.hasta && f.desde > f.hasta ? "La fecha “desde” es posterior a “hasta”." : null;

  function aplicar() {
    if (problema) return;
    const q = aParams({ ...f, valorMin: min, valorMax: max, sinMovimiento: num(sm) || null }, base);
    router.push(`/comercial/crm${q.size ? `?${q}` : ""}`);
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
        Más filtros: valor, fechas, cliente, responsable{conOrigen ? ", origen" : ""}…
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Filtros</h2>
        <button type="button" onClick={() => setAbierto(false)} className="min-h-11 px-2 text-sm text-slate-500">
          Ocultar
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <fieldset>
          <legend className="text-sm font-medium">Valor del negocio</legend>
          <div className="flex gap-2">
            <input value={vmin} onChange={(e) => setVmin(e.target.value)} inputMode="numeric" placeholder="Desde $" className={CAMPO} aria-label="Valor mínimo" />
            <input value={vmax} onChange={(e) => setVmax(e.target.value)} inputMode="numeric" placeholder="Hasta $" className={CAMPO} aria-label="Valor máximo" />
          </div>
          <span className={AYUDA}>
            Para ver solo los negocios grandes o los chicos. Es el total cotizado o, si aún no hay cotización, el estimado.
            {(min !== null || max !== null) && ` (${min !== null ? formatCOP(min) : "$0"} a ${max !== null ? formatCOP(max) : "sin tope"})`}
          </span>
        </fieldset>

        <fieldset className="sm:col-span-2 lg:col-span-2">
          <legend className="text-sm font-medium">Fechas</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            <select value={f.campoFecha} onChange={(e) => poner("campoFecha", e.target.value as CampoFecha)} className="min-h-11 rounded-md border border-slate-300 px-2 text-base" aria-label="Qué fecha">
              {CAMPOS_FECHA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {ATAJOS.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={f.atajo === a.id}
                onClick={() => setF((x) => ({ ...x, atajo: x.atajo === a.id ? null : (a.id as Atajo), desde: null, hasta: null }))}
                className={`min-h-11 rounded-full border px-3 text-sm ${f.atajo === a.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
              >
                {a.nombre}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <label>
              Desde
              <input type="date" value={f.desde ?? ""} onChange={(e) => setF((x) => ({ ...x, desde: e.target.value || null, atajo: null }))} className="ml-1 min-h-11 rounded-md border border-slate-300 px-2" />
            </label>
            <label>
              Hasta
              <input type="date" value={f.hasta ?? ""} onChange={(e) => setF((x) => ({ ...x, hasta: e.target.value || null, atajo: null }))} className="ml-1 min-h-11 rounded-md border border-slate-300 px-2" />
            </label>
          </div>
          <span className={AYUDA}>
            Elige primero qué fecha: cuándo se creó el negocio, para cuándo se espera cerrarlo, o cuándo fue el último movimiento (contacto hecho o cambio de etapa).
          </span>
        </fieldset>

        <label className="block text-sm font-medium">
          Cliente
          <select value={f.cliente ?? ""} onChange={(e) => poner("cliente", e.target.value || null)} className={CAMPO}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <span className={AYUDA}>Todo lo que hay con un cliente: lo abierto, lo ganado y lo perdido.</span>
        </label>

        <label className="block text-sm font-medium">
          Responsable comercial
          <select value={f.responsable ?? ""} onChange={(e) => poner("responsable", e.target.value || null)} className={CAMPO}>
            <option value="">Todos</option>
            {responsables.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
          <span className={AYUDA}>Lo que tiene a cargo cada persona, para repartir o hacer seguimiento.</span>
        </label>

        {conOrigen && (
          <label className="block text-sm font-medium">
            Origen del lead
            <select value={f.origen ?? ""} onChange={(e) => poner("origen", e.target.value || null)} className={CAMPO}>
              <option value="">Todos</option>
              {ORIGENES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
              <option value="sin">Sin origen registrado</option>
            </select>
            <span className={AYUDA}>De dónde llegan los negocios, para saber qué canal trae más (y cuál se gana).</span>
          </label>
        )}

        <label className="flex min-h-11 items-start gap-2 text-sm font-medium">
          <input type="checkbox" checked={f.vencidos} onChange={(e) => poner("vencidos", e.target.checked)} className="mt-1 h-5 w-5" />
          <span>
            Solo vencidos
            <span className={AYUDA}>Abiertos cuya fecha objetivo de cierre ya pasó: o se cierran o se les mueve la fecha.</span>
          </span>
        </label>

        <label className="block text-sm font-medium">
          Sin movimiento en
          <span className="mt-1 flex items-center gap-2">
            <input value={sm} onChange={(e) => setSm(e.target.value)} inputMode="numeric" placeholder="30" className="block w-24 rounded-md border border-slate-300 px-2 py-2 text-base" />
            días o más
          </span>
          <span className={AYUDA}>Abiertos sin contacto hecho ni cambio de etapa en ese tiempo: los que se están enfriando.</span>
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={!!problema} onClick={aplicar} className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          Aplicar filtros
        </button>
      </div>
      {problema && <p className="mt-1 text-center text-sm text-red-800">{problema}</p>}
    </section>
  );
}

/** La lista filtrada, en Excel, tal como se ve. */
export function ExportarCrm({ filas, responsables }: { filas: FilaCrm[]; responsables: Record<string, string> }) {
  const [trabajando, setTrabajando] = useState(false);
  if (!filas.length) return null;
  return (
    <button
      type="button"
      disabled={trabajando}
      onClick={async () => {
        setTrabajando(true);
        try {
          const XLSX = await import("xlsx");
          const hoja = XLSX.utils.json_to_sheet(
            filas.map((o) => ({
              Negocio: o.nombre,
              Cliente: o.clienteNombre,
              Estado: NOMBRE_GRUPO[o.grupo],
              Etapa: o.etapaNombre,
              Valor: o.valor ?? "",
              "Tipo de valor": o.valor === null ? "" : o.valorEsCotizado ? "Cotizado" : "Estimado",
              Creado: o.creado,
              "Objetivo de cierre": o.objetivoCierre ?? "",
              "Última actividad": o.ultimaActividad,
              Responsable: o.responsableId ? (responsables[o.responsableId] ?? "") : "",
              Origen: o.origen ? (NOMBRE_ORIGEN[o.origen] ?? o.origen) : "",
            })),
          );
          const libro = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(libro, hoja, "CRM");
          XLSX.writeFile(libro, `crm-servielectro-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } finally {
          setTrabajando(false);
        }
      }}
      className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-40"
    >
      {trabajando ? "Preparando…" : "Exportar esta lista a Excel"}
    </button>
  );
}

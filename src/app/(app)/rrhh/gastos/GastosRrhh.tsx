"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/rrhh/archivos";
import { inicioQuincena } from "@/lib/supabase/rrhh-acceso";
import type { ProyectoNombre } from "@/lib/supabase/proyectos";
import { CATEGORIA, ESTADO_GASTO, PAGADO_CON, fechaCorta, nombreQuincena, pesos, type Gasto } from "@/lib/rrhh-registros";
import { hoyColombia } from "@/lib/crm";

export function GastosRrhh({
  gastos,
  personas,
  proyectos,
}: {
  gastos: Gasto[];
  personas: Record<string, string>;
  proyectos: ProyectoNombre[];
}) {
  if (gastos.length === 0) return <p className="text-sm text-slate-500">No hay gastos en este filtro.</p>;
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, `${p.nombre} (${p.codigo})`]));
  return (
    <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
      {gastos.map((g) => (
        <FilaGasto key={g.id} g={g} persona={personas[g.persona_id] ?? "—"} proyectos={proyectos} nombreProyecto={nombreProyecto} />
      ))}
    </ul>
  );
}

function FilaGasto({
  g,
  persona,
  proyectos,
  nombreProyecto,
}: {
  g: Gasto;
  persona: string;
  proyectos: ProyectoNombre[];
  nombreProyecto: Map<string, string>;
}) {
  const router = useRouter();
  const [proyecto, setProyecto] = useState(g.proyecto_id ?? "");
  const [observando, setObservando] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [reembolsando, setReembolsando] = useState(false);
  const [fechaReembolso, setFechaReembolso] = useState(hoyColombia());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const anulado = g.estado === "anulado";

  const actualizar = (cambios: Record<string, unknown>, despues?: () => void) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("gastos").update(cambios).eq("id", g.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: el gasto cambió o no tienes permiso.");
      despues?.();
      router.refresh();
    });

  const opciones = proyectos.filter((p) => p.estado === "EN_EJECUCION" || p.id === g.proyecto_id);

  return (
    <li className={`rounded-lg border bg-white p-3 text-sm ${g.estado === "observado" ? "border-amber-400" : "border-slate-300"} ${anulado ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{g.descripcion}</p>
          <p className="text-xs text-slate-600">
            {persona} · {fechaCorta(g.fecha)} · {g.tipo === "transporte" ? `Transporte${g.origen || g.destino ? ` (${g.origen ?? "?"} → ${g.destino ?? "?"})` : ""}` : CATEGORIA[g.categoria_costo]}
          </p>
          <p className="text-xs text-slate-600">
            {PAGADO_CON[g.pagado_con].replace("De mi bolsillo", "De su bolsillo")}
            {g.proveedor ? ` · ${g.proveedor}` : ""}
            {g.numero_factura ? ` · Fact. ${g.numero_factura}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-bold">{pesos(Number(g.monto))}</p>
          <p className={`text-xs font-semibold ${g.estado === "observado" ? "text-amber-700" : "text-slate-500"}`}>
            {g.reembolsado_en ? `Reembolsado (${nombreQuincena(g.reembolsado_quincena)})` : ESTADO_GASTO[g.estado]}
          </p>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
        {g.gasto_soportes.length === 0 ? (
          <span className="text-amber-700">Sin factura adjunta</span>
        ) : (
          g.gasto_soportes.map((s, i) => (
            <AbrirArchivo key={s.id} path={s.storage_path}>
              📎 Factura {g.gasto_soportes.length > 1 ? i + 1 : ""}
            </AbrirArchivo>
          ))
        )}
      </div>
      {g.observacion && (
        <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
          Observación{g.estado === "registrado" ? " (ya corregido)" : ""}: {g.observacion}
        </p>
      )}

      {!anulado && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          <div className="flex gap-2">
            <select
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              disabled={pendiente}
              className="min-h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-xs"
            >
              <option value="">Sin proyecto</option>
              {g.proyecto_id && !opciones.some((p) => p.id === g.proyecto_id) && (
                <option value={g.proyecto_id}>Proyecto actual (no aparece en la lista)</option>
              )}
              {opciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.codigo})
                </option>
              ))}
            </select>
            {proyecto !== (g.proyecto_id ?? "") && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => actualizar({ proyecto_id: proyecto || null })}
                className="min-h-9 shrink-0 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40"
              >
                Asignar
              </button>
            )}
          </div>
          {!g.proyecto_id && opciones.length === 0 && (
            <p className="text-xs text-slate-500">No hay proyectos en ejecución: créalos en el módulo Proyectos.</p>
          )}
          {g.proyecto_id && !nombreProyecto.has(g.proyecto_id) && <p className="text-xs text-slate-500">Proyecto que ya no aparece en la lista.</p>}

          {observando ? (
            <div className="space-y-1">
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                rows={2}
                placeholder="Qué tiene que corregir (lo ve el técnico)"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setObservando(false)} className="min-h-9 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendiente || !observacion.trim()}
                  onClick={() => actualizar({ estado: "observado", observacion: observacion.trim() }, () => setObservando(false))}
                  className="min-h-9 flex-1 rounded-md bg-amber-600 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Devolver para corregir
                </button>
              </div>
              {!observacion.trim() && <p className="text-xs text-slate-500">Escribe qué hay que corregir.</p>}
            </div>
          ) : reembolsando ? (
            <div className="space-y-1">
              <label className="block text-xs text-slate-600">
                Fecha en que se le devolvió
                <input
                  type="date"
                  value={fechaReembolso}
                  onChange={(e) => setFechaReembolso(e.target.value)}
                  className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              {fechaReembolso && <p className="text-xs text-slate-500">Queda en la {nombreQuincena(inicioQuincena(fechaReembolso))}.</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setReembolsando(false)} className="min-h-9 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendiente || !fechaReembolso}
                  onClick={() =>
                    actualizar({ reembolsado_quincena: inicioQuincena(fechaReembolso), reembolsado_en: new Date().toISOString() }, () =>
                      setReembolsando(false),
                    )
                  }
                  className="min-h-9 flex-1 rounded-md bg-green-700 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Marcar reembolsado
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {g.estado === "registrado" && (
                <button type="button" onClick={() => setObservando(true)} className="min-h-9 rounded-md border border-amber-500 px-3 text-xs font-semibold text-amber-800">
                  Observar
                </button>
              )}
              {g.pagado_con === "propio" && !g.reembolsado_en && (
                <button type="button" onClick={() => setReembolsando(true)} className="min-h-9 rounded-md border border-green-700 px-3 text-xs font-semibold text-green-800">
                  Marcar reembolso
                </button>
              )}
              {g.estado === "observado" && <p className="text-xs text-slate-500">Esperando que el técnico lo corrija.</p>}
            </div>
          )}
          {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
        </div>
      )}
    </li>
  );
}

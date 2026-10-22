"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProyectoNombre } from "@/lib/supabase/proyectos";
import { cambiarProyectoVisita } from "../../actions";

/**
 * Proyecto u obra de la visita (migración 63). Es clasificación, no evidencia: se puede
 * cambiar en cualquier estado, también firmada. Con esto el técnico ve el proyecto al cargar
 * gastos, y Financiero suma la visita al proyecto.
 */
export function ProyectoVisita({
  visitaId,
  proyectoId,
  opciones,
  puedeCambiar,
}: {
  visitaId: string;
  proyectoId: string | null;
  opciones: ProyectoNombre[];
  puedeCambiar: boolean;
}) {
  const router = useRouter();
  const [elegido, setElegido] = useState(proyectoId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const actual = opciones.find((p) => p.id === proyectoId);
  // El actual puede estar suspendido o cerrado: se sigue mostrando entre las opciones.
  const lista = opciones.filter((p) => p.estado === "EN_EJECUCION" || p.id === proyectoId);

  if (!puedeCambiar) {
    return <span>{actual ? `${actual.nombre} (${actual.codigo})` : "Sin proyecto"}</span>;
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <select
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          disabled={pendiente || lista.length === 0}
          className="min-h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm disabled:bg-slate-50"
        >
          <option value="">{lista.length === 0 ? "No hay proyectos en ejecución" : "Sin proyecto"}</option>
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({p.codigo})
            </option>
          ))}
        </select>
        {/* Solo aparece si se eligió otro: un "Guardar" apagado sin motivo no explica nada. */}
        {elegido !== (proyectoId ?? "") && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const r = await cambiarProyectoVisita(visitaId, elegido || null);
              if (!r.ok) return setError(r.error);
              router.refresh();
            })
          }
          className="min-h-9 shrink-0 rounded-md border border-slate-900 px-3 text-xs font-semibold disabled:opacity-40"
        >
          {pendiente ? "…" : "Guardar"}
        </button>
        )}
      </div>
      {lista.length === 0 && <p className="text-xs text-slate-500">Los proyectos se crean en el módulo Proyectos.</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </div>
  );
}

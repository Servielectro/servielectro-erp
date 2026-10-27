"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { borradorVacio, guardarTarea } from "@/lib/tareas-guardar";
import { proponerAsignado, type Acta } from "@/lib/reuniones/acta";

/**
 * Los compromisos del acta aprobada, propuestos como tareas del tablero de Operativo. Propuesto, no
 * automático: Jhojan revisa a quién se le asigna cada una (la propuesta sale del nombre que dice el
 * acta, solo si coincide con una sola persona) y la crea con un toque. Cada compromiso se vuelve
 * tarea una sola vez (la base lo anota en reunion_tareas).
 */
export function CompromisosATareas({
  reunionId,
  proyectoId,
  tituloActa,
  fecha,
  acta,
  hechas,
  personas,
  puedeAsignar,
}: {
  reunionId: string;
  proyectoId: string;
  tituloActa: string;
  fecha: string;
  acta: Acta;
  hechas: Record<number, string>;
  personas: { id: string; nombre: string }[];
  puedeAsignar: boolean;
}) {
  const router = useRouter();
  const [asignado, setAsignado] = useState<Record<number, string>>(() =>
    Object.fromEntries(acta.compromisos.map((c, i) => [i, proponerAsignado(c.responsable, personas) ?? ""])),
  );
  const [marcadas, setMarcadas] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(acta.compromisos.map((c, i) => [i, c.parte === "servielectro" && !hechas[i]])),
  );
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  if (acta.compromisos.length === 0) return <p className="text-sm text-slate-500">El acta no tiene compromisos.</p>;
  if (!puedeAsignar) {
    return <p className="text-sm text-slate-500">Volver compromisos tareas del tablero requiere Operativo en nivel “trabajar” (es quien asigna en obra).</p>;
  }

  const pendientes = acta.compromisos.map((_, i) => i).filter((i) => !hechas[i]);
  const elegidas = pendientes.filter((i) => marcadas[i]);
  const sinAsignar = elegidas.filter((i) => !asignado[i]);

  function crear(indices: number[]) {
    empezar(async () => {
      setError(null);
      setAviso(null);
      const supabase = createClient();
      let n = 0;
      for (const i of indices) {
        const c = acta.compromisos[i];
        const b = borradorVacio();
        b.titulo = c.descripcion.trim().slice(0, 200);
        b.descripcion = [
          `Compromiso del acta "${tituloActa}" (${fecha}).`,
          c.responsable ? `En el acta, responsable: ${c.responsable}${c.parte !== "servielectro" ? ` (${c.parte})` : ""}.` : "",
          c.cita ? `Lo que se dijo: “${c.cita}”` : "",
        ]
          .filter(Boolean)
          .join("\n");
        b.visibilidad = "equipo";
        b.obra = `p:${proyectoId}`;
        b.fechaLimite = c.fecha_limite ?? "";
        b.asignados = asignado[i] ? [asignado[i]] : [];
        const r = await guardarTarea(supabase, null, b, { soloMover: false });
        if (!r.ok) {
          setError(`“${c.descripcion}”: ${r.error}`);
          break;
        }
        const { error: e } = await supabase.from("reunion_tareas").insert({ reunion_id: reunionId, indice: i, tarea_id: r.tarea.id });
        if (e) {
          setError(`La tarea “${c.descripcion}” se creó, pero no se pudo anotar en el acta: ${e.message}`);
          break;
        }
        n++;
      }
      if (n) setAviso(n === 1 ? "Se creó 1 tarea en el tablero." : `Se crearon ${n} tareas en el tablero.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {acta.compromisos.map((c, i) => (
          <li key={i} className={`rounded-md border p-2 text-sm ${hechas[i] ? "border-green-200 bg-green-50" : "border-slate-200"}`}>
            <p className="font-semibold">{c.descripcion}</p>
            <p className="text-xs text-slate-600">
              {c.responsable || "sin responsable en el acta"} · {c.parte}
              {c.fecha_limite ? ` · hasta el ${c.fecha_limite}` : ""}
            </p>
            {hechas[i] ? (
              <Link href="/operativo/tareas" className="text-xs font-semibold text-green-800 underline">
                ✓ Ya es tarea del tablero
              </Link>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  <input type="checkbox" checked={!!marcadas[i]} onChange={(e) => setMarcadas({ ...marcadas, [i]: e.target.checked })} className="h-5 w-5" />
                  Volver tarea
                </label>
                <select value={asignado[i] ?? ""} onChange={(e) => setAsignado({ ...asignado, [i]: e.target.value })} className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm" aria-label="Asignar a">
                  <option value="">— ¿A quién se le asigna? —</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={pendiente || !asignado[i]} onClick={() => crear([i])} className="min-h-11 rounded-md border border-slate-400 px-3 text-xs font-semibold disabled:opacity-40">
                  Crear esta
                </button>
              </div>
            )}
            {!hechas[i] && !asignado[i] && <p className="text-xs text-slate-500">Elige a quién se le asigna para crearla.</p>}
            {!hechas[i] && c.parte !== "servielectro" && <p className="text-xs text-slate-500">Es un compromiso del {c.parte}: como tarea, sería el seguimiento que le hace Servielectro.</p>}
          </li>
        ))}
      </ol>
      {pendientes.length > 0 && (
        <>
          <button type="button" disabled={pendiente || elegidas.length === 0 || sinAsignar.length > 0} onClick={() => crear(elegidas)} className="min-h-12 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
            {pendiente ? "Creando…" : `Crear las ${elegidas.length} marcadas`}
          </button>
          {elegidas.length === 0 ? (
            <p className="text-xs text-slate-500">Marca los compromisos que se vuelven tarea.</p>
          ) : (
            sinAsignar.length > 0 && <p className="text-xs text-slate-500">Falta a quién se le asigna en {sinAsignar.length === 1 ? "1 marcada" : `${sinAsignar.length} marcadas`}.</p>
          )}
        </>
      )}
      {aviso && <p className="text-sm text-green-800">{aviso}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  COMPENSACION,
  COMPENSACIONES,
  ESTADO_PERMISO,
  TIPO_PERMISO,
  fechaCorta,
  type Compensacion,
  type Permiso,
} from "@/lib/rrhh-registros";

export function PermisosRrhh({
  permisos,
  personas,
  yo,
  hoy,
  aprueba,
  marcaGozado,
}: {
  permisos: Permiso[];
  personas: Record<string, string>;
  yo: string;
  hoy: string;
  aprueba: boolean;
  marcaGozado: boolean;
}) {
  if (permisos.length === 0) return <p className="text-sm text-slate-500">No hay permisos en este filtro.</p>;
  return (
    <ul className="space-y-2">
      {permisos.map((p) => (
        <FilaPermiso key={p.id} p={p} persona={personas[p.persona_id] ?? "—"} yo={yo} hoy={hoy} aprueba={aprueba} marcaGozado={marcaGozado} />
      ))}
    </ul>
  );
}

function FilaPermiso({
  p,
  persona,
  yo,
  hoy,
  aprueba,
  marcaGozado,
}: {
  p: Permiso;
  persona: string;
  yo: string;
  hoy: string;
  aprueba: boolean;
  marcaGozado: boolean;
}) {
  const router = useRouter();
  const [compensacion, setCompensacion] = useState<Compensacion | "">(p.compensacion_propuesta ?? "");
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const propio = p.persona_id === yo;

  const actualizar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("permisos_laborales").update(cambios).eq("id", p.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: el permiso cambió o no tienes permiso.");
      router.refresh();
    });

  return (
    <li className="rounded-lg border border-slate-300 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {persona} · {TIPO_PERMISO[p.tipo]}
          </p>
          <p className="text-xs text-slate-600">
            {p.desde === p.hasta ? fechaCorta(p.desde) : `${fechaCorta(p.desde)} → ${fechaCorta(p.hasta)}`}
            {p.hora_inicio && p.hora_fin ? ` · ${p.hora_inicio.slice(0, 5)}–${p.hora_fin.slice(0, 5)}` : ""} · pedido el{" "}
            {fechaCorta(p.fecha_solicitud)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{ESTADO_PERMISO[p.estado]}</span>
      </div>
      <p className="mt-1 text-slate-700">{p.motivo}</p>
      <p className="text-xs text-slate-500">
        {p.compensacion
          ? `Compensación: ${COMPENSACION[p.compensacion]}`
          : `Propuesta del técnico: ${p.compensacion_propuesta ? COMPENSACION[p.compensacion_propuesta] : "ninguna"}`}
      </p>
      {p.motivo_rechazo && <p className="mt-1 text-xs text-red-800">Rechazado: {p.motivo_rechazo}</p>}

      {p.estado === "solicitado" &&
        (aprueba ? (
          propio ? (
            <p className="mt-2 text-xs text-slate-500">Es tu propio permiso: no te lo puedes aprobar.</p>
          ) : rechazando ? (
            <div className="mt-2 space-y-1">
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Por qué se rechaza (lo ve el técnico)"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setRechazando(false)} className="min-h-9 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendiente || !motivo.trim()}
                  onClick={() => actualizar({ estado: "rechazado", motivo_rechazo: motivo.trim() })}
                  className="min-h-9 flex-1 rounded-md bg-red-700 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Rechazar
                </button>
              </div>
              {!motivo.trim() && <p className="text-xs text-slate-500">Escribe por qué se rechaza.</p>}
            </div>
          ) : (
            <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
              <label className="block text-xs text-slate-600">
                Compensación (la decides tú)
                <select
                  value={compensacion}
                  onChange={(e) => setCompensacion(e.target.value as Compensacion | "")}
                  className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Elegir…</option>
                  {COMPENSACIONES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRechazando(true)} className="min-h-9 flex-1 rounded-md border border-red-300 text-xs font-semibold text-red-800">
                  Rechazar…
                </button>
                <button
                  type="button"
                  disabled={pendiente || !compensacion}
                  onClick={() => actualizar({ estado: "aprobado", compensacion })}
                  className="min-h-9 flex-1 rounded-md bg-green-700 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Aprobar
                </button>
              </div>
              {!compensacion && <p className="text-xs text-slate-500">Para aprobar, elige la compensación.</p>}
            </div>
          )
        ) : (
          <p className="mt-2 text-xs text-slate-500">Esperando que Jhojan lo apruebe o lo rechace.</p>
        ))}

      {p.estado === "aprobado" &&
        (marcaGozado ? (
          p.desde > hoy ? (
            <p className="mt-2 text-xs text-slate-500">Se marca como gozado desde el {fechaCorta(p.desde)}, cuando empiece.</p>
          ) : (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => actualizar({ estado: "gozado" })}
              className="mt-2 min-h-9 rounded-md border border-slate-900 px-3 text-xs font-semibold disabled:opacity-40"
            >
              Marcar como gozado
            </button>
          )
        ) : (
          <p className="mt-2 text-xs text-slate-500">RRHH lo marca como gozado cuando se toma.</p>
        ))}
      {error && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </li>
  );
}

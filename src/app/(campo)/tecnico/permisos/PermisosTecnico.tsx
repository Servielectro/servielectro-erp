"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CAMPO, ETIQUETA, TARJETA } from "@/components/rrhh/PantallaPerfil";
import {
  COMPENSACION,
  COMPENSACIONES,
  ESTADO_PERMISO,
  TIPO_PERMISO,
  TIPOS_PERMISO,
  conHoras,
  fechaCorta,
  motivoFechaBloqueada,
  type Compensacion,
  type Permiso,
  type TipoPermiso,
} from "@/lib/rrhh-registros";
import { sumarDias } from "@/lib/tareas";

export function PermisosTecnico({ yo, hoy, permisos }: { yo: string; hoy: string; permisos: Permiso[] }) {
  const router = useRouter();
  const manana = sumarDias(hoy, 1);
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoPermiso>("asunto_personal");
  const [desde, setDesde] = useState(manana);
  const [hasta, setHasta] = useState(manana);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [compensacion, setCompensacion] = useState<Compensacion | "">("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const horas = conHoras(tipo);
  const bloqueo = motivoFechaBloqueada(tipo, desde, hoy);
  const falta = bloqueo
    ? bloqueo
    : !desde
      ? "Falta la fecha."
      : !horas && hasta < desde
        ? "“Hasta” no puede ser antes de “Desde”."
        : horas && (!horaInicio || !horaFin)
          ? "Falta la hora de inicio y la de fin."
          : horas && horaFin <= horaInicio
            ? "La hora de fin tiene que ser después de la de inicio."
            : !motivo.trim()
              ? "Falta el motivo."
              : null;

  function elegirTipo(t: TipoPermiso) {
    setTipo(t);
    // La fecha mínima cambia con el tipo: calamidad desde hoy, lo demás desde mañana.
    const minimo = t === "calamidad_domestica" ? hoy : manana;
    if (desde < minimo) setDesde(minimo);
    if (hasta < minimo) setHasta(minimo);
  }

  function enviar() {
    if (falta) return;
    setError(null);
    empezar(async () => {
      const { error: e } = await createClient()
        .from("permisos_laborales")
        .insert({
          persona_id: yo,
          tipo,
          desde,
          hasta: horas ? desde : hasta,
          hora_inicio: horas ? horaInicio : null,
          hora_fin: horas ? horaFin : null,
          motivo: motivo.trim(),
          compensacion_propuesta: compensacion || null,
        });
      if (e) return setError(e.message);
      setAbierto(false);
      setMotivo("");
      setCompensacion("");
      setAviso("Permiso solicitado. Te aparece aprobado o rechazado acá cuando Jhojan lo decida.");
      router.refresh();
    });
  }

  if (abierto) {
    return (
      <div className={`${TARJETA} space-y-3`}>
        <div>
          <label className={ETIQUETA}>Tipo de permiso *</label>
          <select value={tipo} onChange={(e) => elegirTipo(e.target.value as TipoPermiso)} className={CAMPO}>
            {TIPOS_PERMISO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {tipo === "calamidad_domestica"
              ? "Accidente o calamidad propia o de un familiar: se puede pedir para hoy."
              : "Este tipo se pide desde mañana. Para hoy solo se acepta calamidad doméstica."}
          </p>
        </div>
        <div className={`grid gap-2 ${horas ? "grid-cols-1" : "grid-cols-2"}`}>
          <div>
            <label className={ETIQUETA}>{horas ? "Día *" : "Desde *"}</label>
            <input
              type="date"
              value={desde}
              min={tipo === "calamidad_domestica" ? hoy : manana}
              onChange={(e) => {
                setDesde(e.target.value);
                if (hasta < e.target.value) setHasta(e.target.value);
              }}
              className={CAMPO}
            />
          </div>
          {!horas && (
            <div>
              <label className={ETIQUETA}>Hasta *</label>
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
            </div>
          )}
        </div>
        {bloqueo && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{bloqueo}</p>}
        {horas && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={ETIQUETA}>Hora inicio *</label>
              <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={CAMPO} />
            </div>
            <div>
              <label className={ETIQUETA}>Hora fin *</label>
              <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className={CAMPO} />
            </div>
          </div>
        )}
        <div>
          <label className={ETIQUETA}>Motivo *</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Describe el motivo del permiso" className={CAMPO} />
        </div>
        <div>
          <label className={ETIQUETA}>Compensación que propones</label>
          <select value={compensacion} onChange={(e) => setCompensacion(e.target.value as Compensacion | "")} className={CAMPO}>
            <option value="">No sé / que lo decida Jhojan</option>
            {COMPENSACIONES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Es una propuesta: la compensación la decide Jhojan al aprobar.</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setAbierto(false)} className="min-h-11 rounded-lg border-2 border-slate-300 text-sm font-semibold">
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={pendiente || falta !== null}
            className="min-h-11 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pendiente ? "Enviando…" : "Solicitar permiso"}
          </button>
        </div>
        {falta && !bloqueo && !pendiente && <p className="text-center text-xs text-slate-500">{falta}</p>}
        {bloqueo && <p className="text-center text-xs text-slate-500">No se puede enviar con esa fecha: cámbiala o elige calamidad doméstica si es una.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          setAviso(null);
          setError(null);
          setAbierto(true);
        }}
        className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white"
      >
        + Solicitar permiso
      </button>
      {aviso && <p className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">{aviso}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {permisos.length === 0 ? (
        <p className="text-sm text-slate-500">No has pedido permisos.</p>
      ) : (
        <ul className="space-y-2">
          {permisos.map((p) => (
            <li key={p.id} className={`${TARJETA} ${p.estado === "anulado" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold">{TIPO_PERMISO[p.tipo]}</p>
                  <p className="text-sm text-slate-600">
                    {p.desde === p.hasta ? fechaCorta(p.desde) : `${fechaCorta(p.desde)} → ${fechaCorta(p.hasta)}`}
                    {p.hora_inicio && p.hora_fin ? ` · ${p.hora_inicio.slice(0, 5)}–${p.hora_fin.slice(0, 5)}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.estado === "aprobado" || p.estado === "gozado"
                      ? "bg-green-100 text-green-800"
                      : p.estado === "rechazado"
                        ? "bg-red-100 text-red-800"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {ESTADO_PERMISO[p.estado]}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{p.motivo}</p>
              <p className="mt-1 text-xs text-slate-500">
                {p.compensacion
                  ? `Compensación: ${COMPENSACION[p.compensacion]}`
                  : p.compensacion_propuesta
                    ? `Propusiste: ${COMPENSACION[p.compensacion_propuesta]}`
                    : ""}
              </p>
              {p.estado === "rechazado" && p.motivo_rechazo && (
                <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">Motivo del rechazo: {p.motivo_rechazo}</p>
              )}
              {p.estado === "solicitado" && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    empezar(async () => {
                      if (!window.confirm("¿Anular esta solicitud?")) return;
                      const { error: e } = await createClient().from("permisos_laborales").update({ estado: "anulado" }).eq("id", p.id);
                      if (e) return setError(e.message);
                      setAviso("Solicitud anulada.");
                      router.refresh();
                    })
                  }
                  className="mt-2 min-h-9 rounded-lg border border-red-300 px-3 text-sm font-semibold text-red-800 disabled:opacity-40"
                >
                  Anular solicitud
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

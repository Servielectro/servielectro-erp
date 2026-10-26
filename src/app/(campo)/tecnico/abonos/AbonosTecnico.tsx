"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/rrhh/archivos";
import { CAMPO, ETIQUETA, TARJETA } from "@/components/rrhh/PantallaPerfil";
import { abonoRecortado, ESTADO_ABONO, REGLA_ABONO_FECHA, fechaCorta, leerMonto, motivoAbonoBloqueado, nombreQuincena, pesos, type Abono } from "@/lib/rrhh-registros";
import { sumarDias } from "@/lib/tareas";

export function AbonosTecnico({ yo, hoy, abonos }: { yo: string; hoy: string; abonos: Abono[] }) {
  const router = useRouter();
  const manana = sumarDias(hoy, 1);
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(manana);
  const [calamidad, setCalamidad] = useState(false);
  const [justificacion, setJustificacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const valor = leerMonto(monto);
  // La misma regla que exige la base (fn_abono_fecha_bloqueada): se dice antes de enviar.
  const bloqueo = motivoAbonoBloqueado(calamidad, fecha, hoy);
  const falta =
    valor === null
      ? "Falta el valor."
      : bloqueo
        ? bloqueo
        : calamidad && !justificacion.trim()
          ? "Con calamidad doméstica hay que justificarlo."
          : null;

  function enviar() {
    if (falta) return;
    setError(null);
    empezar(async () => {
      const { error: e } = await createClient()
        .from("abonos")
        .insert({ persona_id: yo, monto: valor, fecha_requerida: fecha, urgencia_calamidad: calamidad, justificacion: calamidad ? justificacion.trim() : null });
      if (e) return setError(e.message);
      setAbierto(false);
      setMonto("");
      setFecha(manana);
      setCalamidad(false);
      setJustificacion("");
      setAviso("Abono solicitado. Te aparece acá cuando Jhojan lo decida.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {abierto ? (
        <div className={`${TARJETA} space-y-3`}>
          <div>
            <label className={ETIQUETA}>Valor *</label>
            <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" placeholder="$ 0" className={CAMPO} />
            {valor !== null && <p className="text-xs text-slate-500">{pesos(valor)}</p>}
          </div>
          <div>
            <label className={ETIQUETA}>Para qué fecha lo requieres *</label>
            <input type="date" value={fecha} min={calamidad ? hoy : manana} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
            <p className="mt-1 text-xs text-slate-600">{REGLA_ABONO_FECHA}</p>
          </div>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={calamidad}
              onChange={(e) => {
                setCalamidad(e.target.checked);
                // Sin calamidad, la fecha mínima vuelve a ser mañana.
                if (!e.target.checked && fecha <= hoy) setFecha(manana);
              }}
              className="mt-0.5 h-5 w-5"
            />
            <span>
              Es una <span className="font-semibold">calamidad doméstica</span> y lo necesito con urgencia (se acepta para hoy, no para días anteriores)
            </span>
          </label>
          {calamidad && (
            <div>
              <label className={ETIQUETA}>Justificación de la calamidad *</label>
              <textarea value={justificacion} onChange={(e) => setJustificacion(e.target.value)} rows={2} placeholder="Qué pasó" className={CAMPO} />
            </div>
          )}
          {bloqueo && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{bloqueo}</p>}
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
              {pendiente ? "Enviando…" : "Solicitar abono"}
            </button>
          </div>
          {falta && !bloqueo && !pendiente && <p className="text-center text-xs text-slate-500">{falta}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAviso(null);
            setAbierto(true);
          }}
          className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white"
        >
          + Solicitar abono
        </button>
      )}
      {aviso && <p className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">{aviso}</p>}

      {abonos.length === 0 ? (
        <p className="text-sm text-slate-500">No has pedido abonos.</p>
      ) : (
        <ul className="space-y-2">
          {abonos.map((a) => (
            <li key={a.id} className={`${TARJETA} ${a.estado === "anulado" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {a.monto_aprobado !== null ? (
                    <>
                      <p className="text-base font-bold">Te aprobaron {pesos(Number(a.monto_aprobado))}</p>
                      <p className={`text-sm ${abonoRecortado(a) ? "font-semibold text-amber-800" : "text-slate-600"}`}>
                        {abonoRecortado(a) ? `Pediste ${pesos(Number(a.monto))}: se te aprobó menos` : `Pediste ${pesos(Number(a.monto))}: se te aprobó todo`}
                      </p>
                    </>
                  ) : (
                    <p className="text-base font-bold">Pediste {pesos(Number(a.monto))}</p>
                  )}
                  <p className="text-sm text-slate-600">Pedido el {fechaCorta(a.fecha_solicitud)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    a.estado === "desembolsado" || a.estado === "aprobado"
                      ? "bg-green-100 text-green-800"
                      : a.estado === "rechazado"
                        ? "bg-red-100 text-red-800"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {ESTADO_ABONO[a.estado]}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">Para el {fechaCorta(a.fecha_requerida)}</p>
              {a.urgencia_calamidad && (
                <p className="mt-1 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
                  <span className="font-semibold">Calamidad doméstica:</span> {a.justificacion}
                </p>
              )}
              {a.estado === "desembolsado" && (
                <div className="mt-1 text-sm text-slate-700">
                  <p>
                    Transferido el {fechaCorta(a.fecha_desembolso)} · se descuenta en la {nombreQuincena(a.quincena_descuento)}
                  </p>
                  {a.pantallazo_path && <AbrirArchivo path={a.pantallazo_path}>📎 Ver comprobante</AbrirArchivo>}
                </div>
              )}
              {a.estado === "rechazado" && a.motivo_rechazo && (
                <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">Motivo del rechazo: {a.motivo_rechazo}</p>
              )}
              {a.estado === "solicitado" && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    empezar(async () => {
                      if (!window.confirm("¿Anular esta solicitud de abono?")) return;
                      const { error: e } = await createClient().from("abonos").update({ estado: "anulado" }).eq("id", a.id);
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

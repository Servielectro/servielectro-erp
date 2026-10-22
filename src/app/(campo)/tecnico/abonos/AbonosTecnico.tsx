"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/rrhh/archivos";
import { CAMPO, ETIQUETA, TARJETA } from "@/components/rrhh/PantallaPerfil";
import { ESTADO_ABONO, fechaCorta, leerMonto, nombreQuincena, pesos, type Abono } from "@/lib/rrhh-registros";

export function AbonosTecnico({ yo, abonos }: { yo: string; abonos: Abono[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const valor = leerMonto(monto);
  const falta = valor === null ? "Falta el valor." : !motivo.trim() ? "Falta para qué lo necesitas." : null;

  function enviar() {
    if (falta) return;
    setError(null);
    empezar(async () => {
      const { error: e } = await createClient().from("abonos").insert({ persona_id: yo, monto: valor, motivo: motivo.trim() });
      if (e) return setError(e.message);
      setAbierto(false);
      setMonto("");
      setMotivo("");
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
            <label className={ETIQUETA}>Para qué *</label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className={CAMPO} />
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
              {pendiente ? "Enviando…" : "Solicitar abono"}
            </button>
          </div>
          {falta && !pendiente && <p className="text-center text-xs text-slate-500">{falta}</p>}
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
                  <p className="text-base font-bold">{pesos(Number(a.monto))}</p>
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
              <p className="mt-1 text-sm text-slate-700">{a.motivo}</p>
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

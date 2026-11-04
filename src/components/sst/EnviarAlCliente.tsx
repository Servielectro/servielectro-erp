"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { estadoEnvio, type EstadoEnvio } from "@/lib/sst/envio-cliente";

const COLOR: Record<EstadoEnvio, string> = {
  borrador: "border-slate-300 bg-slate-50 text-slate-800",
  enviada: "border-amber-400 bg-amber-50 text-amber-900",
  firmada: "border-green-300 bg-green-50 text-green-900",
  publicada: "border-green-300 bg-green-50 text-green-900",
  cerrada: "border-slate-300 bg-slate-50 text-slate-700",
};

/**
 * Migración 137: el acta en borrador NO es visible para el cliente hasta que alguien de adentro la
 * ENVÍA (fn_sst_enviar_al_cliente). La base se niega si faltan campos y su mensaje se muestra tal
 * cual ("Antes de enviarla al cliente falta llenar: …"). Retirar (fn_sst_retirar_del_cliente) la
 * devuelve a borrador interno mientras el contratante no haya firmado. Al sellarse, la base la
 * publica sola en el portal.
 */
export function EnviarAlCliente({
  formatoId,
  estado,
  enviadoEn,
  firmoContratante,
  publicada,
  puedeEnviar,
}: {
  formatoId: string;
  estado: string;
  enviadoEn: string | null;
  firmoContratante: boolean;
  publicada: boolean;
  puedeEnviar: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false);

  const e = estadoEnvio({ estado, enviadoEn, firmoContratante, publicada });

  function enviar() {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const { error } = await supabase.rpc("fn_sst_enviar_al_cliente", { p_formato: formatoId });
      // El texto de la base tal cual: así se ve qué campo falta.
      if (error) return setError(error.message);
      setAviso("Enviada. El cliente ya la ve en «Documentos por firmar».");
      router.refresh();
    });
  }

  function retirar() {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const { error } = await supabase.rpc("fn_sst_retirar_del_cliente", { p_formato: formatoId });
      if (error) return setError(error.message);
      setConfirmandoRetiro(false);
      setAviso("Retirada. El cliente ya no la ve; volvió a borrador interno.");
      router.refresh();
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-semibold text-slate-900">Portal del cliente</h2>
      <p className={`rounded-md border px-3 py-2 text-sm font-semibold ${COLOR[e.clave]}`}>{e.texto}</p>
      {aviso && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{aviso}</p>}
      {error && <p className="whitespace-pre-wrap rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {puedeEnviar && e.clave === "borrador" && (
        <button type="button" disabled={pendiente} onClick={enviar} className="flex min-h-12 w-full items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-400">
          {pendiente ? "Enviando…" : "Enviar al cliente para firma"}
        </button>
      )}
      {puedeEnviar &&
        e.clave === "enviada" &&
        (confirmandoRetiro ? (
          <div className="space-y-2 rounded-md bg-slate-50 p-2">
            <p className="text-sm">El cliente dejará de verla y vuelve a borrador interno. ¿Retirarla?</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmandoRetiro(false)} className="min-h-11 rounded-md border border-slate-300 text-sm font-semibold">
                No
              </button>
              <button type="button" disabled={pendiente} onClick={retirar} className="min-h-11 rounded-md bg-red-700 text-sm font-semibold text-white disabled:bg-slate-300">
                {pendiente ? "Retirando…" : "Sí, retirar"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmandoRetiro(true)} className="min-h-11 text-sm font-semibold text-red-700 underline">
            Retirar
          </button>
        ))}
      {e.clave === "borrador" && <p className="text-xs text-slate-500">Mientras no se envíe, el cliente no ve esta acta. Al enviarla, la lee y firma desde su portal; cuando quede sellada se publica sola.</p>}
      {!puedeEnviar && e.clave === "borrador" && <p className="text-xs text-slate-500">Enviar al cliente requiere Proyectos en nivel “trabajar”.</p>}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { estadoEnvio } from "@/lib/sst/envio-cliente";

export interface DatosEnvio {
  estado: string;
  enviadoEn: string | null;
  /** Migración 139: la plantilla se sella sola al entrar la última firma obligatoria. */
  cierreAutomatico: boolean;
  firmoContratante: boolean;
  publicada: boolean;
}

/**
 * Lo que dice el SISTEMA sobre el acta frente al cliente (migraciones 137 y 139). La copia del celular
 * no lo sabe: ni si se envió, ni si su plantilla se cierra sola. Sin señal devuelve null.
 */
export function useEnvioCliente(formatoId: string, activo: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [datos, setDatos] = useState<DatosEnvio | null>(null);
  const recargar = useCallback(async () => {
    if (!activo || !navigator.onLine) return;
    const [f, firma, pub] = await Promise.all([
      supabase.from("sst_formatos").select("estado, enviado_cliente_en, sst_plantillas(control)").eq("id", formatoId).maybeSingle(),
      supabase.from("sst_formato_firmas").select("id", { count: "exact", head: true }).eq("formato_id", formatoId).eq("rol", "sst_cliente"),
      supabase.from("cliente_portal_documentos").select("id").eq("formato_id", formatoId).is("retirado_en", null).limit(1),
    ]);
    const d = f.data as { estado: string; enviado_cliente_en: string | null; sst_plantillas: { control: { cierre_automatico?: boolean } | null } | null } | null;
    if (!d) return;
    setDatos({
      estado: d.estado,
      enviadoEn: d.enviado_cliente_en,
      cierreAutomatico: d.sst_plantillas?.control?.cierre_automatico === true,
      firmoContratante: (firma.count ?? 0) > 0,
      publicada: !!pub.data?.length,
    });
  }, [supabase, formatoId, activo]);
  useEffect(() => {
    const t = setTimeout(() => void recargar(), 0);
    return () => clearTimeout(t);
  }, [recargar]);
  return { datos, recargar, supabase };
}

/**
 * En el bloque «Firmas» del acta, donde llega quien la llenó: el estado frente al cliente, «Enviar al
 * cliente para firma» (no lo tiene al lado) y «Retirar» mientras no haya firmado. «Firmar aquí con el
 * cliente» es el botón de la firma del contratante, en el mismo bloque. El mensaje de la base sale tal cual.
 */
export function EnvioCliente({
  formatoId,
  datos,
  recargar,
  supabase,
  subirAhora,
  firmas,
  alRetirar,
}: {
  formatoId: string;
  datos: DatosEnvio;
  recargar: () => Promise<void>;
  supabase: ReturnType<typeof createClient>;
  subirAhora: () => Promise<void>;
  /** Firmas que tiene el acta en este dispositivo: retirar las invalida. */
  firmas: number;
  /** Suelta la copia local de las firmas, que es la que deja el formulario bloqueado. */
  alRetirar: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const e = estadoEnvio({ estado: datos.estado, enviadoEn: datos.enviadoEn, firmoContratante: datos.firmoContratante, publicada: datos.publicada });

  async function enviar() {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      // Lo último llenado en el celular tiene que estar en el sistema antes de enviar.
      await subirAhora();
      const { error } = await supabase.rpc("fn_sst_enviar_al_cliente", { p_formato: formatoId });
      if (error) return setError(error.message);
      setAviso("✓ Enviada. El cliente ya la ve en su portal, en «Documentos por firmar». Cuando firme, el acta se cierra y se publica sola.");
      await recargar();
    } finally {
      setOcupado(false);
    }
  }

  async function retirar() {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("fn_sst_retirar_del_cliente", { p_formato: formatoId });
      if (error) return setError(error.message);
      setConfirmando(false);
      await alRetirar();
      setAviso("Retirada: el cliente ya no la ve y las firmas quedaron invalidadas. Ya se puede corregir; hay que volver a firmar.");
      await recargar();
    } finally {
      setOcupado(false);
    }
  }

  const color =
    e.clave === "enviada" ? "border-amber-400 bg-amber-50 text-amber-950" : e.clave === "borrador" ? "border-slate-300 bg-slate-50 text-slate-800" : "border-green-300 bg-green-50 text-green-900";

  return (
    <div className="space-y-2 rounded-lg border-2 border-slate-900 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">Portal del cliente</p>
      <p className={`rounded-md border px-3 py-2 text-sm font-semibold ${color}`}>{e.texto}</p>
      {aviso && <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">{aviso}</p>}
      {error && (
        <div role="alert" className="rounded-xl border-4 border-red-600 bg-red-50 px-4 py-3 text-red-900">
          <p className="text-base font-bold">No se pudo</p>
          <p className="text-base">{error}</p>
        </div>
      )}
      {e.clave === "borrador" && (
        <button type="button" disabled={ocupado} onClick={() => void enviar()} className="min-h-12 w-full rounded-lg bg-slate-900 text-base font-bold text-white disabled:bg-slate-400">
          {ocupado ? "Enviando…" : "📨 Enviar al cliente para firma"}
        </button>
      )}
      {(e.clave === "enviada" || (e.clave === "borrador" && firmas > 0)) &&
        (confirmando ? (
          <div className="space-y-2 rounded-md border-2 border-red-300 bg-red-50 p-2">
            <p className="text-sm font-semibold text-red-950">
              {e.clave === "enviada" ? "El cliente dejará de verla y vuelve a borrador interno. " : ""}
              {firmas > 0 ? `Se invalidan ${firmas === 1 ? "la firma que ya tiene" : `las ${firmas} firmas que ya tiene`}: una firma acredita un contenido, y habrá que volver a firmar sobre el texto corregido. ` : ""}
              ¿Retirarla?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmando(false)} className="min-h-11 rounded-md border border-slate-300 text-sm font-semibold">
                No
              </button>
              <button type="button" disabled={ocupado} onClick={() => void retirar()} className="min-h-11 rounded-md bg-red-700 text-sm font-semibold text-white disabled:bg-slate-300">
                {ocupado ? "Retirando…" : "Sí, retirar"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmando(true)} className="min-h-11 text-sm font-semibold text-red-700 underline">
            {e.clave === "enviada" ? "Retirar" : "Retirar las firmas para corregir"}
          </button>
        ))}
      {e.clave === "borrador" && <p className="text-xs text-slate-600">Si el cliente está contigo, firma aquí mismo con el botón «Firmar aquí con el cliente» de arriba.</p>}
    </div>
  );
}

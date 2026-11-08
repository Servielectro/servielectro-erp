"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { nombreEstado } from "@/lib/licitaciones/etapas";
import { formatoFechaHora } from "@/lib/licitaciones/radar";

export interface Decision {
  id: string;
  decision: "go" | "no_go";
  razon: string;
  decidida_por: string;
  decidida_en: string;
  estado_antes: string;
  estado_despues: string;
  nombre?: string | null;
}

const MINIMO = 15;

/**
 * La puerta GO/NO-GO (etapa 4 del Plan Maestro). La decide quien es responsable de Oportunidades,
 * con la razón obligatoria en los dos sentidos; la base lo vuelve a exigir (fn_licitacion_decidir)
 * y guarda el registro, que no se edita ni se borra. Aprobar NO presenta ni firma nada.
 */
export function Puerta({
  licitacionId,
  estado,
  antesDeLaPuerta,
  decide,
  trabaja,
  decisiones,
}: {
  licitacionId: string;
  estado: string;
  antesDeLaPuerta: boolean;
  decide: boolean;
  trabaja: boolean;
  decisiones: Decision[];
}) {
  const router = useRouter();
  const [razon, setRazon] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<"go" | "no_go" | null>(null);
  const puedeDecidir = decide && (antesDeLaPuerta || estado === "descartada");
  const soloGo = estado === "descartada";

  async function decidir(d: "go" | "no_go") {
    setError(null);
    if (razon.trim().length < MINIMO) return setError(`Escriba por qué (al menos ${MINIMO} letras). Esa razón es lo que después enseña qué descartar.`);
    setOcupado(true);
    const { error } = await createClient().rpc("fn_licitacion_decidir", { p_licitacion: licitacionId, p_decision: d, p_razon: razon.trim() });
    setOcupado(false);
    setConfirmar(null);
    if (error) return setError(error.message);
    setRazon("");
    router.refresh();
  }

  async function llevarAlComite() {
    setError(null);
    setOcupado(true);
    const { error } = await createClient().from("licitaciones").update({ estado: "comite_go_nogo" }).eq("id", licitacionId);
    setOcupado(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <section className="rounded-lg border-2 border-brand-navy bg-white p-3">
      <h2 className="text-base font-semibold text-slate-900">Comité GO/NO-GO</h2>
      <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <b>Aprobar no presenta ni firma nada.</b> Pasa la licitación a «En preparación» y arranca la preparación de documentos. La presentación final
        siempre la hace una persona, y ninguna etapa se salta: cada puerta de control se decide aquí, con su razón.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {puedeDecidir ? (
        <div className="mt-3 space-y-2">
          <label className="block text-sm text-slate-800">
            ¿Por qué? <span className="text-xs text-slate-500">(obligatorio para aprobar y para descartar: es lo que después enseña qué descartar)</span>
            <textarea
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              placeholder={soloGo ? "Ej. Se liberó un técnico en Cali: la retomamos." : "Ej. Cámaras en Bogotá, mínima cuantía, tenemos la experiencia. / No tenemos técnico en esa ciudad."}
            />
          </label>
          <p className="text-xs text-slate-500">{razon.trim().length}/{MINIMO} letras como mínimo</p>
          {confirmar ? (
            <div className="space-y-2 rounded-lg border border-slate-300 p-3">
              <p className="text-sm text-slate-800">
                {confirmar === "go"
                  ? "¿Aprobar? Pasa a «En preparación». No se presenta ni se firma nada."
                  : "¿Descartar? Pasa a «Descartada» con esta razón como motivo."}{" "}
                La decisión queda registrada con su nombre y no se puede editar.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => decidir(confirmar)}
                  className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-50 ${confirmar === "go" ? "bg-emerald-700" : "bg-red-700"}`}
                >
                  {ocupado ? "Registrando…" : confirmar === "go" ? "Sí, aprobar (GO)" : "Sí, descartar (NO-GO)"}
                </button>
                <button type="button" disabled={ocupado} onClick={() => setConfirmar(null)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocupado} onClick={() => setConfirmar("go")} className="min-h-11 flex-1 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-50">
                {soloGo ? "Retomar (GO)" : "Aprobar (GO)"}
              </button>
              {!soloGo && (
                <button type="button" disabled={ocupado} onClick={() => setConfirmar("no_go")} className="min-h-11 flex-1 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-50">
                  Descartar (NO-GO)
                </button>
              )}
            </div>
          )}
        </div>
      ) : antesDeLaPuerta ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-700">
            Aprobar o descartar es de quien es <b>responsable</b> de Oportunidades. Ver no es aprobar.
          </p>
          {trabaja && estado !== "comite_go_nogo" && (
            <button type="button" disabled={ocupado} onClick={llevarAlComite} className="min-h-11 rounded-lg border border-brand-navy px-3 text-sm font-semibold text-brand-navy disabled:opacity-50">
              Llevar al comité
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-700">La puerta ya se pasó: la licitación está en «{nombreEstado(estado)}».</p>
      )}

      <h3 className="mt-4 text-sm font-semibold text-slate-900">Decisiones registradas</h3>
      {decisiones.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">Ninguna todavía.</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {decisiones.map((d) => (
            <li key={d.id} className="rounded-lg border border-slate-200 p-2">
              <p className="text-sm">
                <span className={`mr-1 rounded px-1.5 py-0.5 text-xs font-bold text-white ${d.decision === "go" ? "bg-emerald-700" : "bg-red-700"}`}>
                  {d.decision === "go" ? "GO" : "NO-GO"}
                </span>
                {d.nombre || "Persona sin nombre visible"} · {formatoFechaHora(new Date(d.decidida_en))}
              </p>
              <p className="mt-1 text-sm text-slate-800">«{d.razon}»</p>
              <p className="text-xs text-slate-500">
                {nombreEstado(d.estado_antes)} → {nombreEstado(d.estado_despues)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

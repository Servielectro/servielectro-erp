"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, ElegirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { inicioQuincena } from "@/lib/supabase/rrhh-acceso";
import { ESTADO_ABONO, fechaCorta, nombreQuincena, pesos, type Abono } from "@/lib/rrhh-registros";

export function AbonosRrhh({
  abonos,
  personas,
  yo,
  hoy,
  aprueba,
}: {
  abonos: Abono[];
  personas: Record<string, string>;
  yo: string;
  hoy: string;
  aprueba: boolean;
}) {
  if (abonos.length === 0) return <p className="text-sm text-slate-500">No hay abonos en este filtro.</p>;
  return (
    <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
      {abonos.map((a) => (
        <FilaAbono key={a.id} a={a} persona={personas[a.persona_id] ?? "—"} yo={yo} hoy={hoy} aprueba={aprueba} />
      ))}
    </ul>
  );
}

function FilaAbono({ a, persona, yo, hoy, aprueba }: { a: Abono; persona: string; yo: string; hoy: string; aprueba: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<"nada" | "rechazar" | "desembolsar">("nada");
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const propio = a.persona_id === yo;
  const abierto = a.estado === "solicitado" || a.estado === "aprobado";

  const actualizar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("abonos").update(cambios).eq("id", a.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: el abono cambió o no tienes permiso.");
      setModo("nada");
      router.refresh();
    });

  function desembolsar() {
    if (!archivo || !fecha) return;
    empezar(async () => {
      setError(null);
      try {
        // Primero el pantallazo (solo el aprobador puede subirlo a la carpeta de este abono),
        // después el registro: la base exige los dos para pasar a "desembolsado".
        const s = await subirSoporte(`abonos/${a.id}`, archivo);
        const { data, error: e } = await createClient()
          .from("abonos")
          .update({ estado: "desembolsado", fecha_desembolso: fecha, pantallazo_path: s.path })
          .eq("id", a.id)
          .select("id");
        if (e) throw new Error(e.message);
        if (!data?.length) throw new Error("No se guardó: el abono cambió o no tienes permiso.");
        setModo("nada");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const faltaDesembolso = !archivo ? "Falta el pantallazo de la transferencia." : !fecha ? "Falta la fecha de la transferencia." : fecha > hoy ? "La fecha no puede ser futura." : fecha < a.fecha_solicitud ? "La fecha no puede ser antes de la solicitud." : null;

  return (
    <li className="rounded-lg border border-slate-300 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{persona}</p>
          <p className="text-xs text-slate-600">Pedido el {fechaCorta(a.fecha_solicitud)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-bold">{pesos(Number(a.monto))}</p>
          <p className="text-xs font-semibold text-slate-500">{ESTADO_ABONO[a.estado]}</p>
        </div>
      </div>
      <p className={`mt-1 ${abierto && a.fecha_requerida <= hoy ? "font-semibold text-red-800" : "text-slate-700"}`}>
        Lo requiere para el {fechaCorta(a.fecha_requerida)}
        {a.fecha_requerida === hoy ? " (hoy)" : abierto && a.fecha_requerida < hoy ? " (ya pasó)" : ""}
      </p>
      {a.urgencia_calamidad && (
        <p className="mt-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          <span className="font-semibold">⚠ Calamidad doméstica (urgencia):</span> {a.justificacion}
        </p>
      )}
      {a.estado === "desembolsado" && (
        <div className="mt-1 text-xs text-slate-700">
          <p>
            Transferido el {fechaCorta(a.fecha_desembolso)} · <span className="font-semibold">se descuenta en la {nombreQuincena(a.quincena_descuento)}</span>
          </p>
          {a.pantallazo_path && <AbrirArchivo path={a.pantallazo_path}>📎 Pantallazo de la transferencia</AbrirArchivo>}
        </div>
      )}
      {a.motivo_rechazo && <p className="mt-1 text-xs text-red-800">Rechazado: {a.motivo_rechazo}</p>}

      {abierto && !aprueba && <p className="mt-2 text-xs text-slate-500">Esperando que Jhojan lo apruebe y lo transfiera.</p>}
      {abierto && aprueba && propio && <p className="mt-2 text-xs text-slate-500">Es tu propio abono: no te lo puedes aprobar.</p>}
      {abierto && aprueba && !propio && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          {modo === "rechazar" ? (
            <div className="space-y-1">
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Por qué se rechaza (lo ve el técnico)" className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setModo("nada")} className="min-h-9 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
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
          ) : modo === "desembolsar" ? (
            <div className="space-y-2">
              <label className="block text-xs text-slate-600">
                Fecha de la transferencia
                <input type="date" value={fecha} max={hoy} min={a.fecha_solicitud} onChange={(e) => setFecha(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
              </label>
              {fecha && <p className="text-xs text-slate-600">Se descuenta en la {nombreQuincena(inicioQuincena(fecha))}.</p>}
              {archivo ? (
                <p className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">📎 {archivo.name}</span>
                  <button type="button" onClick={() => setArchivo(null)} className="font-semibold underline">
                    Quitar
                  </button>
                </p>
              ) : (
                <ElegirArchivo onElegido={setArchivo} textoFoto="📷 Foto" textoArchivo="Pantallazo o PDF" />
              )}
              <p className="text-xs text-amber-800">Después de registrarlo, el pantallazo y la fecha no se cambian.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModo("nada")} className="min-h-9 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendiente || faltaDesembolso !== null}
                  onClick={desembolsar}
                  className="min-h-9 flex-1 rounded-md bg-green-700 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {pendiente ? "Subiendo…" : "Registrar desembolso"}
                </button>
              </div>
              {faltaDesembolso && !pendiente && <p className="text-xs text-slate-500">{faltaDesembolso}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setModo("rechazar")} className="min-h-9 rounded-md border border-red-300 px-3 text-xs font-semibold text-red-800">
                Rechazar…
              </button>
              {a.estado === "solicitado" && (
                <button type="button" disabled={pendiente} onClick={() => actualizar({ estado: "aprobado" })} className="min-h-9 rounded-md border border-green-700 px-3 text-xs font-semibold text-green-800 disabled:opacity-40">
                  Aprobar (transfiero después)
                </button>
              )}
              <button type="button" onClick={() => setModo("desembolsar")} className="min-h-9 rounded-md bg-green-700 px-3 text-xs font-semibold text-white">
                {a.estado === "solicitado" ? "Aprobar y registrar transferencia" : "Registrar transferencia"}
              </button>
            </div>
          )}
          {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
        </div>
      )}
    </li>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  avisos,
  ESTADO_COTIZACION,
  NOMBRE_PASO,
  SIGUIENTES,
  TIPOS_PASO,
  type AlertaCotizacion,
  type Paso,
} from "@/lib/cotizaciones/seguimiento";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";
const fecha = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

interface Borrador {
  tipo: string;
  detalle_otro: string;
  fecha_programada: string;
  responsable_id: string;
  notas: string;
}
const vacio = (): Borrador => ({ tipo: "", detalle_otro: "", fecha_programada: "", responsable_id: "", notas: "" });
const deP = (p: Paso): Borrador => ({
  tipo: p.tipo ?? "",
  detalle_otro: p.detalle_otro ?? "",
  fecha_programada: p.fecha_programada ?? "",
  responsable_id: p.responsable_id ?? "",
  notas: p.notas ?? "",
});

/**
 * El seguimiento de una cotización (migraciones 98 y 99): mover el estado, la validez, el próximo
 * paso (qué, cuándo, quién) y cerrarlo con su resultado abriendo el siguiente. La base exige las
 * reglas; si algo no vale, se muestra su mensaje.
 */
export function SeguimientoCotizacion({
  cotizacionId,
  estado,
  validezDias,
  alerta,
  pasos,
  responsables,
  trabaja,
}: {
  cotizacionId: string;
  estado: string;
  validezDias: number;
  alerta: AlertaCotizacion | undefined;
  pasos: Paso[];
  responsables: { id: string; nombre: string }[];
  trabaja: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const abierto = pasos.find((p) => !p.realizado_en) ?? null;
  const cerrados = pasos.filter((p) => p.realizado_en);
  const [paso, setPaso] = useState<Borrador>(() => (abierto ? deP(abierto) : vacio()));
  const [cerrando, setCerrando] = useState(false);
  const [resultado, setResultado] = useState("");
  const [siguiente, setSiguiente] = useState<Borrador>(vacio);
  const [validez, setValidez] = useState(String(validezDias));
  const nombre = new Map(responsables.map((r) => [r.id, r.nombre]));
  const enCurso = estado === "ENVIADA" || estado === "EN_EVALUACION";

  const correr = (accion: () => PromiseLike<{ error: { message: string } | null }>) =>
    empezar(async () => {
      setError(null);
      const { error: e } = await accion();
      if (e) return setError(e.message);
      setCerrando(false);
      setResultado("");
      setSiguiente(vacio());
      router.refresh();
    });
  const supabase = createClient();
  const limpio = (b: Borrador) => ({
    tipo: b.tipo || null,
    detalle_otro: b.tipo === "otro" ? b.detalle_otro.trim() || null : null,
    fecha_programada: b.fecha_programada || null,
    responsable_id: b.responsable_id || null,
    notas: b.notas.trim() || null,
  });

  function cambiarEstado(nuevo: string, boton: string) {
    if ((nuevo === "APROBADA" || nuevo === "RECHAZADA") && !window.confirm(`¿Marcar la cotización como ${boton.toLowerCase()}? No se puede volver atrás.`)) return;
    correr(() => supabase.from("cotizaciones").update({ estado: nuevo }).eq("id", cotizacionId));
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-bold text-slate-900">Seguimiento</h2>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${ESTADO_COTIZACION[estado]?.clase ?? "bg-slate-100"}`}>
          {ESTADO_COTIZACION[estado]?.etiqueta ?? estado}
        </span>
      </div>

      {avisos(alerta).map((a) => (
        <p key={a.texto} className={`rounded-md px-2 py-1 text-sm ${a.grave ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
          {a.grave ? "⚠ " : ""}
          {a.texto}
        </p>
      ))}

      {trabaja && (SIGUIENTES[estado] ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {SIGUIENTES[estado].map((s) => (
            <button
              key={s.estado}
              type="button"
              disabled={pendiente}
              onClick={() => cambiarEstado(s.estado, s.boton)}
              className="min-h-11 flex-1 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 disabled:opacity-40"
            >
              {s.boton}
            </button>
          ))}
        </div>
      )}

      {trabaja && estado !== "APROBADA" && estado !== "RECHAZADA" && (
        <label className="flex items-center gap-2 text-sm">
          Validez (días)
          <input value={validez} onChange={(e) => setValidez(e.target.value)} inputMode="numeric" className="w-20 rounded-md border border-slate-300 px-2 py-1" />
          {validez !== String(validezDias) && (
            <button
              type="button"
              disabled={pendiente || !/^\d+$/.test(validez)}
              onClick={() => correr(() => supabase.from("cotizaciones").update({ validez_dias: Number(validez) }).eq("id", cotizacionId))}
              className="min-h-11 rounded-md bg-slate-900 px-3 text-sm text-white disabled:opacity-40"
            >
              Guardar
            </button>
          )}
          {alerta && <span className="text-xs text-slate-500">vence el {alerta.validez_vence}</span>}
        </label>
      )}

      {enCurso && (
        <div className="space-y-2 rounded-md border border-slate-200 p-2">
          <p className="text-sm font-semibold">Próximo paso</p>
          <CamposPaso b={paso} onCambio={setPaso} responsables={responsables} dis={!trabaja} />
          {trabaja && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendiente}
                onClick={() =>
                  correr(() =>
                    abierto
                      ? supabase.from("cotizacion_seguimientos").update(limpio(paso)).eq("id", abierto.id)
                      : supabase.from("cotizacion_seguimientos").insert({ cotizacion_id: cotizacionId, ...limpio(paso) }),
                  )
                }
                className="min-h-11 flex-1 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {abierto ? "Guardar el paso" : "Programar el paso"}
              </button>
              {abierto && !cerrando && (
                <button type="button" onClick={() => setCerrando(true)} className="min-h-11 flex-1 rounded-md border border-slate-400 px-3 text-sm font-semibold">
                  Ya se hizo: cerrar y programar el siguiente
                </button>
              )}
            </div>
          )}
          {cerrando && abierto && (
            <div className="space-y-2 rounded-md bg-slate-50 p-2">
              <label className="block text-sm font-medium">
                Resultado (qué pasó)
                <textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={2} className={CAMPO} />
              </label>
              <p className="text-sm font-medium">Siguiente paso</p>
              <CamposPaso b={siguiente} onCambio={setSiguiente} responsables={responsables} dis={false} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setCerrando(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendiente || !resultado.trim()}
                  onClick={() => {
                    const s = limpio(siguiente);
                    correr(() =>
                      supabase.rpc("fn_cerrar_seguimiento", {
                        p_seguimiento_id: abierto.id,
                        p_resultado: resultado.trim(),
                        p_siguiente_tipo: s.tipo,
                        p_siguiente_fecha: s.fecha_programada,
                        p_siguiente_responsable: s.responsable_id,
                        p_siguiente_notas: s.notas,
                        p_siguiente_detalle_otro: s.detalle_otro,
                      }),
                    );
                  }}
                  className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Cerrar y programar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {cerrados.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer text-sm font-semibold text-slate-700">Historial ({cerrados.length})</summary>
          <ul className="mt-1 space-y-2 border-l-2 border-slate-200 pl-3">
            {cerrados.map((p) => (
              <li key={p.id} className="text-sm">
                <p className="text-xs text-slate-500">
                  {fecha(p.realizado_en!)} · {nombre.get(p.cerrado_por ?? "") ?? "—"}
                </p>
                <p>
                  <span className="font-medium">{p.tipo ? NOMBRE_PASO[p.tipo] ?? p.tipo : "Por definir"}</span>
                  {p.tipo === "otro" && p.detalle_otro ? `: ${p.detalle_otro}` : ""}
                  {p.fecha_programada ? ` (programado para ${p.fecha_programada})` : ""}
                </p>
                <p className="text-slate-700">{p.resultado}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </section>
  );
}

function CamposPaso({
  b,
  onCambio,
  responsables,
  dis,
}: {
  b: Borrador;
  onCambio: (b: Borrador) => void;
  responsables: { id: string; nombre: string }[];
  dis: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block text-sm sm:col-span-2">
        Qué
        <select disabled={dis} value={b.tipo} onChange={(e) => onCambio({ ...b, tipo: e.target.value })} className={CAMPO}>
          <option value="">Por definir</option>
          {TIPOS_PASO.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </label>
      {b.tipo === "otro" && (
        <label className="block text-sm sm:col-span-2">
          Cuál
          <input disabled={dis} value={b.detalle_otro} onChange={(e) => onCambio({ ...b, detalle_otro: e.target.value })} className={CAMPO} />
        </label>
      )}
      <label className="block text-sm">
        Cuándo
        <input disabled={dis} type="date" value={b.fecha_programada} onChange={(e) => onCambio({ ...b, fecha_programada: e.target.value })} className={CAMPO} />
      </label>
      <label className="block text-sm">
        Quién
        <select disabled={dis} value={b.responsable_id} onChange={(e) => onCambio({ ...b, responsable_id: e.target.value })} className={CAMPO}>
          <option value="">Sin asignar</option>
          {responsables.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm sm:col-span-2">
        Notas
        <textarea disabled={dis} value={b.notas} onChange={(e) => onCambio({ ...b, notas: e.target.value })} rows={2} className={CAMPO} />
      </label>
    </div>
  );
}

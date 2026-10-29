"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ESTADOS_EPP, nombreDe, SEMAFORO, semaforo } from "@/lib/sst/personal";

export interface EntregaEpp {
  id: string;
  nombre: string | null;
  cantidad: number;
  talla: string | null;
  fecha_entrega: string;
  devuelta_en: string | null;
  observacion: string | null;
  seguimiento: { entrega_id: string; capacitacion_uso_en: string | null; vida_util_meses: number | null; reponer_en: string | null; notas: string | null } | null;
  inspecciones: { id: string; entrega_id: string; fecha: string; estado: string; en_uso: boolean | null; observacion: string | null }[];
}

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";

/**
 * EPP de la persona (migración 107). La entrega es de RRHH (dotación), y SG-SST también puede
 * registrarla; lo que SG-SST completa (capacitación en el uso, reposición, inspecciones) va aparte.
 */
export function EppPersona({ empleadoId, entregas, sst }: { empleadoId: string; entregas: EntregaEpp[]; sst: boolean }) {
  const router = useRouter();
  const [nueva, setNueva] = useState(false);
  const [d, setD] = useState({ nombre: "", cantidad: "1", talla: "", fecha_entrega: "", observacion: "" });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const registrar = () =>
    empezar(async () => {
      setError(null);
      const { error: e } = await createClient()
        .from("dotacion_entregas")
        .insert({ empleado_id: empleadoId, categoria: "epp", nombre: d.nombre.trim(), cantidad: Number(d.cantidad) || 1, talla: d.talla.trim() || null, fecha_entrega: d.fecha_entrega, observacion: d.observacion.trim() || null });
      if (e) return setError(e.message);
      setNueva(false);
      setD({ nombre: "", cantidad: "1", talla: "", fecha_entrega: "", observacion: "" });
      router.refresh();
    });
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-bold text-slate-900">EPP entregado</h2>
        {sst && !nueva && (
          <button type="button" onClick={() => setNueva(true)} className="min-h-11 rounded-md border border-slate-900 px-3 text-sm font-semibold">
            + Registrar entrega de EPP
          </button>
        )}
      </div>
      {nueva && (
        <div className="grid gap-2 rounded-md border border-slate-300 bg-slate-50 p-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            Elemento
            <input value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} className={CAMPO} placeholder="Ej.: arnés de cuerpo completo, casco, guantes dieléctricos" />
          </label>
          <label className="block text-sm">
            Cantidad
            <input value={d.cantidad} onChange={(e) => setD({ ...d, cantidad: e.target.value })} inputMode="numeric" className={CAMPO} />
          </label>
          <label className="block text-sm">
            Talla
            <input value={d.talla} onChange={(e) => setD({ ...d, talla: e.target.value })} className={CAMPO} />
          </label>
          <label className="block text-sm">
            Fecha de entrega
            <input type="date" value={d.fecha_entrega} onChange={(e) => setD({ ...d, fecha_entrega: e.target.value })} className={CAMPO} />
          </label>
          <label className="block text-sm">
            Observación
            <input value={d.observacion} onChange={(e) => setD({ ...d, observacion: e.target.value })} className={CAMPO} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={() => setNueva(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
              Cancelar
            </button>
            <button type="button" disabled={pendiente || !d.nombre.trim() || !d.fecha_entrega} onClick={registrar} className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
              Registrar
            </button>
          </div>
          {error && <p className="text-sm text-red-800 sm:col-span-2">{error}</p>}
        </div>
      )}
      {entregas.length === 0 ? (
        <p className="text-xs text-slate-500">Sin entregas de EPP registradas.</p>
      ) : (
        <ul className="space-y-2">
          {entregas.map((e) => (
            <Entrega key={e.id} e={e} sst={sst} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Entrega({ e, sst }: { e: EntregaEpp; sst: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState<null | "seguimiento" | "inspeccion">(null);
  const [seg, setSeg] = useState({ capacitacion_uso_en: e.seguimiento?.capacitacion_uso_en ?? "", vida_util_meses: e.seguimiento?.vida_util_meses?.toString() ?? "", reponer_en: e.seguimiento?.reponer_en ?? "" });
  const [ins, setIns] = useState({ estado: "bueno", en_uso: "si", observacion: "" });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const s = semaforo(e.seguimiento?.reponer_en, !!e.seguimiento?.reponer_en);
  const guardar = (accion: () => PromiseLike<{ error: { message: string } | null }>) =>
    empezar(async () => {
      setError(null);
      const { error: x } = await accion();
      if (x) return setError(x.message);
      setEditando(null);
      router.refresh();
    });
  const supabase = createClient();
  return (
    <li className="rounded-md border border-slate-200 p-2 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {e.nombre} {e.cantidad > 1 ? `× ${e.cantidad}` : ""} {e.talla ? `· talla ${e.talla}` : ""}
          </p>
          <p className="text-xs text-slate-600">
            Entregado el {e.fecha_entrega}
            {e.devuelta_en ? ` · devuelto el ${e.devuelta_en}` : ""}
            {e.seguimiento?.capacitacion_uso_en ? ` · capacitación en el uso ${e.seguimiento.capacitacion_uso_en}` : " · sin capacitación en el uso registrada"}
          </p>
          {e.inspecciones[0] && (
            <p className="text-xs text-slate-600">
              Última inspección {e.inspecciones[0].fecha}: {nombreDe(ESTADOS_EPP, e.inspecciones[0].estado)}
              {e.inspecciones[0].en_uso === false ? " · no lo estaba usando" : ""}
              {e.inspecciones[0].observacion ? ` · ${e.inspecciones[0].observacion}` : ""}
            </p>
          )}
        </div>
        {e.seguimiento?.reponer_en && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${SEMAFORO[s].clase}`}>Reponer {e.seguimiento.reponer_en}</span>}
      </div>
      {sst && !editando && (
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditando("seguimiento")} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs font-semibold">
            Capacitación y reposición
          </button>
          <button type="button" onClick={() => setEditando("inspeccion")} className="min-h-11 rounded-md border border-slate-300 px-3 text-xs font-semibold">
            Registrar inspección
          </button>
        </div>
      )}
      {editando === "seguimiento" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="block text-xs">
            Capacitación en el uso
            <input type="date" value={seg.capacitacion_uso_en} onChange={(x) => setSeg({ ...seg, capacitacion_uso_en: x.target.value })} className={CAMPO} />
          </label>
          <label className="block text-xs">
            Vida útil (meses)
            <input value={seg.vida_util_meses} onChange={(x) => setSeg({ ...seg, vida_util_meses: x.target.value })} inputMode="numeric" className={CAMPO} />
          </label>
          <label className="block text-xs">
            Reponer el
            <input type="date" value={seg.reponer_en} onChange={(x) => setSeg({ ...seg, reponer_en: x.target.value })} className={CAMPO} />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button type="button" onClick={() => setEditando(null)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-xs">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                guardar(() =>
                  supabase.from("epp_seguimiento").upsert({
                    entrega_id: e.id,
                    capacitacion_uso_en: seg.capacitacion_uso_en || null,
                    vida_util_meses: seg.vida_util_meses ? Number(seg.vida_util_meses) : null,
                    reponer_en: seg.reponer_en || null,
                  }),
                )
              }
              className="min-h-11 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
      {editando === "inspeccion" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="block text-xs">
            Estado
            <select value={ins.estado} onChange={(x) => setIns({ ...ins, estado: x.target.value })} className={CAMPO}>
              {ESTADOS_EPP.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            ¿Lo estaba usando?
            <select value={ins.en_uso} onChange={(x) => setIns({ ...ins, en_uso: x.target.value })} className={CAMPO}>
              <option value="si">Sí</option>
              <option value="no">No</option>
              <option value="na">No aplica</option>
            </select>
          </label>
          <label className="block text-xs">
            Observación
            <input value={ins.observacion} onChange={(x) => setIns({ ...ins, observacion: x.target.value })} className={CAMPO} />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button type="button" onClick={() => setEditando(null)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-xs">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                guardar(() =>
                  supabase.from("epp_inspecciones").insert({ entrega_id: e.id, estado: ins.estado, en_uso: ins.en_uso === "na" ? null : ins.en_uso === "si", observacion: ins.observacion.trim() || null }),
                )
              }
              className="min-h-11 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white disabled:opacity-40"
            >
              Registrar
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-800">{error}</p>}
    </li>
  );
}

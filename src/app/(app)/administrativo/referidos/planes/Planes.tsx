"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/pricing";
import { ETIQUETA_BASE, pct, type Plan } from "@/lib/referidos";

const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal";
const etiqueta = "block text-sm font-semibold text-slate-800";
const aPct = (v: number | null) => (v == null ? "" : String(Math.round(Number(v) * 10000) / 100));
const deTexto = (t: string) => (t.trim() ? Number(t.replace(",", ".")) : null);

export function Planes({ planes, escribe }: { planes: Plan[]; escribe: boolean }) {
  const [editando, setEditando] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {escribe && editando !== "nuevo" && (
        <button type="button" onClick={() => setEditando("nuevo")} className="min-h-11 rounded-lg bg-brand-red px-4 text-sm font-semibold text-white">
          + Nuevo plan
        </button>
      )}
      {editando === "nuevo" && <FormPlan onCerrar={() => setEditando(null)} />}
      <ul className="space-y-2">
        {planes.map((p) =>
          editando === p.id ? (
            <li key={p.id}>
              <FormPlan p={p} onCerrar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={p.id} className={`rounded-lg border border-slate-300 bg-white p-3 ${p.activo ? "" : "opacity-60"}`}>
              <p className="text-sm font-semibold text-slate-900">
                {p.nombre}
                {!p.activo && " (inactivo)"}
              </p>
              <p className="text-sm text-slate-800">
                {pct(p.porcentaje)} {ETIQUETA_BASE[p.base]}
                {p.tope_por_proyecto ? ` · tope ${formatCOP(Number(p.tope_por_proyecto))}` : ""}
                {p.porcentaje_recurrente ? ` · ${pct(p.porcentaje_recurrente)} recurrente por ${p.meses_recurrencia ?? "?"} meses` : ""}
              </p>
              <p className="text-xs text-slate-600">
                Se causa con el {p.causa} · registros de {p.dias_vigencia_registro} días
              </p>
              {p.descripcion && <p className="mt-1 text-xs text-slate-600">{p.descripcion}</p>}
              {escribe && (
                <button type="button" onClick={() => setEditando(p.id)} className="mt-2 min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
                  Editar
                </button>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function FormPlan({ p, onCerrar }: { p?: Plan; onCerrar: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    nombre: p?.nombre ?? "",
    descripcion: p?.descripcion ?? "",
    base: p?.base ?? ("precio_con_comision" as Plan["base"]),
    porcentaje: aPct(p?.porcentaje ?? null),
    porcentaje_recurrente: aPct(p?.porcentaje_recurrente ?? null),
    meses_recurrencia: p?.meses_recurrencia ? String(p.meses_recurrencia) : "",
    tope_por_proyecto: p?.tope_por_proyecto ? String(p.tope_por_proyecto) : "",
    dias_vigencia_registro: String(p?.dias_vigencia_registro ?? 90),
    causa: p?.causa ?? ("recaudo" as Plan["causa"]),
    activo: p?.activo ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const guardar = () =>
    empezar(async () => {
      setError(null);
      const porcentaje = deTexto(f.porcentaje);
      const recurrente = deTexto(f.porcentaje_recurrente);
      if (!porcentaje || porcentaje <= 0 || porcentaje > 50) return setError("El porcentaje va entre 0 y 50.");
      if (recurrente != null && (recurrente <= 0 || recurrente > 50)) return setError("El porcentaje recurrente va entre 0 y 50.");
      if (recurrente != null && !f.meses_recurrencia) return setError("Con porcentaje recurrente hay que decir cuántos meses.");
      const fila = {
        nombre: f.nombre.trim(),
        descripcion: f.descripcion.trim() || null,
        base: f.base,
        porcentaje: porcentaje / 100,
        porcentaje_recurrente: recurrente == null ? null : recurrente / 100,
        meses_recurrencia: recurrente == null ? null : Number(f.meses_recurrencia),
        tope_por_proyecto: f.tope_por_proyecto.replace(/\D/g, "") ? Number(f.tope_por_proyecto.replace(/\D/g, "")) : null,
        dias_vigencia_registro: Number(f.dias_vigencia_registro),
        causa: f.causa,
        activo: f.activo,
      };
      const supabase = createClient();
      const { data, error: e } = p ? await supabase.from("referido_planes").update(fila).eq("id", p.id).select("id") : await supabase.from("referido_planes").insert(fila).select("id");
      if (e) return setError(e.code === "23505" ? "Ya hay un plan con ese nombre." : e.message);
      if (!data?.length) return setError("No se guardó (sin permiso).");
      onCerrar();
      router.refresh();
    });

  return (
    <section className="space-y-3 rounded-lg border border-slate-400 bg-white p-3">
      <label className={etiqueta}>
        Nombre
        <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={input} />
      </label>
      <label className={etiqueta}>
        Sobre qué se calcula
        <select value={f.base} onChange={(e) => setF({ ...f, base: e.target.value as Plan["base"] })} className={`${input} px-2`}>
          <option value="precio_con_comision">Preciada dentro de la cotización (la paga el cliente en el precio)</option>
          <option value="utilidad">Un porcentaje de la utilidad del proyecto</option>
        </select>
        <span className="mt-1 block text-xs font-normal text-slate-600">
          No existe la opción «sobre el valor del contrato», a propósito: en Tintalá ($16.970.535, utilidad AIU de $870.284) un 5% del contrato se habría comido el 97% de la utilidad.
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>
          Porcentaje
          <input inputMode="decimal" value={f.porcentaje} onChange={(e) => setF({ ...f, porcentaje: e.target.value })} placeholder="8" className={input} />
        </label>
        <label className={etiqueta}>
          Recurrente % (opcional)
          <input inputMode="decimal" value={f.porcentaje_recurrente} onChange={(e) => setF({ ...f, porcentaje_recurrente: e.target.value })} placeholder="10" className={input} />
        </label>
        <label className={etiqueta}>
          Meses de recurrencia
          <input inputMode="numeric" value={f.meses_recurrencia} onChange={(e) => setF({ ...f, meses_recurrencia: e.target.value })} placeholder="12" className={input} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>
          Tope por proyecto (opcional)
          <input inputMode="numeric" value={f.tope_por_proyecto} onChange={(e) => setF({ ...f, tope_por_proyecto: e.target.value })} className={input} />
        </label>
        <label className={etiqueta}>
          Días que dura un registro
          <input inputMode="numeric" value={f.dias_vigencia_registro} onChange={(e) => setF({ ...f, dias_vigencia_registro: e.target.value })} className={input} />
          <span className="mt-1 block text-xs font-normal text-slate-600">Entre 90 y 120 es lo usual.</span>
        </label>
        <label className={etiqueta}>
          Se causa con
          <select value={f.causa} onChange={(e) => setF({ ...f, causa: e.target.value as Plan["causa"] })} className={`${input} px-2`}>
            <option value="recaudo">El recaudo (cuando el cliente paga)</option>
            <option value="firma">La firma</option>
          </select>
        </label>
      </div>
      {f.causa === "firma" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Con «la firma», se le paga al referido aunque el cliente no pague: es financiarle el negocio con plata que todavía no entra.
        </p>
      )}
      <label className={etiqueta}>
        Descripción
        <textarea rows={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} className="h-5 w-5" />
        Activo (se puede asignar a referidos nuevos)
      </label>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCerrar} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
          Cancelar
        </button>
        <button type="button" disabled={pendiente || !f.nombre.trim()} onClick={guardar} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </section>
  );
}

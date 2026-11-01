"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIAS, ETIQUETA_BASE, pct, type CategoriaReferido, type Plan } from "@/lib/referidos";

export interface Referido {
  id: string;
  tipo: "persona" | "empresa";
  nombre: string;
  tipo_documento: string;
  numero_documento: string;
  categoria: CategoriaReferido;
  correo: string | null;
  telefono: string | null;
  ciudad: string | null;
  plan_id: string | null;
  estado: "activo" | "inactivo" | "suspendido";
  acuerdo_firmado: boolean;
  notas: string | null;
}

const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal";
const etiqueta = "block text-sm font-semibold text-slate-800";

/** Alta (sin `r`) o edición de un referido. */
export function FormReferido({ r, planes, onCerrar }: { r?: Referido; planes: Plan[]; onCerrar?: () => void }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(!!r);
  const [f, setF] = useState({
    tipo: r?.tipo ?? ("persona" as Referido["tipo"]),
    nombre: r?.nombre ?? "",
    tipo_documento: r?.tipo_documento ?? "CC",
    numero_documento: r?.numero_documento ?? "",
    categoria: r?.categoria ?? ("freelance" as CategoriaReferido),
    correo: r?.correo ?? "",
    telefono: r?.telefono ?? "",
    ciudad: r?.ciudad ?? "",
    plan_id: r?.plan_id ?? "",
    estado: r?.estado ?? ("activo" as Referido["estado"]),
    acuerdo_firmado: r?.acuerdo_firmado ?? false,
    notas: r?.notas ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const plan = planes.find((p) => p.id === f.plan_id);
  const cerrar = () => (onCerrar ? onCerrar() : setAbierto(false));

  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-lg bg-brand-red px-4 text-sm font-semibold text-white">
        + Nuevo referido
      </button>
    );

  const guardar = () =>
    empezar(async () => {
      setError(null);
      const fila = {
        tipo: f.tipo,
        nombre: f.nombre.trim(),
        tipo_documento: f.tipo_documento,
        numero_documento: f.numero_documento.replace(/[\s.]/g, ""),
        categoria: f.categoria,
        correo: f.correo.trim() || null,
        telefono: f.telefono.trim() || null,
        ciudad: f.ciudad.trim() || null,
        plan_id: f.plan_id || null,
        estado: f.estado,
        acuerdo_firmado: f.acuerdo_firmado,
        notas: f.notas.trim() || null,
      };
      const supabase = createClient();
      const { data, error: e } = r
        ? await supabase.from("referidos").update(fila).eq("id", r.id).select("id")
        : await supabase.from("referidos").insert(fila).select("id");
      if (e) return setError(e.code === "23505" ? "Ya hay un referido con ese documento." : e.message);
      if (!data?.length) return setError("No se guardó (sin permiso).");
      if (r) {
        cerrar();
        router.refresh();
      } else router.push(`/administrativo/referidos/${data[0].id}`);
    });

  return (
    <section className="space-y-3 rounded-lg border border-slate-400 bg-white p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={etiqueta}>
          Es
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Referido["tipo"], tipo_documento: e.target.value === "empresa" ? "NIT" : "CC" })} className={`${input} px-2`}>
            <option value="persona">Una persona</option>
            <option value="empresa">Una empresa</option>
          </select>
        </label>
        <label className={etiqueta}>
          Categoría
          <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaReferido })} className={`${input} px-2`}>
            {CATEGORIAS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={etiqueta}>
        Nombre
        <input autoFocus={!r} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={input} />
      </label>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <label className={etiqueta}>
          Documento
          <select value={f.tipo_documento} onChange={(e) => setF({ ...f, tipo_documento: e.target.value })} className={`${input} px-2`}>
            {["CC", "CE", "PA", "PPT", "NIT"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Número
          <input inputMode="numeric" value={f.numero_documento} onChange={(e) => setF({ ...f, numero_documento: e.target.value })} className={input} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>
          Teléfono
          <input type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className={input} />
        </label>
        <label className={etiqueta}>
          Correo
          <input type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} className={input} />
        </label>
        <label className={etiqueta}>
          Ciudad
          <input value={f.ciudad} onChange={(e) => setF({ ...f, ciudad: e.target.value })} className={input} />
        </label>
      </div>
      <label className={etiqueta}>
        Plan de comisión
        <select value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })} className={`${input} px-2`}>
          <option value="">Sin plan todavía</option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      {plan && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {pct(plan.porcentaje)} {ETIQUETA_BASE[plan.base]}
          {plan.porcentaje_recurrente ? ` · ${pct(plan.porcentaje_recurrente)} del canon recurrente por ${plan.meses_recurrencia ?? "?"} meses` : ""} · se causa con el {plan.causa} · cada registro dura {plan.dias_vigencia_registro} días
        </p>
      )}
      {r && (
        <label className={etiqueta}>
          Estado
          <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as Referido["estado"] })} className={`${input} px-2`}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
            <option value="suspendido">Suspendido</option>
          </select>
        </label>
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={f.acuerdo_firmado} onChange={(e) => setF({ ...f, acuerdo_firmado: e.target.checked })} className="h-5 w-5" />
        Firmó el acuerdo de referido (porcentaje, vigencia y que se paga con el recaudo)
      </label>
      <label className={etiqueta}>
        Notas
        <textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
      </label>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={cerrar} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
          Cancelar
        </button>
        <button type="button" disabled={pendiente || !f.nombre.trim() || !f.numero_documento.trim()} onClick={guardar} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </section>
  );
}

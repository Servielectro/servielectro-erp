"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ETIQUETA_CANAL } from "@/lib/marketing";

export interface Cuenta {
  id: string;
  canal: string;
  nombre: string;
  handle: string | null;
  url: string | null;
  estado: "manual" | "en_tramite" | "conectada" | "suspendida";
  notas: string | null;
  activa: boolean;
}

const ESTADOS: { key: Cuenta["estado"]; label: string; clase: string }[] = [
  { key: "manual", label: "Se publica a mano", clase: "bg-slate-100 text-slate-800" },
  { key: "en_tramite", label: "Conexión en trámite", clase: "bg-amber-100 text-amber-900" },
  { key: "conectada", label: "Conectada: publica el ERP", clase: "bg-green-100 text-green-900" },
  { key: "suspendida", label: "Suspendida", clase: "bg-red-100 text-red-900" },
];
const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal";

export function Cuentas({ escribe, cuentas }: { escribe: boolean; cuentas: Cuenta[] }) {
  return (
    <ul className="space-y-2">
      {cuentas.map((c) => (
        <FilaCuenta key={c.id} c={c} escribe={escribe} />
      ))}
    </ul>
  );
}

function FilaCuenta({ c, escribe }: { c: Cuenta; escribe: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ handle: c.handle ?? "", url: c.url ?? "", estado: c.estado, notas: c.notas ?? "", activa: c.activa });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const e = ESTADOS.find((x) => x.key === c.estado);
  const guardar = () =>
    empezar(async () => {
      setError(null);
      const { data, error: err } = await createClient()
        .from("marketing_cuentas")
        .update({ handle: f.handle.trim() || null, url: f.url.trim() || null, estado: f.estado, notas: f.notas.trim() || null, activa: f.activa })
        .eq("id", c.id)
        .select("id");
      if (err) return setError(err.message);
      if (!data?.length) return setError("No se guardó (sin permiso).");
      setEditando(false);
      router.refresh();
    });
  return (
    <li className={`rounded-lg border border-slate-300 bg-white p-3 ${c.activa ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {ETIQUETA_CANAL[c.canal] ?? c.canal} · {c.nombre}
            {!c.activa && " (inactiva)"}
          </p>
          <p className="text-xs text-slate-600">
            {c.handle ?? "Sin usuario registrado"}
            {c.url && (
              <>
                {" · "}
                <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                  abrir
                </a>
              </>
            )}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${e?.clase}`}>{e?.label}</span>
      </div>
      {c.notas && <p className="mt-1 text-xs text-slate-700">{c.notas}</p>}
      {escribe && !editando && (
        <button type="button" onClick={() => setEditando(true)} className="mt-2 min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
          Editar
        </button>
      )}
      {editando && (
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-800">
              Usuario
              <input value={f.handle} onChange={(ev) => setF({ ...f, handle: ev.target.value })} placeholder="@servielectro" className={input} />
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Enlace
              <input value={f.url} onChange={(ev) => setF({ ...f, url: ev.target.value })} placeholder="https://…" className={input} />
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-800">
            Estado
            <select value={f.estado} onChange={(ev) => setF({ ...f, estado: ev.target.value as Cuenta["estado"] })} className={`${input} px-2`}>
              {ESTADOS.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Notas
            <textarea rows={3} value={f.notas} onChange={(ev) => setF({ ...f, notas: ev.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={f.activa} onChange={(ev) => setF({ ...f, activa: ev.target.checked })} className="h-5 w-5" />
            Activa (sale para registrar publicaciones)
          </label>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(false)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
              Cancelar
            </button>
            <button type="button" disabled={pendiente} onClick={guardar} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
              Guardar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

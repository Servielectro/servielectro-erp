"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const CAMPO = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base";

export function TransferirTareas({ usuarios }: { usuarios: { id: string; nombre: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [de, setDe] = useState("");
  const [a, setA] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const nombre = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? "—";

  async function transferir() {
    setError(null);
    setResultado(null);
    if (!de || !a) return setError("Elige de quién y a quién.");
    if (de === a) return setError("Elige dos personas distintas.");
    if (!motivo.trim()) return setError("Escribe el motivo: queda en el historial de cada tarea.");
    if (
      !window.confirm(
        `Las tareas pendientes de ${nombre(de)} pasan a ser de ${nombre(a)}. Las hechas y las archivadas no se mueven. Queda escrito en el historial de cada tarea quién la movió y por qué.\n\n¿Transferir?`,
      )
    )
      return;
    setOcupado(true);
    try {
      const { data, error: err } = await supabase.rpc("fn_transferir_tareas", { p_de: de, p_a: a, p_motivo: motivo.trim() });
      if (err) return setError(/failed to fetch|network/i.test(err.message) ? "No hay conexión: no se transfirió nada." : err.message);
      const n = Number(data ?? 0);
      setResultado(
        n === 0
          ? `${nombre(de)} no tenía tareas pendientes: no se movió nada.`
          : `Se ${n === 1 ? "transfirió 1 tarea pendiente" : `transfirieron ${n} tareas pendientes`} de ${nombre(de)} a ${nombre(a)}. Quedó en el historial de cada una.`,
      );
      setMotivo("");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">
        Para cuando alguien se va y las tareas pendientes que creó (de Planificación y de obra) quedan en una cuenta que nadie
        abre. Las tareas cambian de dueño: quien las recibe las ve porque pasan a ser suyas. Los eventos de la agenda no se
        transfieren.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-base text-red-800">{error}</p>}
      {resultado && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-base text-green-900">{resultado}</p>}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">De (quien se va)</span>
        <select value={de} onChange={(e) => setDe(e.target.value)} className={CAMPO}>
          <option value="">Elegir…</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">A (quien las recibe)</span>
        <select value={a} onChange={(e) => setA(e.target.value)} className={CAMPO}>
          <option value="">Elegir…</option>
          {usuarios
            .filter((u) => u.id !== de)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Motivo *</span>
        <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se retiró de la empresa el 30/10" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
      </label>
      <button
        type="button"
        onClick={transferir}
        disabled={ocupado}
        className="min-h-12 w-full rounded-lg bg-slate-900 px-6 text-base font-semibold text-white disabled:opacity-40"
      >
        {ocupado ? "Transfiriendo…" : "Transferir tareas pendientes"}
      </button>
    </div>
  );
}

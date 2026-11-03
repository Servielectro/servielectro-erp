"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FormularioSst } from "@/components/sst/FormularioSst";
import { faltantes, type Campo } from "@/lib/sst/plantillas";
import { hoyBogota } from "@/lib/tecnico/captura";

const CAMPO = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base";

export function NuevaCapacitacion({ plantillaId, campos }: { plantillaId: string; campos: Campo[] }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(hoyBogota());
  const [lugar, setLugar] = useState("");
  const [respuestas, setRespuestas] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setError(null);
    // La base exige el encabezado completo antes de la primera firma: se pide desde ya.
    const falta = faltantes(campos, respuestas, {});
    if (!lugar.trim()) falta.unshift("Lugar");
    if (falta.length) return setError(`Falta: ${falta.join(", ")}.`);
    setGuardando(true);
    const id = crypto.randomUUID();
    const { error } = await createClient()
      .from("sst_formatos")
      .insert({ id, plantilla_id: plantillaId, fecha, lugar: lugar.trim(), respuestas });
    setGuardando(false);
    if (error) return setError(error.message);
    router.push(`/sgsst/capacitaciones/${id}`);
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-900">
        Fecha
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Lugar <span className="text-red-700">*</span>
        <input value={lugar} onChange={(e) => setLugar(e.target.value)} className={CAMPO} />
      </label>
      <FormularioSst campos={campos} respuestas={respuestas} onCambio={(id, v) => setRespuestas((r) => ({ ...r, [id]: v }))} />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button type="button" onClick={crear} disabled={guardando} className="min-h-14 w-full rounded-xl bg-slate-900 px-4 text-lg font-semibold text-white disabled:bg-slate-400">
        {guardando ? "Creando…" : "Crear y pasar a firmas"}
      </button>
    </div>
  );
}

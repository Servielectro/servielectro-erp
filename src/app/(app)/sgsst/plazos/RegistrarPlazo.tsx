"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RegistrarPlazo({ clave }: { clave: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [dias, setDias] = useState("");
  const [tipo, setTipo] = useState<"habiles" | "calendario" | "">("");
  const [desde, setDesde] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-1 min-h-11 text-sm font-semibold underline">
        Registrar valor
      </button>
    );
  const n = Number(dias);
  const falta = !(n > 0 && Number.isInteger(n)) ? "Escribe el número de días." : !tipo ? "Elige si son días hábiles o calendario." : !desde ? "Pon desde cuándo rige." : !nota.trim() ? "Escribe la fuente (resolución, decreto…)." : null;
  return (
    <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-2">
      <div className="flex gap-2">
        <input value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Días" className="w-24 rounded-md border border-slate-300 px-2 py-2 text-base" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="flex-1 rounded-md border border-slate-300 px-2 text-base">
          <option value="">¿Hábiles o calendario?</option>
          <option value="habiles">Días hábiles</option>
          <option value="calendario">Días calendario</option>
        </select>
      </div>
      <label className="block text-xs">
        Vigente desde
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-base" />
      </label>
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Fuente: resolución, decreto, ARL…" className="block w-full rounded-md border border-slate-300 px-2 py-2 text-base" />
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente || !!falta}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const { error: e } = await createClient().from("sst_parametro_valores").insert({ clave, dias: n, tipo_dias: tipo, vigente_desde: desde, nota: nota.trim() });
              if (e) return setError(e.message);
              setAbierto(false);
              router.refresh();
            })
          }
          className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          Registrar
        </button>
      </div>
      <p className="text-xs text-slate-500">{falta ?? "Una vez registrado no se cambia: si queda mal, se registra otro con su fecha."}</p>
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

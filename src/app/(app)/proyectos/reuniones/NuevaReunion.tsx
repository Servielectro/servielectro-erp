"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base";

/** Crea la reunión (con su obra) y lleva al aviso de grabación. */
export function NuevaReunion({ obras, obraInicial }: { obras: { id: string; nombre: string }[]; obraInicial: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [obra, setObra] = useState(obraInicial ?? "");
  const [titulo, setTitulo] = useState("");
  const [lugar, setLugar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-12 w-full rounded-lg bg-slate-900 text-base font-semibold text-white">
        🎙 Nueva reunión
      </button>
    );
  const falta = !obra ? "Elige la obra." : !titulo.trim() ? "Escribe de qué es la reunión (ej. Comité de obra semanal)." : null;
  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <label className="block text-sm font-medium">
        Obra
        <select value={obra} onChange={(e) => setObra(e.target.value)} className={CAMPO}>
          <option value="">— Elige la obra —</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Reunión
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Comité de obra semanal" className={CAMPO} />
      </label>
      <label className="block text-sm font-medium">
        Lugar
        <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej.: Oficina de la administración" className={CAMPO} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente || !!falta}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const id = crypto.randomUUID();
              const { error: e } = await createClient().from("reuniones").insert({ id, proyecto_id: obra, titulo: titulo.trim(), lugar: lugar.trim() || null });
              if (e) return setError(e.message);
              router.push(`/proyectos/reuniones/${id}`);
            })
          }
          className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          Crear y pasar al aviso
        </button>
      </div>
      {falta && <p className="text-xs text-slate-500">{falta}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

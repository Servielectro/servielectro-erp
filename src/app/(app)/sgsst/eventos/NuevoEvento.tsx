"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base";

/** Registrar un accidente o incidente. A quién le pasó sale de la misma tabla de empleados de RRHH. */
export function NuevoEvento({ personal }: { personal: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"accidente" | "incidente">("accidente");
  const [cuando, setCuando] = useState("");
  const [lugar, setLugar] = useState("");
  const [empleado, setEmpleado] = useState("");
  const [tercero, setTercero] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [acciones, setAcciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-md bg-[#A82323] px-4 text-sm font-semibold text-white">
        + Registrar accidente o incidente
      </button>
    );
  const falta = !cuando
    ? "Indica cuándo pasó."
    : !descripcion.trim()
      ? "Describe qué pasó."
      : tipo === "accidente" && !empleado && !tercero.trim()
        ? "Indica a quién le pasó (empleado o, si es un tercero, su nombre)."
        : null;
  return (
    <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        {(["accidente", "incidente"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={`min-h-11 rounded-md border-2 text-sm font-semibold ${tipo === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
            {t === "accidente" ? "Accidente" : "Incidente (casi accidente)"}
          </button>
        ))}
      </div>
      <label className="block text-sm font-medium">
        ¿Cuándo pasó?
        <input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} className={CAMPO} />
      </label>
      <label className="block text-sm font-medium">
        ¿Dónde?
        <input value={lugar} onChange={(e) => setLugar(e.target.value)} className={CAMPO} />
      </label>
      <label className="block text-sm font-medium">
        ¿A quién le pasó? (empleado)
        <select value={empleado} onChange={(e) => setEmpleado(e.target.value)} className={CAMPO}>
          <option value="">— No es empleado / nadie —</option>
          {personal.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      {!empleado && (
        <label className="block text-sm font-medium">
          Si es un tercero (contratista, visitante): su nombre
          <input value={tercero} onChange={(e) => setTercero(e.target.value)} className={CAMPO} />
        </label>
      )}
      <label className="block text-sm font-medium">
        ¿Qué pasó? <span className="font-normal text-slate-500">(los hechos; sin diagnósticos médicos)</span>
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className={CAMPO} />
      </label>
      <label className="block text-sm font-medium">
        Qué se hizo de inmediato (opcional)
        <textarea value={acciones} onChange={(e) => setAcciones(e.target.value)} rows={2} className={CAMPO} />
      </label>
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
              const { data, error: e } = await createClient()
                .from("sst_eventos")
                .insert({
                  tipo,
                  ocurrido_en: new Date(cuando).toISOString(),
                  lugar: lugar.trim() || null,
                  empleado_id: empleado || null,
                  afectado_nombre: empleado ? null : tercero.trim() || null,
                  descripcion: descripcion.trim(),
                  acciones_inmediatas: acciones.trim() || null,
                })
                .select("id")
                .single();
              if (e) return setError(e.message);
              router.push(`/sgsst/eventos/${data.id}`);
            })
          }
          className="min-h-11 flex-1 rounded-md bg-[#A82323] text-sm font-semibold text-white disabled:opacity-40"
        >
          Registrar
        </button>
      </div>
      {falta && <p className="text-xs text-slate-500">{falta}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </section>
  );
}

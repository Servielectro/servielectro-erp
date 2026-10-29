"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";

/** Registrar a un trabajador de un contratista (migración 107). El contratista lo crea Administrativo. */
export function NuevoTrabajador({ contratistas }: { contratistas: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ contratista_id: "", nombre: "", tipo_documento: "CC", numero_documento: "", cargo: "", telefono: "", rh: "", contacto_emergencia: "", telefono_emergencia: "" });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 w-full rounded-md border border-slate-900 px-3 text-sm font-semibold sm:w-auto">
        + Registrar trabajador de un contratista
      </button>
    );
  }
  const falta = !d.contratista_id ? "Elige el contratista." : !d.nombre.trim() ? "Escribe el nombre." : !d.numero_documento.trim() ? "Escribe el número de documento." : null;
  const campo = (k: keyof typeof d, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm">
      {etiqueta}
      <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} className={CAMPO} {...extra} />
    </label>
  );
  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <p className="text-sm font-semibold">Trabajador de un contratista</p>
      {contratistas.length === 0 ? (
        <p className="text-sm text-slate-600">No hay contratistas activos. Los crea Administrativo en Contratistas.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            Contratista
            <select value={d.contratista_id} onChange={(e) => setD({ ...d, contratista_id: e.target.value })} className={CAMPO}>
              <option value="">Elige…</option>
              {contratistas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          {campo("nombre", "Nombres y apellidos")}
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <label className="block text-sm">
              Tipo
              <select value={d.tipo_documento} onChange={(e) => setD({ ...d, tipo_documento: e.target.value })} className={CAMPO}>
                {["CC", "CE", "PA", "PPT", "TI"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {campo("numero_documento", "Número", { inputMode: "numeric" })}
          </div>
          {campo("cargo", "Cargo")}
          {campo("telefono", "Teléfono", { inputMode: "tel" })}
          {campo("rh", "RH")}
          {campo("contacto_emergencia", "Contacto de emergencia")}
          {campo("telefono_emergencia", "Teléfono de emergencia", { inputMode: "tel" })}
        </div>
      )}
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
              const limpio = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim() || null]));
              const { data, error: e } = await createClient().from("contratista_trabajadores").insert(limpio).select("id").single();
              if (e) return setError(e.message.includes("duplicate") ? "Ese documento ya está registrado con ese contratista." : e.message);
              router.push(`/sgsst/personal/c-${data.id}`);
            })
          }
          className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          Registrar
        </button>
      </div>
      {falta && <p className="text-xs text-slate-500">{falta}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

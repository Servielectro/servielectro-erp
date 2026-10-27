"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AMBITO, firmasPorDefecto, type Ambito } from "@/lib/sst/plantillas";

export function NuevaPlantilla({ ambito = "sgsst" }: { ambito?: Ambito }) {
  const acta = ambito === "proyectos";
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white">
        + Nueva plantilla
      </button>
    );
  const falta = !codigo.trim() ? (acta ? "Escribe el código del documento (ej. PRY-ACT-01)." : "Escribe el código del documento (ej. SST-F-001).") : !nombre.trim() ? (acta ? "Escribe el nombre del acta." : "Escribe el nombre del formato.") : null;
  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <label className="block text-sm font-medium">
        Código del documento
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder={acta ? "Como aparece en el acta de la empresa" : "Como aparece en el formato de la SST"} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
      </label>
      <label className="block text-sm font-medium">
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={acta ? "Ej.: Acta de inicio de obra" : "Ej.: Análisis de trabajo seguro (ATS)"} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
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
              const { data, error: e } = await createClient()
                .from("sst_plantillas")
                .insert({ ambito, codigo: codigo.trim(), nombre: nombre.trim(), firmas: firmasPorDefecto(ambito) })
                .select("id")
                .single();
              if (e) return setError(/codigo_version/.test(e.message) ? "Ya hay una plantilla con ese código." : e.message);
              router.push(`${AMBITO[ambito].plantillas}/${data.id}`);
            })
          }
          className="min-h-11 flex-1 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          Crear y armar
        </button>
      </div>
      {falta && <p className="text-xs text-slate-500">{falta}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

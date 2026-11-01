"use client";

import { useState } from "react";
import type { Plan } from "@/lib/referidos";
import { FormReferido, type Referido } from "../FormReferido";

export function EditarReferido({ r, planes }: { r: Referido; planes: Plan[] }) {
  const [editando, setEditando] = useState(false);
  if (!editando)
    return (
      <button type="button" onClick={() => setEditando(true)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
        Editar datos y plan
      </button>
    );
  return <FormReferido r={r} planes={planes} onCerrar={() => setEditando(false)} />;
}

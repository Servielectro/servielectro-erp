"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VIA_LABEL, type TipoPipeline, type ViaAprobacion } from "@/lib/crm";
import { crearOportunidad } from "../actions";

// Cuatro campos y nada más: si crear un negocio cuesta, no se registra. Todo lo demás
// (cotización, fecha de decisión, expensa) se completa después, cuando se sabe.
export function NuevaOportunidadForm({
  tipo,
  clientes,
}: {
  tipo: TipoPipeline;
  clientes: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
  const [valor, setValor] = useState("");
  const [via, setVia] = useState<ViaAprobacion | "">("");

  const clienteElegido = clientes.find(
    (c) => c.nombre.toLowerCase() === cliente.trim().toLowerCase(),
  );

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const valorNum = valor.trim() ? Number(valor.replace(/[.\s$]/g, "")) : null;
        if (valorNum !== null && (Number.isNaN(valorNum) || valorNum < 0)) {
          setError("El valor estimado tiene que ser un número");
          return;
        }
        startTransition(async () => {
          const res = await crearOportunidad({
            tipoPipeline: tipo,
            nombre,
            clienteId: clienteElegido?.id ?? null,
            clienteNombre: cliente,
            valorEstimado: valorNum,
            viaAprobacion: via || null,
          });
          if (!res.ok) setError(res.error);
          else router.push(`/comercial/crm/${res.id}`);
        });
      }}
    >
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Campo label="¿Qué se va a hacer? *">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. CCTV perimetral torres 1 a 4"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          autoFocus
        />
      </Campo>

      <Campo label="Cliente *">
        <input
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          list="clientes-crm"
          placeholder="Escribe para buscar o crear uno nuevo"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <datalist id="clientes-crm">
          {clientes.map((c) => (
            <option key={c.id} value={c.nombre} />
          ))}
        </datalist>
        {cliente.trim() && !clienteElegido && (
          <p className="mt-1 text-xs text-slate-500">Cliente nuevo: se crea al guardar.</p>
        )}
      </Campo>

      <Campo label="Valor estimado (opcional)">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="numeric"
          placeholder="Ej. 40000000"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </Campo>

      <Campo label="¿Quién aprueba? (opcional)">
        <select
          value={via}
          onChange={(e) => setVia(e.target.value as ViaAprobacion | "")}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todavía no se sabe</option>
          {(Object.keys(VIA_LABEL) as ViaAprobacion[]).map((v) => (
            <option key={v} value={v}>
              {VIA_LABEL[v]}
            </option>
          ))}
        </select>
      </Campo>

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-md bg-brand-red px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Crear negocio"}
      </button>
    </form>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

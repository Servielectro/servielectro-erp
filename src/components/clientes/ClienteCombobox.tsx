"use client";

import { useMemo, useState } from "react";
import type { ClienteResumen } from "@/lib/supabase/clientes";

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const MAX_RESULTADOS = 30;

/**
 * Buscador de clientes estilo Siigo (calcado del buscador de ítems): se escribe y busca
 * por nombre o NIT entre los existentes; si no está, "+ Nuevo cliente" abre la ventana
 * de creación. Lo usan el armador de cotizaciones y "Nuevo negocio" del CRM.
 */
export function ClienteCombobox({
  clientes,
  seleccionado,
  onSeleccionar,
  onCrearNuevo,
  label = "Cliente *",
}: {
  clientes: ClienteResumen[];
  seleccionado: { id: string | null; nombre: string } | null;
  onSeleccionar: (cliente: ClienteResumen) => void;
  onCrearNuevo: (busqueda: string) => void;
  label?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");

  const resultados = useMemo(() => {
    const q = normalizar(query.trim());
    const qDigitos = query.replace(/\D/g, "");
    const coinciden = q
      ? clientes.filter(
          (c) =>
            normalizar(c.nombre).includes(q) ||
            (qDigitos.length >= 3 && (c.nit ?? "").replace(/\D/g, "").includes(qDigitos)),
        )
      : clientes;
    return { lista: coinciden.slice(0, MAX_RESULTADOS), total: coinciden.length };
  }, [clientes, query]);

  const sinRegistrar = seleccionado && !seleccionado.id && seleccionado.nombre.trim();

  return (
    <div className="relative">
      <label className="text-xs text-slate-600">{label}</label>
      <input
        type="text"
        value={abierto ? query : (seleccionado?.nombre ?? "")}
        placeholder="Buscar cliente por nombre o NIT…"
        onFocus={() => {
          setAbierto(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {!abierto && sinRegistrar && (
        <p className="mt-1 text-xs text-amber-700">
          Este cliente no está en la lista: búscalo o créalo con «+ Nuevo cliente».
        </p>
      )}

      {abierto && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onCrearNuevo(query.trim());
              setAbierto(false);
            }}
            className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-3 text-left text-base font-medium text-blue-700 active:bg-blue-50"
          >
            + Nuevo cliente{query.trim() ? `: "${query.trim()}"` : ""}
          </button>

          {resultados.lista.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-600">Ningún cliente coincide.</p>
          )}

          {resultados.lista.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSeleccionar(c);
                setAbierto(false);
              }}
              className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-3 text-left active:bg-slate-100"
            >
              <span className="text-base text-slate-900">{c.nombre}</span>
              <span className="text-xs text-slate-600">
                {c.nit ? `NIT ${c.nit}` : "Sin NIT"}
                {c.contacto ? ` · ${c.contacto}` : ""}
              </span>
            </button>
          ))}

          {resultados.total > resultados.lista.length && (
            <p className="px-3 py-2 text-xs text-slate-600">Sigue escribiendo para afinar la búsqueda…</p>
          )}
        </div>
      )}
    </div>
  );
}

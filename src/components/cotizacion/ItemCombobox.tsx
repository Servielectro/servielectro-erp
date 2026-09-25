"use client";

import { useMemo, useRef, useState } from "react";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import type { Categoria } from "@/lib/pricing";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const MAX_RESULTADOS = 40;

interface Props {
  catalogo: CatalogoItem[];
  categoria: Categoria;
  descripcionActual: string;
  onSeleccionar: (item: CatalogoItem) => void;
  onCrearNuevo: (busquedaInicial: string) => void;
}

export function ItemCombobox({
  catalogo,
  categoria,
  descripcionActual,
  onSeleccionar,
  onCrearNuevo,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const itemsCategoria = useMemo(
    () => catalogo.filter((i) => i.categoria === categoria),
    [catalogo, categoria],
  );

  const resultados = useMemo(() => {
    const q = normalizar(query.trim());
    const base = q
      ? itemsCategoria.filter(
          (i) =>
            normalizar(i.nombreCorto).includes(q) ||
            normalizar(i.codigo).includes(q) ||
            (i.referencia && normalizar(i.referencia).includes(q)),
        )
      : itemsCategoria;
    return base.slice(0, MAX_RESULTADOS);
  }, [itemsCategoria, query]);

  const hayMas = itemsCategoria.length > resultados.length;

  return (
    <div className="relative">
      <label className="text-xs text-slate-600">Buscar ítem</label>
      <input
        ref={inputRef}
        type="text"
        value={abierto ? query : descripcionActual}
        placeholder="Nombre o código…"
        onFocus={() => {
          setAbierto(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => {
          // pequeño delay para permitir el click en la lista antes de cerrar
          setTimeout(() => setAbierto(false), 150);
        }}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-3 text-base"
      />

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
            + Nuevo ítem{query.trim() ? `: "${query.trim()}"` : ""}
          </button>

          {resultados.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-600">
              Sin resultados en {categoria.replace("_", " ")}.
            </p>
          )}

          {resultados.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSeleccionar(item);
                setAbierto(false);
              }}
              className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-3 text-left active:bg-slate-100"
            >
              <span className="text-base text-slate-900">
                {item.nombreCorto}
              </span>
              <span className="text-xs text-slate-600">
                {item.codigo} · {item.unidad}
                {item.valorCompraIva === null && " · sin precio"}
              </span>
            </button>
          ))}

          {hayMas && (
            <p className="px-3 py-2 text-xs text-slate-600">
              Sigue escribiendo para afinar la búsqueda…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

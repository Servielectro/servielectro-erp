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
const LARGO_DESCRIPCION = 100;

/**
 * Comienzo de la descripción larga para el tercer renglón de cada resultado: es lo que
 * distingue ítems de nombre corto casi igual ("NVR 32CH HIK IA" / "NVR 32ch Dahua"),
 * porque trae marca, modelo y características. Null si no hay o si repite el nombre corto.
 */
function inicioDescripcion(item: CatalogoItem): string | null {
  const desc = (item.descripcion ?? "").replace(/\s+/g, " ").trim();
  if (!desc) return null;
  const comparable = (t: string) => normalizar(t).replace(/\s+/g, " ").trim();
  if (comparable(desc) === comparable(item.nombreCorto)) return null;
  return desc.length > LARGO_DESCRIPCION
    ? `${desc.slice(0, LARGO_DESCRIPCION).trimEnd()}…`
    : desc;
}

const CATEGORIA_CORTA: Record<Categoria, string> = {
  EQUIPO: "Equipo",
  MATERIAL: "Material",
  MANO_DE_OBRA: "Mano de obra",
};

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

  // Listado único (como el Excel de Jhojan): se busca en TODO el catálogo. La categoría
  // del catálogo es solo una sugerencia; el ítem queda en la sección de esta línea, y la
  // línea se puede mover de sección después. Los de la sección actual salen primero.
  const resultados = useMemo(() => {
    const q = normalizar(query.trim());
    // Primero los que coinciden por nombre, código o referencia; después los que solo
    // coinciden por la descripción larga (marca, modelo), que se ve en el tercer renglón.
    const porNombre = (i: CatalogoItem) =>
      normalizar(i.nombreCorto).includes(q) ||
      normalizar(i.codigo).includes(q) ||
      Boolean(i.referencia && normalizar(i.referencia).includes(q));
    const coinciden = q
      ? [
          ...catalogo.filter(porNombre),
          ...catalogo.filter(
            (i) => !porNombre(i) && normalizar(i.descripcion ?? "").includes(q),
          ),
        ]
      : catalogo;
    const ordenados = [
      ...coinciden.filter((i) => i.categoria === categoria),
      ...coinciden.filter((i) => i.categoria !== categoria),
    ];
    return { lista: ordenados.slice(0, MAX_RESULTADOS), total: ordenados.length };
  }, [catalogo, categoria, query]);

  const hayMas = resultados.total > resultados.lista.length;

  return (
    <div className="relative">
      <label className="text-xs text-slate-600">Buscar ítem</label>
      <input
        ref={inputRef}
        type="text"
        value={abierto ? query : descripcionActual}
        placeholder="Nombre, código o marca…"
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

          {resultados.lista.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-600">
              Sin resultados en el catálogo.
            </p>
          )}

          {resultados.lista.map((item) => {
            const descripcion = inicioDescripcion(item);
            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSeleccionar(item);
                  setAbierto(false);
                }}
                className="flex w-full min-w-0 flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-3 text-left active:bg-slate-100"
              >
                <span className="text-base text-slate-900">
                  {item.nombreCorto}
                </span>
                <span className="text-xs text-slate-600">
                  {item.codigo} · {item.unidad}
                  {item.categoria !== categoria && ` · catálogo: ${CATEGORIA_CORTA[item.categoria]}`}
                  {item.valorCompraIva === null && " · sin precio"}
                </span>
                {descripcion && (
                  <span className="block w-full truncate text-xs text-slate-400">
                    {descripcion}
                  </span>
                )}
              </button>
            );
          })}

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

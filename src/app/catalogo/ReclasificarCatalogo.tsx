"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import { formatCOP, type Categoria } from "@/lib/pricing";
import { actualizarCategoriaEnLote } from "./actions";

const CATEGORIAS: { key: Categoria | "TODAS"; label: string }[] = [
  { key: "TODAS", label: "Todas" },
  { key: "EQUIPO", label: "Equipos" },
  { key: "MATERIAL", label: "Materiales" },
  { key: "MANO_DE_OBRA", label: "Mano de obra" },
];

const MAX_VISIBLE = 200;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ReclasificarCatalogo({
  catalogoInicial,
}: {
  catalogoInicial: CatalogoItem[];
}) {
  const [catalogo, setCatalogo] = useState(catalogoInicial);
  const [filtroCategoria, setFiltroCategoria] = useState<Categoria | "TODAS">(
    "TODAS",
  );
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>("EQUIPO");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const conteos = useMemo(() => {
    const c: Record<Categoria, number> = { EQUIPO: 0, MATERIAL: 0, MANO_DE_OBRA: 0 };
    for (const item of catalogo) c[item.categoria]++;
    return c;
  }, [catalogo]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return catalogo.filter((item) => {
      if (filtroCategoria !== "TODAS" && item.categoria !== filtroCategoria)
        return false;
      if (!q) return true;
      return (
        normalizar(item.nombreCorto).includes(q) ||
        normalizar(item.codigo).includes(q) ||
        (item.referencia && normalizar(item.referencia).includes(q))
      );
    });
  }, [catalogo, filtroCategoria, busqueda]);

  const visibles = filtrados.slice(0, MAX_VISIBLE);
  const todosFiltradosSeleccionados =
    filtrados.length > 0 && filtrados.every((i) => seleccionados.has(i.id));

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarSeleccionarTodosFiltrados() {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (todosFiltradosSeleccionados) {
        for (const item of filtrados) next.delete(item.id);
      } else {
        for (const item of filtrados) next.add(item.id);
      }
      return next;
    });
  }

  async function aplicarCategoria() {
    setGuardando(true);
    setMensaje(null);
    const ids = Array.from(seleccionados);
    const res = await actualizarCategoriaEnLote(ids, categoriaDestino);
    setGuardando(false);

    if (!res.ok) {
      setMensaje(`Error: ${res.error}`);
      return;
    }

    setCatalogo((prev) =>
      prev.map((item) =>
        seleccionados.has(item.id) ? { ...item, categoria: categoriaDestino } : item,
      ),
    );
    setMensaje(
      `${res.actualizados} ítem(s) movidos a ${categoriaDestino.replace("_", " ")}.`,
    );
    setSeleccionados(new Set());
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-28">
      <header className="sticky top-0 z-10 space-y-3 border-b border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-slate-500">
            ← Inicio
          </Link>
          <h1 className="text-base font-semibold text-slate-900">
            Catálogo ({catalogo.length})
          </h1>
        </div>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código o referencia…"
          className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base"
        />

        <div className="flex gap-2 overflow-x-auto">
          {CATEGORIAS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFiltroCategoria(c.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                filtroCategoria === c.key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {c.label}
              {c.key !== "TODAS" && ` (${conteos[c.key]})`}
            </button>
          ))}
        </div>

        {filtroCategoria === "TODAS" && conteos.EQUIPO === 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No hay ningún ítem en Equipos todavía — la carga inicial clasificó
            todo lo que no era claramente mano de obra como Material. Filtrá
            Materiales, buscá cámaras/NVR/switches/UPS/etc. y movelos acá.
          </p>
        )}
      </header>

      <main className="flex-1 p-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={todosFiltradosSeleccionados}
              onChange={alternarSeleccionarTodosFiltrados}
            />
            Seleccionar los {filtrados.length} filtrados
          </label>
          {filtrados.length > MAX_VISIBLE && (
            <span className="text-xs text-slate-400">
              Mostrando {MAX_VISIBLE} de {filtrados.length} — seguí filtrando
              para ver el resto
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          {visibles.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <input
                type="checkbox"
                checked={seleccionados.has(item.id)}
                onChange={() => alternarSeleccion(item.id)}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-900">
                  {item.nombreCorto}
                </p>
                <p className="text-xs text-slate-400">
                  {item.codigo} · {item.unidad} ·{" "}
                  {item.valorCompraIva !== null
                    ? formatCOP(item.valorCompraIva)
                    : "sin precio"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                {item.categoria.replace("_", " ")}
              </span>
            </label>
          ))}

          {filtrados.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">
              Sin resultados para ese filtro.
            </p>
          )}
        </div>
      </main>

      {seleccionados.size > 0 && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          {mensaje && (
            <p className="mb-2 text-sm text-slate-600">{mensaje}</p>
          )}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-slate-700">
              {seleccionados.size} seleccionados →
            </span>
            <select
              value={categoriaDestino}
              onChange={(e) => setCategoriaDestino(e.target.value as Categoria)}
              className="flex-1 rounded-md border border-slate-300 px-2 py-2.5 text-sm"
            >
              <option value="EQUIPO">Equipos</option>
              <option value="MATERIAL">Materiales</option>
              <option value="MANO_DE_OBRA">Mano de obra</option>
            </select>
            <button
              type="button"
              onClick={aplicarCategoria}
              disabled={guardando}
              className="shrink-0 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {guardando ? "Aplicando…" : "Aplicar"}
            </button>
          </div>
        </footer>
      )}

      {seleccionados.size === 0 && mensaje && (
        <p className="fixed inset-x-0 bottom-0 z-20 bg-green-50 px-4 py-3 text-center text-sm text-green-700">
          {mensaje}
        </p>
      )}
    </div>
  );
}

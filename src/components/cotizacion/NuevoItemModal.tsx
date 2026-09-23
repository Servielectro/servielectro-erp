"use client";

import { useState } from "react";
import { crearItemCatalogo } from "@/app/cotizaciones/actions";
import {
  FACTORES_RENTABILIDAD_DEFAULT,
  UNIDADES_SUGERIDAS,
  type Categoria,
} from "@/lib/pricing";
import type { CatalogoItem } from "@/lib/supabase/catalogo";

interface Props {
  categoria: Categoria;
  descripcionInicial: string;
  onCerrar: () => void;
  onCreado: (item: CatalogoItem) => void;
}

const hoyIso = () => new Date().toISOString().slice(0, 10);

export function NuevoItemModal({
  categoria,
  descripcionInicial,
  onCerrar,
  onCreado,
}: Props) {
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState(descripcionInicial);
  const [unidad, setUnidad] = useState("UNI");
  const [valorUnitario, setValorUnitario] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(hoyIso());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!descripcion.trim()) {
      setError("La descripción es obligatoria");
      return;
    }
    const valor = Number(valorUnitario.replace(/[^0-9.]/g, ""));
    if (!valor || valor <= 0) {
      setError("El valor unitario debe ser mayor a 0");
      return;
    }

    setGuardando(true);
    setError(null);

    const factorDefault = FACTORES_RENTABILIDAD_DEFAULT[categoria];
    const res = await crearItemCatalogo({
      codigo,
      descripcion: descripcion.trim(),
      unidad,
      categoria,
      proveedor,
      referencia,
      valorCompraIva: valor,
      factorRentabilidadLinea: factorDefault,
      fecha,
    });

    setGuardando(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    onCreado({
      id: res.item.id,
      codigo: res.item.codigo,
      descripcion: res.item.descripcion,
      unidad: res.item.unidad,
      categoria: res.item.categoria,
      proveedor: res.item.proveedor,
      referencia: res.item.referencia,
      factorRentabilidadLinea: res.item.factorRentabilidadLinea,
      valorCompraIva: valor,
      precioActualizadoEn: fecha,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/40 bg-white/70 p-6 shadow-2xl backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-slate-900">
          Nuevo ítem — {categoria.replace("_", " ")}
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Queda guardado en el catálogo y seleccionado en esta línea.
        </p>

        {error && (
          <p className="mb-3 rounded-md bg-red-50/90 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Descripción *
            </label>
            <input
              autoFocus
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Código (item)
              </label>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="autogenerado si se deja vacío"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Unidad
              </label>
              <select
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
              >
                {UNIDADES_SUGERIDAS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Valor unitario (compra) *
              </label>
              <input
                inputMode="numeric"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Fecha
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Proveedor
              </label>
              <input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Referencia
              </label>
              <input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="flex-1 rounded-md border border-slate-300 bg-white/70 px-4 py-3 text-base font-medium text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex-1 rounded-md bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar ítem"}
          </button>
        </div>
      </div>
    </div>
  );
}

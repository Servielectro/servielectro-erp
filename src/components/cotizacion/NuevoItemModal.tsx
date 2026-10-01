"use client";

import { useState } from "react";
import { crearItemCatalogo } from "@/app/(app)/comercial/cotizaciones/actions";
import { describirEquipoConIA } from "@/app/(app)/comercial/cotizaciones/ia-actions";
import {
  FACTORES_RENTABILIDAD_DEFAULT,
  UNIDADES_SUGERIDAS,
  type Categoria,
} from "@/lib/pricing";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import { EsperaIA } from "@/components/ia/EsperaIA";

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
  // Nombre corto (buscador y columna Ítem) y descripción para el cliente (columna
  // Descripción del documento) van separados: si son el mismo texto, en el documento se
  // ve repetido.
  const [nombreCorto, setNombreCorto] = useState(descripcionInicial);
  const [descripcion, setDescripcion] = useState("");
  const [unidad, setUnidad] = useState("UNI");
  const [valorUnitario, setValorUnitario] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(hoyIso());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Descripción automática — solo equipos. Ver src/lib/catalogo/describir-equipo.ts
  const esEquipo = categoria === "EQUIPO";
  const [buscandoIa, setBuscandoIa] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);
  const [fuentesIa, setFuentesIa] = useState<string[]>([]);

  async function buscarDescripcion() {
    if (!referencia.trim()) {
      setAvisoIa("Escribe la referencia del equipo para poder buscarla.");
      return;
    }
    setBuscandoIa(true);
    setAvisoIa(null);
    setFuentesIa([]);

    const res = await describirEquipoConIA({
      nombre: nombreCorto,
      referencia,
      categoria,
    });

    setBuscandoIa(false);

    if (!res.ok) {
      setAvisoIa(res.error);
      return;
    }

    setDescripcion(res.descripcion);
    setFuentesIa(res.fuentes);
    setAvisoIa("Léela antes de guardar. Puedes corregirla.");
  }

  async function guardar() {
    if (!nombreCorto.trim()) {
      setError("El nombre corto es obligatorio");
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
      nombreCorto: nombreCorto.trim(),
      // Sin descripción para el cliente, el documento usa el nombre corto.
      descripcion: descripcion.trim() || nombreCorto.trim(),
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
      nombreCorto: nombreCorto.trim(),
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
              Nombre corto *
            </label>
            <input
              autoFocus
              value={nombreCorto}
              onChange={(e) => setNombreCorto(e.target.value)}
              placeholder="Ej. Cámara domo 4MP IA"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
            />
            <p className="mt-1 text-xs text-slate-500">
              Para buscarlo y para la columna «Ítem» del documento.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label className="text-sm font-medium text-slate-700">
                Descripción para el cliente
              </label>
              {esEquipo && (
                <button
                  type="button"
                  onClick={buscarDescripcion}
                  disabled={buscandoIa || guardando}
                  className="text-sm font-medium text-[#A82323] underline underline-offset-2 disabled:opacity-50"
                >
                  {buscandoIa ? <EsperaIA texto="Buscando…" /> : "Buscar con IA"}
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={descripcion}
              placeholder="Lo que lee el cliente en la columna «Descripción». Si se deja vacía, se usa el nombre corto."
              onChange={(e) => setDescripcion(e.target.value)}
              className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
            />
            {esEquipo && !avisoIa && !buscandoIa && (
              <p className="mt-1 text-xs text-slate-500">
                Escribe la referencia abajo y toca «Buscar con IA» para traer las
                características del equipo.
              </p>
            )}
            {avisoIa && (
              <p className="mt-1 text-xs text-slate-600">{avisoIa}</p>
            )}
            {fuentesIa.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Fuentes:{" "}
                {fuentesIa.map((url, i) => (
                  <span key={url}>
                    {i > 0 && " · "}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {i + 1}
                    </a>
                  </span>
                ))}
              </p>
            )}
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

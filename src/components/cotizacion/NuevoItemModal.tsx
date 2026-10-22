"use client";

import { useRef, useState } from "react";
import { crearItemCatalogo } from "@/app/(app)/comercial/cotizaciones/actions";
import { describirEquipoConIA } from "@/app/(app)/comercial/cotizaciones/ia-actions";
import {
  FACTORES_RENTABILIDAD_DEFAULT,
  UNIDADES_SUGERIDAS,
  type Categoria,
} from "@/lib/pricing";
import type { CatalogoItem } from "@/lib/supabase/catalogo";
import { EsperaIA } from "@/components/ia/EsperaIA";
import { hoyColombia } from "@/lib/crm";

interface Props {
  categoria: Categoria;
  descripcionInicial: string;
  onCerrar: () => void;
  onCreado: (item: CatalogoItem) => void;
}

// Fecha de Bogotá: toISOString() da la de UTC, que de 7 p. m. a medianoche ya es mañana
// y deja el precio con vigencia futura (el ítem entra en $0).
const hoyIso = () => hoyColombia();

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
  // Ventana "Buscar con IA": pide la referencia en un solo campo. Jhojan escribía el
  // modelo en el nombre del ítem y el botón no hacía nada visible; ahora la ventana se
  // precarga con la Referencia o, si está vacía, con el nombre que escribió.
  const [ventanaIa, setVentanaIa] = useState(false);
  const [referenciaIa, setReferenciaIa] = useState("");
  const [errorIa, setErrorIa] = useState<string | null>(null);

  function abrirVentanaIa() {
    setReferenciaIa(referencia.trim() || nombreCorto.trim());
    setErrorIa(null);
    setVentanaIa(true);
  }

  // Cada búsqueda tiene su número: si se canceló, la respuesta que llegue tarde se ignora.
  const busqueda = useRef(0);

  async function buscarDescripcion() {
    const ref = referenciaIa.trim();
    if (!ref) {
      setErrorIa("Escribe la referencia o el modelo del equipo.");
      return;
    }
    setBuscandoIa(true);
    setErrorIa(null);

    const mia = ++busqueda.current;
    const res = await describirEquipoConIA({
      nombre: nombreCorto,
      referencia: ref,
      categoria,
    });
    if (mia !== busqueda.current) return; // se canceló: se escribe a mano

    setBuscandoIa(false);

    if (!res.ok) {
      // El error queda en la ventana, con la referencia escrita, para reintentar.
      setErrorIa(res.error);
      return;
    }

    setDescripcion(res.descripcion);
    setFuentesIa(res.fuentes);
    // La referencia buscada queda en el ítem (y en el catálogo al guardar).
    setReferencia(ref);
    setAvisoIa("Léela antes de guardar. Puedes corregirla.");
    setVentanaIa(false);
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
              {/* Siempre visible: un botón ausente no explica nada; apagado y con su
                  motivo, sí. */}
              <button
                type="button"
                onClick={abrirVentanaIa}
                disabled={!esEquipo || buscandoIa || guardando}
                className="shrink-0 text-sm font-medium text-[#A82323] underline underline-offset-2 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
              >
                Buscar con IA
              </button>
            </div>
            {!esEquipo && (
              <p className="mt-0.5 text-right text-xs text-slate-500">
                La búsqueda con IA solo aplica a equipos.
              </p>
            )}
            <textarea
              rows={3}
              value={descripcion}
              placeholder="Lo que lee el cliente en la columna «Descripción». Si se deja vacía, se usa el nombre corto."
              onChange={(e) => setDescripcion(e.target.value)}
              className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base"
            />
            {esEquipo && !avisoIa && (
              <p className="mt-1 text-xs text-slate-500">
                Toca «Buscar con IA», escribe la referencia o el modelo y trae las
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
      {ventanaIa && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!buscandoIa) buscarDescripcion();
            }}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-slate-900">Buscar equipo con IA</h3>
            <label htmlFor="referencia-ia" className="mt-3 block text-sm font-medium text-slate-700">
              Referencia o modelo del equipo
            </label>
            <input
              id="referencia-ia"
              autoFocus
              value={referenciaIa}
              onChange={(e) => setReferenciaIa(e.target.value)}
              onFocus={(e) => e.target.select()}
              disabled={buscandoIa}
              enterKeyHint="search"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base"
            />
            <p className="mt-1 text-xs text-slate-500">
              Ej.: DS-2CD2043G2-I · TC-C34GS · DHI-NVR5208-4KS2
            </p>

            {buscandoIa && (
              <p className="mt-3 text-sm text-slate-700">
                <EsperaIA
                  texto="Buscando la ficha del equipo…"
                  onCancelar={() => {
                    busqueda.current++;
                    setBuscandoIa(false);
                    setVentanaIa(false);
                    setAvisoIa("Búsqueda cancelada: escribe la descripción a mano.");
                  }}
                />
              </p>
            )}
            {errorIa && !buscandoIa && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorIa}</p>
            )}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setVentanaIa(false)}
                disabled={buscandoIa}
                className="flex-1 rounded-md border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={buscandoIa || !referenciaIa.trim()}
                className="flex-1 rounded-md bg-[#A82323] px-4 py-3 text-base font-medium text-white disabled:opacity-50"
              >
                {errorIa ? "Reintentar" : "Buscar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

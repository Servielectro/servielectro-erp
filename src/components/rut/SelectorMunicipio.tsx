"use client";

import { useEffect, useMemo, useState } from "react";
import { bonito, cargarMunicipios, normalizar, type Municipio } from "@/lib/rut/catalogos";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50 disabled:text-slate-700";

export interface ValorMunicipio {
  municipio: string;
  departamento: string;
  municipio_dane: string;
}

/**
 * Departamento → municipio, y el código DANE sale solo (DIVIPOLA, migración 79) y queda de solo
 * lectura. También se encuentra escribiendo el nombre del municipio. Para un caso raro se puede
 * escribir el código a mano, y avisa si no coincide con ninguno.
 */
export function SelectorMunicipio({ valor, onCambio, deshabilitado }: { valor: ValorMunicipio; onCambio: (v: ValorMunicipio) => void; deshabilitado?: boolean }) {
  const [lista, setLista] = useState<Municipio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [aMano, setAMano] = useState(false);

  useEffect(() => {
    cargarMunicipios().then(setLista, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const actual = useMemo(() => lista?.find((m) => m.codigo === valor.municipio_dane) ?? null, [lista, valor.municipio_dane]);
  const [deptoElegido, setDeptoElegido] = useState<string | null>(null);
  const depto = deptoElegido ?? actual?.departamento_codigo ?? "";
  const departamentos = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of lista ?? []) m.set(x.departamento_codigo, x.departamento);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [lista]);
  const delDepto = useMemo(() => (lista ?? []).filter((m) => m.departamento_codigo === depto), [lista, depto]);
  const encontrados = useMemo(() => {
    const q = normalizar(busqueda);
    if (q.length < 3 || !lista) return [];
    return lista.filter((m) => normalizar(m.municipio).includes(q)).slice(0, 8);
  }, [lista, busqueda]);

  const elegir = (m: Municipio) => {
    setDeptoElegido(m.departamento_codigo);
    setBusqueda("");
    onCambio({ municipio: bonito(m.municipio), departamento: bonito(m.departamento), municipio_dane: m.codigo });
  };

  if (error) return <p className="text-sm text-red-800">No se pudo cargar la lista de municipios: {error}</p>;
  const sinCoincidencia = valor.municipio_dane && lista && !actual;
  return (
    <div className="space-y-2">
      {!deshabilitado && (
        <label className="block text-sm font-medium text-slate-800">
          Buscar municipio por nombre
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej.: Chía, Soacha, Medellín…" className={CAMPO} />
          {encontrados.length > 0 && (
            <span className="mt-1 block divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
              {encontrados.map((m) => (
                <button key={m.codigo} type="button" onClick={() => elegir(m)} className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-slate-50">
                  <span>
                    {bonito(m.municipio)} <span className="text-slate-500">· {bonito(m.departamento)}</span>
                  </span>
                  <span className="font-mono text-xs text-slate-500">{m.codigo}</span>
                </button>
              ))}
            </span>
          )}
        </label>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800">
          Departamento
          <select
            disabled={deshabilitado || !lista}
            value={depto}
            onChange={(e) => {
              setDeptoElegido(e.target.value);
              const nombre = departamentos.find(([c]) => c === e.target.value)?.[1] ?? "";
              onCambio({ municipio: "", departamento: bonito(nombre), municipio_dane: "" });
            }}
            className={CAMPO}
          >
            <option value="">{lista ? "— Elige —" : "Cargando…"}</option>
            {departamentos.map(([c, n]) => (
              <option key={c} value={c}>
                {bonito(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Municipio
          <select
            disabled={deshabilitado || !depto}
            value={actual?.codigo ?? ""}
            onChange={(e) => {
              const m = delDepto.find((x) => x.codigo === e.target.value);
              if (m) elegir(m);
            }}
            className={CAMPO}
          >
            <option value="">{depto ? "— Elige —" : "Primero el departamento"}</option>
            {delDepto.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {bonito(m.municipio)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">Código DANE del municipio</p>
        {aMano && !deshabilitado ? (
          <input
            value={valor.municipio_dane}
            onChange={(e) => onCambio({ ...valor, municipio_dane: e.target.value.replace(/\D/g, "").slice(0, 5) })}
            inputMode="numeric"
            className={CAMPO}
          />
        ) : (
          <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 font-mono text-base text-slate-900">{valor.municipio_dane || "—"}</p>
        )}
        <p className="mt-0.5 text-xs text-slate-500">
          Sale solo al elegir el municipio (DIVIPOLA del DANE). Obligatorio para la factura electrónica.
          {!deshabilitado && (
            <button type="button" onClick={() => setAMano(!aMano)} className="ml-1 min-h-9 underline">
              {aMano ? "Usar la lista" : "Escribirlo a mano (caso raro)"}
            </button>
          )}
        </p>
        {!actual && valor.municipio && !valor.municipio_dane && <p className="text-xs text-amber-800">“{valor.municipio}” no tiene código: elígelo de la lista.</p>}
        {sinCoincidencia && <p className="text-xs font-semibold text-amber-800">El código {valor.municipio_dane} no corresponde a ningún municipio de la DIVIPOLA. Revísalo.</p>}
        {actual && normalizar(valor.municipio) && normalizar(actual.municipio) !== normalizar(valor.municipio) && (
          <p className="text-xs text-amber-800">
            El código {actual.codigo} es de {bonito(actual.municipio)}, pero el municipio dice “{valor.municipio}”.
          </p>
        )}
      </div>
    </div>
  );
}

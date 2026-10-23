"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fechaCorta } from "@/lib/rrhh-registros";

export interface Parametro {
  clave: string;
  nombre: string;
  unidad: "pesos" | "porcentaje" | "dias" | "horas" | "veces_smmlv" | "numero";
  grupo: string;
  ayuda: string | null;
  orden: number;
  activo: boolean;
}
export interface ValorParametro {
  id: string;
  clave: string;
  vigente_desde: string;
  valor: number;
  nota: string | null;
  registrado_en: string;
}

const UNIDAD: Record<Parametro["unidad"], string> = {
  pesos: "$",
  porcentaje: "%",
  dias: "días",
  horas: "horas",
  veces_smmlv: "veces el SMMLV",
  numero: "",
};

export function formatoValor(valor: number, unidad: Parametro["unidad"]): string {
  const n = Number(valor);
  if (unidad === "pesos") return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(n);
  const texto = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 }).format(n);
  return unidad === "porcentaje" ? `${texto} %` : `${texto} ${UNIDAD[unidad]}`.trim();
}

/** El vigente en una fecha: el de vigencia más reciente hasta esa fecha; empate, el registrado después. */
export function vigente(valores: ValorParametro[], clave: string, fecha: string): ValorParametro | null {
  return valores.filter((v) => v.clave === clave && v.vigente_desde <= fecha).sort((a, b) =>
    a.vigente_desde === b.vigente_desde ? b.registrado_en.localeCompare(a.registrado_en) : b.vigente_desde.localeCompare(a.vigente_desde),
  )[0] ?? null;
}

export function ParametrosLiquidacion({ parametros, valores, hoy }: { parametros: Parametro[]; valores: ValorParametro[]; hoy: string }) {
  const [verInactivos, setVerInactivos] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const visibles = parametros.filter((p) => p.activo || verInactivos);
  const grupos = [...new Set(visibles.map((p) => p.grupo))];
  const sinValor = parametros.filter((p) => p.activo && !vigente(valores, p.clave, hoy)).length;

  return (
    <div className="space-y-4">
      {sinValor > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {sinValor} {sinValor === 1 ? "parámetro no tiene" : "parámetros no tienen"} valor vigente todavía. Se cargan con RRHH y contabilidad: el sistema no trae
          ningún valor de ley.
        </p>
      )}
      {grupos.map((g) => (
        <section key={g}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
            {visibles
              .filter((p) => p.grupo === g)
              .map((p) => (
                <FilaParametro key={p.clave} p={p} valores={valores.filter((v) => v.clave === p.clave)} hoy={hoy} />
              ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setNuevo(true)} className="min-h-9 rounded-md border border-slate-900 px-3 text-xs font-semibold">
          + Agregar parámetro
        </button>
        <label className="flex min-h-9 items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Ver los desactivados
        </label>
      </div>
      {nuevo && <NuevoParametro grupos={[...new Set(parametros.map((p) => p.grupo))]} onCerrar={() => setNuevo(false)} />}
    </div>
  );
}

function FilaParametro({ p, valores, hoy }: { p: Parametro; valores: ValorParametro[]; hoy: string }) {
  const router = useRouter();
  const actual = vigente(valores, p.clave, hoy);
  const futuro = valores.filter((v) => v.vigente_desde > hoy).sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))[0];
  const [registrando, setRegistrando] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [valor, setValor] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const numero = valor.trim() === "" ? null : Number(valor.replace(",", "."));
  const falta = numero === null || !Number.isFinite(numero) || numero < 0 ? "Escribe un número (sin puntos de miles)." : !desde ? "Falta desde cuándo rige." : null;

  return (
    <li className={`p-3 text-sm ${p.activo ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{p.nombre}</p>
          {p.ayuda && <p className="text-xs text-slate-500">{p.ayuda}</p>}
          {futuro && (
            <p className="text-xs text-blue-800">
              Desde el {fechaCorta(futuro.vigente_desde)}: {formatoValor(futuro.valor, p.unidad)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-bold ${actual ? "text-slate-900" : "text-amber-700"}`}>{actual ? formatoValor(actual.valor, p.unidad) : "Sin valor"}</p>
          {actual && <p className="text-xs text-slate-500">desde {fechaCorta(actual.vigente_desde)}</p>}
        </div>
      </div>

      {registrando ? (
        <div className="mt-2 space-y-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">
              Valor ({UNIDAD[p.unidad] || "número"})
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-600">
              Rige desde
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="block text-xs text-slate-600">
            Fuente (decreto, resolución, contador…)
            <input value={nota} onChange={(e) => setNota(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          {numero !== null && Number.isFinite(numero) && <p className="text-xs text-slate-500">Queda: {formatoValor(numero, p.unidad)}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setRegistrando(false)} className="min-h-9 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente || falta !== null}
              onClick={() =>
                empezar(async () => {
                  setError(null);
                  const { error: e } = await createClient()
                    .from("parametro_valores")
                    .insert({ clave: p.clave, valor: numero, vigente_desde: desde, nota: nota.trim() || null });
                  if (e) return setError(e.message);
                  setRegistrando(false);
                  setValor("");
                  setNota("");
                  router.refresh();
                })
              }
              className="min-h-9 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white disabled:opacity-40"
            >
              Registrar valor
            </button>
          </div>
          {falta && <p className="text-xs text-slate-500">{falta}</p>}
          <p className="text-xs text-slate-500">El valor anterior no se borra: queda en el historial con su fecha.</p>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-3">
          {p.activo && (
            <button type="button" onClick={() => setRegistrando(true)} className="min-h-9 text-xs font-semibold text-[#A82323] underline">
              {actual ? "Registrar un valor nuevo" : "Registrar valor"}
            </button>
          )}
          {valores.length > 0 && (
            <button type="button" onClick={() => setHistorial((h) => !h)} className="min-h-9 text-xs font-semibold text-slate-700 underline">
              {historial ? "Ocultar historial" : `Historial (${valores.length})`}
            </button>
          )}
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              empezar(async () => {
                setError(null);
                const { error: e } = await createClient().from("parametros_liquidacion").update({ activo: !p.activo }).eq("clave", p.clave);
                if (e) return setError(e.message);
                router.refresh();
              })
            }
            className="min-h-9 text-xs text-slate-500 underline disabled:opacity-40"
          >
            {p.activo ? "Desactivar" : "Activar"}
          </button>
        </div>
      )}
      {historial && (
        <ul className="mt-1 space-y-0.5 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
          {valores.map((v) => (
            <li key={v.id}>
              Desde {fechaCorta(v.vigente_desde)}: <span className="font-semibold">{formatoValor(v.valor, p.unidad)}</span>
              {v.nota ? ` · ${v.nota}` : ""} <span className="text-slate-400">(registrado el {fechaCorta(v.registrado_en)})</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </li>
  );
}

function NuevoParametro({ grupos, onCerrar }: { grupos: string[]; onCerrar: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState<Parametro["unidad"]>("porcentaje");
  const [grupo, setGrupo] = useState(grupos[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const clave = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
  const falta = !nombre.trim() ? "Falta el nombre." : !grupo.trim() ? "Falta el grupo." : null;
  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3 text-sm">
      <p className="font-semibold">Nuevo parámetro</p>
      <p className="text-xs text-slate-500">Para un concepto de ley que no está en la lista. Después se le registra el valor con su vigencia.</p>
      <label className="block text-xs text-slate-600">
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          Unidad
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as Parametro["unidad"])} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="porcentaje">Porcentaje</option>
            <option value="pesos">Pesos</option>
            <option value="dias">Días</option>
            <option value="horas">Horas</option>
            <option value="veces_smmlv">Veces el SMMLV</option>
            <option value="numero">Número</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Grupo
          <input list="grupos-parametros" value={grupo} onChange={(e) => setGrupo(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <datalist id="grupos-parametros">
            {grupos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
      </div>
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCerrar} className="min-h-9 flex-1 rounded-md border border-slate-300 text-xs font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente || falta !== null}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const { error: e } = await createClient()
                .from("parametros_liquidacion")
                .insert({ clave, nombre: nombre.trim(), unidad, grupo: grupo.trim(), orden: 1000 });
              if (e) return setError(/duplicate/.test(e.message) ? "Ya hay un parámetro con ese nombre." : e.message);
              onCerrar();
              router.refresh();
            })
          }
          className="min-h-9 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
      {falta && <p className="text-xs text-slate-500">{falta}</p>}
    </div>
  );
}

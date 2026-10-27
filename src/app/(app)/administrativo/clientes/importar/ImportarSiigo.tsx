"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  CAMPOS_IMPORTABLES,
  COLUMNAS_CLIENTE,
  dvNit,
  leerCelda,
  NOMBRE_CAMPO,
  nitBase,
  sugerirCampo,
  TIPO_DOCUMENTO_DIAN,
  TIPO_PERSONA,
  type CampoImportable,
  type ClienteFicha,
  type ValorImportado,
} from "@/lib/clientes-dian";
import { cargarMunicipios, resolverDane, type Municipio } from "@/lib/rut/catalogos";

type Celda = string | number | boolean | null;
interface Hoja {
  nombre: string;
  filas: Celda[][];
}
type Mapeo = Record<number, CampoImportable | "">;

type Tipo = "nuevo" | "actualiza" | "igual" | "error";
interface Cambio {
  campo: CampoImportable;
  antes: string;
  despues: string;
}
interface FilaPrevia {
  n: number; // fila del Excel (1 = primera)
  nombre: string;
  nit: string | null;
  tipo: Tipo;
  errores: string[];
  /** El código DANE no venía en el Excel: se resolvió por el nombre del municipio (DIVIPOLA). */
  danePorNombre: boolean;
  cambios: Cambio[];
  valores: Partial<Record<CampoImportable, ValorImportado>>;
  existente: ClienteFicha | null;
}

const mostrar = (campo: CampoImportable, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "(vacío)";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(vacío)";
  if (campo === "tipo_documento") return `${v} — ${TIPO_DOCUMENTO_DIAN[String(v)] ?? ""}`;
  if (campo === "tipo_persona") return TIPO_PERSONA[v as "natural" | "juridica"] ?? String(v);
  return String(v);
};
const igual = (a: unknown, b: unknown) => {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify([...((a as string[]) ?? [])].sort()) === JSON.stringify([...((b as string[]) ?? [])].sort());
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
};

/** La fila de encabezados: la primera con al menos 3 celdas con texto (SIIGO pone títulos arriba). */
function filaEncabezado(filas: Celda[][]): number {
  const i = filas.findIndex((f) => f.filter((c) => typeof c === "string" && c.trim()).length >= 3);
  return i < 0 ? 0 : i;
}

export function ImportarSiigo() {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [hojaIdx, setHojaIdx] = useState(0);
  const [encabezado, setEncabezado] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [paso, setPaso] = useState<"subir" | "columnas" | "previa" | "listo">("subir");
  const [existentes, setExistentes] = useState<ClienteFicha[] | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());
  const [ver, setVer] = useState<Tipo | "todas">("todas");
  const [cuantas, setCuantas] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<{ filas: number; creados: number; actualizados: number } | null>(null);

  const hoja = hojas[hojaIdx];
  const encabezados = useMemo(() => (hoja?.filas[encabezado] ?? []).map((c) => String(c ?? "").trim()), [hoja, encabezado]);
  const datos = useMemo(() => (hoja ? hoja.filas.slice(encabezado + 1).filter((f) => f.some((c) => c !== null && String(c).trim() !== "")) : []), [hoja, encabezado]);

  function sugerir(enc: string[]): Mapeo {
    const usados = new Set<CampoImportable>();
    const m: Mapeo = {};
    enc.forEach((e, i) => {
      const s = sugerirCampo(e, usados);
      m[i] = s ?? "";
      if (s) usados.add(s);
    });
    return m;
  }

  async function leerArchivo(f: File) {
    setError(null);
    setTrabajando(true);
    try {
      const XLSX = await import("xlsx");
      const libro = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const leidas: Hoja[] = libro.SheetNames.map((nombre) => ({
        nombre,
        // raw: false → el texto tal como se ve (un NIT largo no se vuelve 9,0012E+08). blankrows:
        // true → los números de fila coinciden con los del Excel.
        filas: XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[nombre], { header: 1, raw: false, defval: null, blankrows: true }),
      })).filter((h) => h.filas.length > 0);
      if (!leidas.length) throw new Error("El archivo no tiene datos.");
      setArchivo(f.name);
      setHojas(leidas);
      setHojaIdx(0);
      const enc = filaEncabezado(leidas[0].filas);
      setEncabezado(enc);
      setMapeo(sugerir((leidas[0].filas[enc] ?? []).map((c) => String(c ?? "").trim())));
      setPaso("columnas");
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}. Sube el Excel (.xlsx o .xls) o un .csv.`);
    } finally {
      setTrabajando(false);
    }
  }

  const camposUsados = Object.values(mapeo).filter(Boolean) as CampoImportable[];
  const repetidos = camposUsados.filter((c, i) => camposUsados.indexOf(c) !== i);
  const faltaColumnas = !camposUsados.includes("nit")
    ? "Elige qué columna trae el NIT o documento: es por donde se sabe si el cliente ya está."
    : !camposUsados.includes("nombre")
      ? "Elige qué columna trae el nombre o razón social."
      : repetidos.length
        ? `“${NOMBRE_CAMPO[repetidos[0]]}” está en dos columnas: déjalo en una sola.`
        : null;

  async function irAPrevia() {
    if (faltaColumnas) return;
    setError(null);
    setTrabajando(true);
    const { data, error: e } = await createClient().from("clientes").select(COLUMNAS_CLIENTE).limit(10000);
    setTrabajando(false);
    if (e) return setError(`No se pudieron leer los clientes actuales para comparar: ${e.message}`);
    setExistentes((data ?? []) as ClienteFicha[]);
    try {
      setMunicipios(await cargarMunicipios());
    } catch {
      setMunicipios([]); // sin la tabla, no se propone el código: queda como venga
    }
    setExcluidas(new Set());
    setVer("todas");
    setCuantas(100);
    setPaso("previa");
  }

  const previa: FilaPrevia[] = useMemo(() => {
    if (paso !== "previa" || !existentes) return [];
    const porNit = new Map<string, ClienteFicha>();
    for (const c of existentes) {
      const b = nitBase(c.nit);
      if (b) porNit.set(b, c);
    }
    const vistos = new Map<string, number>();
    return datos.map((fila, i) => {
      const n = encabezado + i + 2;
      const valores: Partial<Record<CampoImportable, ValorImportado>> = {};
      const errores: string[] = [];
      Object.entries(mapeo).forEach(([col, campo]) => {
        if (!campo) return;
        const r = leerCelda(campo, fila[Number(col)]);
        if ("error" in r) errores.push(`${NOMBRE_CAMPO[campo]}: ${r.error}`);
        else if (r.valor !== null) valores[campo] = r.valor;
      });
      // Sin código DANE pero con municipio: se busca en la DIVIPOLA (solo si hay uno solo con ese nombre).
      let danePorNombre = false;
      if (!valores.municipio_dane && valores.municipio && municipios.length) {
        const m = resolverDane(municipios, String(valores.municipio), valores.departamento ? String(valores.departamento) : null);
        if (m) {
          valores.municipio_dane = m.codigo;
          danePorNombre = true;
        }
      }
      const base = nitBase(valores.nit as string | undefined);
      const existente = base ? (porNit.get(base) ?? null) : null;
      if (!base) errores.push("Sin NIT o documento: no se importa (crearía un cliente repetido cada vez).");
      else if (vistos.has(base)) errores.push(`El mismo NIT ya viene en la fila ${vistos.get(base)} del Excel.`);
      else vistos.set(base, n);
      if (!existente && !valores.nombre) errores.push("Es un cliente nuevo y no trae nombre.");
      // El DV, como lo va a revisar la base (con NIT, tipo 31).
      const tipoDoc = (valores.tipo_documento as string | undefined) ?? existente?.tipo_documento ?? null;
      if (tipoDoc === "31" && base) {
        const pegado = String(valores.nit ?? "").split("-")[1];
        const dv = (valores.dv as string | undefined) ?? pegado ?? existente?.dv ?? null;
        if (dv && dv !== dvNit(base)) errores.push(`El DV ${dv} no corresponde al NIT ${base} (debería ser ${dvNit(base)}).`);
      }
      const cambios: Cambio[] = [];
      if (existente) {
        (Object.keys(valores) as CampoImportable[]).forEach((campo) => {
          if (campo === "nit") return; // es por donde se encontró; no se reescribe
          const antes = existente[campo as keyof ClienteFicha];
          if (!igual(antes, valores[campo])) cambios.push({ campo, antes: mostrar(campo, antes), despues: mostrar(campo, valores[campo]) });
        });
      }
      const tipo: Tipo = errores.length ? "error" : !existente ? "nuevo" : cambios.length ? "actualiza" : "igual";
      return { n, nombre: String(valores.nombre ?? existente?.nombre ?? "(sin nombre)"), nit: base, tipo, errores, danePorNombre, cambios, valores, existente };
    });
  }, [paso, existentes, datos, mapeo, encabezado, municipios]);

  const aImportar = previa.filter((f) => (f.tipo === "nuevo" || f.tipo === "actualiza") && !excluidas.has(f.n));
  const cuenta = (t: Tipo) => previa.filter((f) => f.tipo === t).length;
  const nuevos = aImportar.filter((f) => f.tipo === "nuevo").length;
  const actualiza = aImportar.length - nuevos;
  const visibles = previa.filter((f) => ver === "todas" || f.tipo === ver);

  async function importar() {
    if (!aImportar.length) return;
    setError(null);
    setTrabajando(true);
    const mapeoGuardado = Object.fromEntries(
      Object.entries(mapeo)
        .filter(([, c]) => c)
        .map(([col, c]) => [encabezados[Number(col)] || `Columna ${Number(col) + 1}`, c]),
    );
    const { data, error: e } = await createClient().rpc("fn_importar_clientes", {
      p_filas: aImportar.map((f) => f.valores),
      p_archivo: archivo,
      p_mapeo: mapeoGuardado,
    });
    setTrabajando(false);
    if (e) return setError(`No se importó nada (es todo o nada): ${e.message}`);
    setResultado(data as { filas: number; creados: number; actualizados: number });
    setPaso("listo");
  }

  function reiniciar() {
    setArchivo(null);
    setHojas([]);
    setMapeo({});
    setExistentes(null);
    setResultado(null);
    setError(null);
    setPaso("subir");
  }

  const pasos = [
    { id: "subir", nombre: "1. Subir el Excel" },
    { id: "columnas", nombre: "2. Confirmar columnas" },
    { id: "previa", nombre: "3. Revisar" },
    { id: "listo", nombre: "4. Importado" },
  ];

  return (
    <div className="space-y-3">
      <ol className="flex flex-wrap gap-1 text-xs">
        {pasos.map((p) => (
          <li key={p.id} className={`rounded-full px-2 py-1 ${p.id === paso ? "bg-slate-900 font-semibold text-white" : "bg-slate-100 text-slate-600"}`}>
            {p.nombre}
          </li>
        ))}
      </ol>

      {paso === "subir" && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm text-slate-700">Descarga de SIIGO el listado de clientes (terceros) en Excel y súbelo aquí.</p>
          <label className={`flex min-h-14 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-400 px-3 text-sm font-semibold ${trabajando ? "pointer-events-none opacity-40" : ""}`}>
            {trabajando ? "Leyendo…" : "Elegir el archivo (.xlsx, .xls o .csv)"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) leerArchivo(f);
              }}
            />
          </label>
        </section>
      )}

      {paso === "columnas" && hoja && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">{archivo}</span> · {datos.length} filas de datos.
          </p>
          <div className="flex flex-wrap gap-3">
            {hojas.length > 1 && (
              <label className="text-sm">
                Hoja
                <select
                  value={hojaIdx}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    const enc = filaEncabezado(hojas[i].filas);
                    setHojaIdx(i);
                    setEncabezado(enc);
                    setMapeo(sugerir((hojas[i].filas[enc] ?? []).map((c) => String(c ?? "").trim())));
                  }}
                  className="ml-1 rounded-md border border-slate-300 px-2 py-1"
                >
                  {hojas.map((h, i) => (
                    <option key={h.nombre} value={i}>
                      {h.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm">
              Los encabezados están en la fila
              <select
                value={encabezado}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setEncabezado(i);
                  setMapeo(sugerir((hoja.filas[i] ?? []).map((c) => String(c ?? "").trim())));
                }}
                className="ml-1 rounded-md border border-slate-300 px-2 py-1"
              >
                {hoja.filas.slice(0, 15).map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-sm text-slate-700">
            Para cada columna del Excel, elige a qué dato del ERP va. Las que vienen elegidas son una <span className="font-semibold">sugerencia</span> por el
            nombre de la columna: revísalas una por una. Lo que dejes en “No importar” no se toca.
          </p>
          <ul className="divide-y divide-slate-100">
            {encabezados.map((enc, i) => {
              const ejemplos = datos
                .slice(0, 3)
                .map((f) => f[i])
                .filter((v) => v !== null && String(v).trim() !== "")
                .map(String);
              return (
                <li key={i} className="grid gap-1 py-2 sm:grid-cols-[1fr_1fr] sm:items-center sm:gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{enc || `Columna ${i + 1} (sin título)`}</p>
                    <p className="truncate text-xs text-slate-500">{ejemplos.length ? `Ej.: ${ejemplos.join(" · ")}` : "Vacía en las primeras filas"}</p>
                  </div>
                  <select
                    value={mapeo[i] ?? ""}
                    onChange={(e) => setMapeo((m) => ({ ...m, [i]: e.target.value as CampoImportable | "" }))}
                    className={`min-h-11 rounded-md border px-2 text-base ${mapeo[i] ? "border-slate-900 font-semibold" : "border-slate-300 text-slate-500"}`}
                  >
                    <option value="">No importar</option>
                    {CAMPOS_IMPORTABLES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500">La ubicación GPS y las sedes no se importan: se manejan en la ficha de cada cliente y el Excel nunca las cambia.</p>
          <div className="flex gap-2">
            <button type="button" onClick={reiniciar} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold">
              Otro archivo
            </button>
            <button type="button" disabled={!!faltaColumnas || trabajando} onClick={irAPrevia} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
              {trabajando ? "Comparando…" : "Confirmo las columnas: ver la vista previa"}
            </button>
          </div>
          {faltaColumnas && <p className="text-center text-sm text-slate-600">{faltaColumnas}</p>}
        </section>
      )}

      {paso === "previa" && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["todas", `Todas (${previa.length})`],
                ["nuevo", `Nuevos (${cuenta("nuevo")})`],
                ["actualiza", `Ya están, se actualizan (${cuenta("actualiza")})`],
                ["igual", `Ya están, sin cambios (${cuenta("igual")})`],
                ["error", `Con error, no se importan (${cuenta("error")})`],
              ] as [Tipo | "todas", string][]
            ).map(([id, nombre]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setVer(id);
                  setCuantas(100);
                }}
                className={`min-h-11 rounded-full border px-3 text-sm font-medium ${ver === id ? "border-slate-900 bg-slate-900 text-white" : id === "error" && cuenta("error") ? "border-red-300 text-red-800" : "border-slate-300 text-slate-700"}`}
              >
                {nombre}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {visibles.slice(0, cuantas).map((f) => (
              <li
                key={f.n}
                className={`rounded-md border p-3 text-sm ${f.tipo === "error" ? "border-red-200 bg-red-50" : excluidas.has(f.n) ? "border-slate-200 opacity-50" : "border-slate-200"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{f.nombre}</p>
                    <p className="text-xs text-slate-500">
                      Fila {f.n} del Excel{f.nit ? ` · NIT ${f.nit}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      f.tipo === "nuevo" ? "bg-green-100 text-green-800" : f.tipo === "actualiza" ? "bg-amber-100 text-amber-900" : f.tipo === "igual" ? "bg-slate-100 text-slate-600" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {f.tipo === "nuevo" ? "Nuevo" : f.tipo === "actualiza" ? "Este ya está, se va a actualizar" : f.tipo === "igual" ? "Ya está, sin cambios" : "No se importa"}
                  </span>
                </div>
                {f.errores.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-red-800">
                    {f.errores.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                {f.tipo === "actualiza" && (
                  <table className="mt-1 w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-0.5 pr-2 font-medium">Dato</th>
                        <th className="py-0.5 pr-2 font-medium">Hoy en el ERP</th>
                        <th className="py-0.5 font-medium">Queda (del Excel)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.cambios.map((c) => (
                        <tr key={c.campo} className="border-t border-slate-100 align-top">
                          <td className="py-0.5 pr-2 text-slate-600">{NOMBRE_CAMPO[c.campo]}</td>
                          <td className="py-0.5 pr-2 text-slate-500 line-through decoration-slate-300">{c.antes}</td>
                          <td className="py-0.5 font-semibold text-slate-900">{c.despues}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {f.tipo === "nuevo" && (
                  <p className="mt-1 text-xs text-slate-600">
                    {(Object.keys(f.valores) as CampoImportable[])
                      .filter((c) => c !== "nombre" && c !== "nit")
                      .map((c) => `${NOMBRE_CAMPO[c]}: ${mostrar(c, f.valores[c])}`)
                      .join(" · ") || "Solo nombre y NIT."}
                    {f.danePorNombre && " · (código DANE resuelto por el nombre del municipio)"}
                  </p>
                )}
                {(f.tipo === "nuevo" || f.tipo === "actualiza") && (
                  <label className="mt-1 flex min-h-11 items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={!excluidas.has(f.n)}
                      onChange={(e) =>
                        setExcluidas((s) => {
                          const x = new Set(s);
                          if (e.target.checked) x.delete(f.n);
                          else x.add(f.n);
                          return x;
                        })
                      }
                    />
                    Importar esta fila
                  </label>
                )}
              </li>
            ))}
          </ul>
          {visibles.length > cuantas && (
            <button type="button" onClick={() => setCuantas((c) => c + 200)} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm font-semibold">
              Mostrar más ({visibles.length - cuantas} restantes)
            </button>
          )}
          <div className="sticky bottom-0 space-y-2 border-t border-slate-200 bg-white pt-3">
            <p className="text-sm text-slate-700">
              Se van a importar <span className="font-semibold">{aImportar.length}</span> filas: {nuevos} nuevos y {actualiza} que ya están y se actualizan.
              {cuenta("error") > 0 && <> Las {cuenta("error")} con error no se importan: corrígelas en el Excel y vuelve a subirlo.</>}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaso("columnas")} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold">
                ← Cambiar columnas
              </button>
              <button type="button" disabled={trabajando || aImportar.length === 0} onClick={importar} className="min-h-11 flex-1 rounded-lg bg-green-700 text-sm font-semibold text-white disabled:opacity-40">
                {trabajando ? "Importando…" : `Importar ${aImportar.length} filas`}
              </button>
            </div>
            {aImportar.length === 0 && <p className="text-center text-sm text-slate-600">No hay filas para importar: todas están sin cambios, con error o desmarcadas.</p>}
          </div>
        </section>
      )}

      {paso === "listo" && resultado && (
        <section className="space-y-2 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">
            Listo: {resultado.creados} clientes nuevos y {resultado.actualizados} actualizados.
          </p>
          <p>Quedó registrado quién importó, el archivo y cómo se emparejaron las columnas.</p>
          <div className="flex gap-2">
            <Link href="/administrativo/clientes" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-slate-900 font-semibold text-white">
              Ver los clientes
            </Link>
            <button type="button" onClick={reiniciar} className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800">
              Importar otro archivo
            </button>
          </div>
        </section>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </div>
  );
}

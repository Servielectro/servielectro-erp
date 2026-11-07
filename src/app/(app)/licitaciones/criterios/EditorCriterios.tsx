"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { nombreLinea } from "@/lib/licitaciones/radar";

export interface Criterio {
  id: string;
  tipo: string;
  nombre: string;
  valor: string;
  linea: string | null;
  activo: boolean;
  nota: string | null;
  creado_en: string;
}

const CAMPO = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base";

type TipoNuevo = "palabra" | "ciudad" | "departamento" | "modalidad";

const GRUPOS: { tipo: string; titulo: string; ayuda: string }[] = [
  {
    tipo: "palabra",
    titulo: "Palabras de actividad",
    ayuda:
      "Se buscan en el nombre y la descripción de los procesos que no traen código (hoy casi todos). Sin tildes ni mayúsculas; las palabras del medio admiten plural y la última calza por el comienzo: «CAMARA DE VIDEO» encuentra «cámaras de video». Cada palabra va en una sola línea.",
  },
  { tipo: "categoria", titulo: "Códigos UNSPSC", ayuda: "Mandan cuando el proceso trae código. Se compara la clase (los primeros 6 dígitos)." },
  {
    tipo: "ciudad",
    titulo: "Ciudades",
    ayuda: "Como las escribe SECOP (Medellín, Santa Marta…). Si SECOP no trae la ciudad, se busca en el nombre de la entidad.",
  },
  { tipo: "departamento", titulo: "Departamentos", ayuda: "El departamento completo. Bogotá se escribe como en SECOP: «Distrito Capital de Bogotá»." },
  {
    tipo: "modalidad",
    titulo: "Modalidades",
    ayuda: "Sin RUP solo se puede presentar a mínima cuantía y régimen especial. Con otra modalidad el proceso puede salir relevante, pero no avisa.",
  },
  { tipo: "tipo_contrato", titulo: "Tipos de contrato", ayuda: "Sin filas activas, cualquier tipo cumple." },
  { tipo: "presupuesto", titulo: "Presupuesto", ayuda: "Sin filas activas, cualquier presupuesto cumple." },
];

export function EditorCriterios({ criterios, puedeEditar, puedeRecalcular }: { criterios: Criterio[]; puedeEditar: boolean; puedeRecalcular: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);
  const [tipo, setTipo] = useState<TipoNuevo>("palabra");
  const lineas = [...new Set(criterios.filter((c) => c.activo && c.linea && (c.tipo === "palabra" || c.tipo === "categoria")).map((c) => c.linea!))].sort();
  const [linea, setLinea] = useState(lineas[0] ?? "");
  const [valor, setValor] = useState("");

  // Tras un cambio, lo abierto se recalcula: quien es responsable lo hace al momento; los demás,
  // en la próxima búsqueda (la función de la base lo exige así).
  async function despues(texto: string) {
    const supabase = createClient();
    if (puedeRecalcular) {
      const { data, error } = await supabase.rpc("fn_licitaciones_recalcular");
      setAviso(error ? `${texto} No se pudo recalcular lo abierto: ${error.message}` : `${texto} Recalculados ${data ?? 0} procesos abiertos.`);
    } else {
      setAviso(`${texto} Los procesos abiertos se recalculan en la próxima búsqueda.`);
    }
    router.refresh();
  }

  function traducir(m: string, code?: string) {
    if (code === "23505" && !/ya está en la línea/.test(m)) return "Ya existe (puede estar desactivado: actívelo en la lista).";
    if (/linea_check/.test(m)) return "Las ubicaciones y modalidades son para todas las líneas: no llevan línea.";
    if (/valor_check/.test(m)) return "Muy corto: al menos 2 letras.";
    return m;
  }

  async function agregar() {
    setError(null);
    setAviso(null);
    const v = valor.trim().replace(/\s+/g, " ");
    if (v.length < 3) return setError("Escriba al menos 3 letras.");
    if (tipo === "palabra" && !linea) return setError("Elija la línea de la palabra.");
    setOcupado(true);
    const supabase = createClient();
    // Sin .select(): la fila nueva no se pide de vuelta (ver insert-sin-returning). nombre es obligatorio
    // en la tabla; creado_por lo pone la base (auth.uid()).
    const { error } = await supabase.from("licitacion_criterios").insert({
      tipo,
      nombre: v,
      valor: tipo === "palabra" ? v.toUpperCase() : v,
      linea: tipo === "palabra" ? linea : null,
      activo: true,
      nota: `Agregado desde la app el ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}.`,
    });
    if (error) {
      setOcupado(false);
      return setError(traducir(error.message, error.code));
    }
    setValor("");
    await despues(`✓ «${v}» agregado.`);
    setOcupado(false);
  }

  async function cambiarActivo(c: Criterio) {
    setError(null);
    setAviso(null);
    const activosActividad = criterios.filter((x) => x.activo && (x.tipo === "palabra" || x.tipo === "categoria")).length;
    if (c.activo && (c.tipo === "palabra" || c.tipo === "categoria") && activosActividad === 1)
      return setError("Es el último criterio de actividad activo: sin él el radar no sabría qué buscar.");
    setOcupado(true);
    const supabase = createClient();
    const { error } = await supabase.from("licitacion_criterios").update({ activo: !c.activo }).eq("id", c.id);
    if (error) {
      setOcupado(false);
      return setError(traducir(error.message, error.code));
    }
    await despues(`✓ «${c.valor}» ${c.activo ? "desactivado" : "activado"}.`);
    setOcupado(false);
  }

  return (
    <div className="space-y-4">
      {puedeEditar ? (
        <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">Agregar</p>
          <div className="grid gap-2 sm:grid-cols-[10rem_12rem_1fr_auto]">
            <select aria-label="Tipo" className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value as TipoNuevo)}>
              <option value="palabra">Palabra</option>
              <option value="ciudad">Ciudad</option>
              <option value="departamento">Departamento</option>
              <option value="modalidad">Modalidad</option>
            </select>
            {tipo === "palabra" ? (
              <select aria-label="Línea" className={CAMPO} value={linea} onChange={(e) => setLinea(e.target.value)}>
                {lineas.map((l) => (
                  <option key={l} value={l}>
                    {nombreLinea(l)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="hidden sm:block" />
            )}
            <input
              className={CAMPO}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !ocupado && agregar()}
              placeholder={tipo === "palabra" ? "Ej. CONTROL DE ACCESO" : tipo === "ciudad" ? "Ej. Pereira" : tipo === "departamento" ? "Ej. Boyacá" : "Ej. Mínima cuantía"}
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={agregar}
              className="min-h-11 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Agregar
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Puede ver los criterios. Cambiarlos es de quien trabaja esta sección.</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
        Ver también los desactivados ({criterios.filter((c) => !c.activo).length})
      </label>

      {GRUPOS.map((g) => {
        const filas = criterios.filter((c) => c.tipo === g.tipo && (verInactivos || c.activo));
        const total = criterios.filter((c) => c.tipo === g.tipo && c.activo).length;
        if (filas.length === 0 && (g.tipo === "tipo_contrato" || g.tipo === "presupuesto")) return null;
        const porLinea = new Map<string, Criterio[]>();
        for (const c of filas) porLinea.set(c.linea ?? "", [...(porLinea.get(c.linea ?? "") ?? []), c]);
        return (
          <section key={g.tipo} className="rounded-lg border border-slate-300 bg-white p-3">
            <h2 className="text-base font-semibold text-slate-900">
              {g.titulo} <span className="text-sm font-normal text-slate-500">({total} activos)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">{g.ayuda}</p>
            {filas.length === 0 && <p className="mt-2 text-sm text-slate-500">Ninguno: este criterio se cumple para todos.</p>}
            {[...porLinea.entries()].map(([l, cs]) => (
              <div key={l} className="mt-2">
                {l && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{nombreLinea(l)}</p>}
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {cs.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={!puedeEditar || ocupado}
                        onClick={() => cambiarActivo(c)}
                        title={[c.nombre !== c.valor ? c.nombre : null, c.nota, puedeEditar ? (c.activo ? "Toque para desactivar" : "Toque para activar") : null]
                          .filter(Boolean)
                          .join(" · ")}
                        className={`min-h-11 rounded-full border px-3 text-sm ${
                          c.activo ? "border-slate-300 bg-slate-50 text-slate-800" : "border-dashed border-slate-300 bg-white text-slate-400 line-through"
                        } ${puedeEditar ? "active:bg-slate-200" : "cursor-default"}`}
                      >
                        {c.valor}
                        {c.tipo === "categoria" && c.nombre !== c.valor && <span className="ml-1 text-xs text-slate-500">{c.nombre}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

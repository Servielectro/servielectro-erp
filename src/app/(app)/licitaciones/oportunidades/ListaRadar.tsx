"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { nombreEstado, numeroEtapa } from "@/lib/licitaciones/etapas";
import {
  type Barrido,
  type FilaRadar,
  CRITERIOS,
  SECOP_BUSQUEDA,
  diasParaCierre,
  fechaCierre,
  formatoFechaHora,
  formatoPesos,
  lugar,
  nombreLinea,
} from "@/lib/licitaciones/radar";

const SELECT = "min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm";

type Relevancia = "relevantes" | "todas" | "no_relevantes";
type Rup = "todas" | "sin_rup" | "exige";

/**
 * La lista del radar. Los filtros son locales (los datos ya llegaron): relevancia, línea, RUP,
 * modalidad, ubicación y lo que cierra esta semana.
 */
export function ListaRadar({ filas, ahoraIso, ultimo }: { filas: FilaRadar[]; ahoraIso: string; ultimo: Barrido | null }) {
  const ahora = useMemo(() => new Date(ahoraIso), [ahoraIso]);
  const [relevancia, setRelevancia] = useState<Relevancia>("relevantes");
  const [linea, setLinea] = useState("");
  const [rup, setRup] = useState<Rup>("todas");
  const [modalidad, setModalidad] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [semana, setSemana] = useState(false);
  const [descartadas, setDescartadas] = useState(false);

  const opciones = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    return {
      lineas: uniq(filas.flatMap((f) => f.lineas_que_calzaron ?? [])),
      modalidades: uniq(filas.map((f) => f.modalidad ?? "")),
      ubicaciones: uniq(filas.map((f) => lugar(f))),
    };
  }, [filas]);

  const visibles = filas.filter((f) => {
    if (!descartadas && f.estado === "descartada") return false;
    if (relevancia === "relevantes" && !f.relevante) return false;
    if (relevancia === "no_relevantes" && f.relevante) return false;
    if (linea && !(f.lineas_que_calzaron ?? []).includes(linea)) return false;
    if (rup === "sin_rup" && f.requiere_rup !== false) return false;
    if (rup === "exige" && f.requiere_rup !== true) return false;
    if (modalidad && f.modalidad !== modalidad) return false;
    if (ubicacion && lugar(f) !== ubicacion) return false;
    if (semana) {
      const d = diasParaCierre(f.cierra_en, ahora);
      if (d == null || d > 7) return false;
    }
    return true;
  });
  const relevantes = filas.filter((f) => f.relevante).length;
  const sinRup = filas.filter((f) => f.relevante && f.requiere_rup === false).length;

  return (
    <div className="space-y-4">
      {/* Cuán al día está la lista: Datos Abiertos tarda de 1 a 3 días. */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p>
          <b>La lista nunca está completa al día.</b> SECOP II tarda de 1 a 3 días en pasar los procesos a Datos Abiertos, que es de
          donde lee el radar. Lo que cierra pronto, búsquelo también en{" "}
          <a href={SECOP_BUSQUEDA} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            el portal de SECOP II
          </a>
          .
        </p>
        {ultimo && (
          <p className="mt-1 text-xs">
            Última búsqueda: {formatoFechaHora(new Date(ultimo.iniciado_en))} · {ultimo.leidos.toLocaleString("es-CO")} leídos ·{" "}
            {ultimo.con_actividad} con nuestra actividad · {ultimo.relevantes} relevantes · {ultimo.sin_rup} sin RUP
            {ultimo.error ? " · terminó con error" : ""}
          </p>
        )}
      </div>

      <p className="text-sm text-slate-700">
        {filas.length} abiertas · <b>{relevantes} relevantes</b> · <b className="text-emerald-700">{sinRup} relevantes sin RUP</b>
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <select aria-label="Relevancia" className={SELECT} value={relevancia} onChange={(e) => setRelevancia(e.target.value as Relevancia)}>
          <option value="relevantes">Solo relevantes</option>
          <option value="todas">Todas</option>
          <option value="no_relevantes">No relevantes</option>
        </select>
        <select aria-label="Línea" className={SELECT} value={linea} onChange={(e) => setLinea(e.target.value)}>
          <option value="">Todas las líneas</option>
          {opciones.lineas.map((l) => (
            <option key={l} value={l}>
              {nombreLinea(l)}
            </option>
          ))}
        </select>
        <select aria-label="RUP" className={SELECT} value={rup} onChange={(e) => setRup(e.target.value as Rup)}>
          <option value="todas">Con y sin RUP</option>
          <option value="sin_rup">No exige RUP</option>
          <option value="exige">Exige RUP</option>
        </select>
        <select aria-label="Modalidad" className={SELECT} value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
          <option value="">Todas las modalidades</option>
          {opciones.modalidades.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label="Ubicación" className={SELECT} value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}>
          <option value="">Todas las ubicaciones</option>
          {opciones.ubicaciones.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 text-sm">
          <input type="checkbox" checked={semana} onChange={(e) => setSemana(e.target.checked)} />
          Cierra esta semana
        </label>
      </div>
      {filas.some((f) => f.estado === "descartada") && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={descartadas} onChange={(e) => setDescartadas(e.target.checked)} />
          Ver también las descartadas en el comité ({filas.filter((f) => f.estado === "descartada").length})
        </label>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-slate-300 bg-white p-4 text-center text-sm text-slate-600">
          Con estos filtros no queda ninguna.{" "}
          {relevancia === "relevantes" && filas.length > 0 && relevantes === 0 && (
            <>Ninguna de las {filas.length} abiertas es relevante; elija «Todas» para ver las que quedaron cerca.</>
          )}
        </p>
      ) : (
        <ul className="space-y-3">
          {visibles.map((f) => (
            <Tarjeta key={f.id} f={f} ahora={ahora} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Tarjeta({ f, ahora }: { f: FilaRadar; ahora: Date }) {
  const cierre = fechaCierre(f.cierra_en);
  const dias = diasParaCierre(f.cierra_en, ahora);
  const cumple = new Set(f.criterios_que_coinciden ?? []);
  const lineas = f.lineas_que_calzaron ?? [];
  const porPalabra = f.actividad_por === "palabra";
  return (
    <li className={`rounded-lg border bg-white p-3 shadow-sm ${f.relevante ? "border-slate-300" : "border-slate-200 opacity-80"}`}>
      {/* Lo que más importa primero: RUP y cierre. */}
      <div className="flex flex-wrap items-center gap-2">
        {f.estado && (
          <span className="rounded bg-brand-navy px-2 py-0.5 text-xs font-semibold text-white">
            {numeroEtapa(f.estado) ? `${numeroEtapa(f.estado)} · ` : ""}
            {nombreEstado(f.estado)}
          </span>
        )}
        {f.requiere_rup === false ? (
          <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">SIN RUP · se puede presentar</span>
        ) : f.requiere_rup === true ? (
          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Exige RUP</span>
        ) : (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">RUP: no se sabe (modalidad sin dato)</span>
        )}
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            dias == null ? "bg-slate-100 text-slate-600" : dias <= 3 ? "bg-red-100 text-red-800" : dias <= 7 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"
          }`}
        >
          {cierre
            ? `Cierra ${formatoFechaHora(cierre)} · ${dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`}`
            : "SECOP no trae la fecha de cierre"}
        </span>
        {f.dias_publicado_al_traer != null && (
          <span
            className={`rounded px-2 py-0.5 text-xs ${f.dias_publicado_al_traer >= 2 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}
            title="Días entre la publicación en SECOP II y el día en que el radar lo trajo"
          >
            {f.dias_publicado_al_traer === 0 ? "Nos enteramos el mismo día" : `Nos enteramos ${f.dias_publicado_al_traer} día${f.dias_publicado_al_traer === 1 ? "" : "s"} tarde`}
          </span>
        )}
      </div>

      <Link href={`/licitaciones/oportunidades/${f.id}`} className="mt-2 block active:bg-slate-50">
        <p className="text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2">{f.entidad ?? "Sin entidad"}</p>
        <p className="mt-0.5 line-clamp-3 text-sm text-slate-700">{f.objeto ?? "Sin objeto"}</p>
      </Link>
      <p className="mt-1 text-xs text-slate-600">
        {f.modalidad ?? "Modalidad sin dato"} · {lugar(f)} · <b className="text-slate-800">{formatoPesos(f.presupuesto)}</b>
      </p>

      {/* El semáforo: cuántos de los cinco, cuáles sí y cuáles no, y por qué línea entró. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${
            f.relevante ? "bg-emerald-100 text-emerald-800" : (f.afinidad ?? 0) >= 4 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"
          }`}
        >
          {f.afinidad ?? 0}/5{f.relevante ? " · relevante" : ""}
        </span>
        {CRITERIOS.map((c) => {
          const si = cumple.has(c.id);
          return (
            <span
              key={c.id}
              className={`rounded px-1.5 py-0.5 text-xs ${si ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700 line-through decoration-red-300"}`}
            >
              {si ? "✓" : "✗"} {c.nombre}
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        {lineas.length > 0 && (
          <span className="text-slate-700">
            Entró por <b>{lineas.map(nombreLinea).join(" + ")}</b>
          </span>
        )}
        {porPalabra ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900" title="El proceso no traía código UNSPSC: calzó una palabra en el nombre o la descripción">
            ⚠ calzó por palabra, no por código: revisar
          </span>
        ) : f.actividad_por === "unspsc" ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">por código UNSPSC</span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <Link href={`/licitaciones/oportunidades/${f.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white">
          Abrir la ficha
        </Link>
        {f.url_secop ? (
          <a
            href={f.url_secop}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-brand-navy"
          >
            Ver en SECOP II ↗
          </a>
        ) : (
          <span className="text-xs text-slate-500">SECOP no trae el enlace</span>
        )}
      </div>
    </li>
  );
}

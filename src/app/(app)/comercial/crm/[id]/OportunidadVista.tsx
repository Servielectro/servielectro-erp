"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { OportunidadDetalle } from "@/lib/supabase/crm";
import {
  CONTACTO_LABEL,
  ETAPAS_CON_ESTIMADO,
  MOTIVO_LABEL,
  MOTIVOS_CON_COMPETIDOR,
  MOTIVOS_PERDIDA,
  MS_DIA,
  VIA_LABEL,
  semaforo,
  type EtapaConfig,
  type MotivoPerdida,
  type TipoContacto,
  type ViaAprobacion,
} from "@/lib/crm";
import { formatCOP } from "@/lib/pricing";
import { ORIGENES } from "@/lib/crm-filtros";
import {
  actualizarDatos,
  agregarContacto,
  aplazar,
  completarContacto,
  marcarGanada,
  marcarPerdida,
  moverEtapa,
  reactivar,
} from "../actions";

type Panel = null | "perdida" | "aplazar";

export function OportunidadVista({
  o,
  etapas,
  todasLasEtapas,
  ahora,
}: {
  o: OportunidadDetalle;
  etapas: EtapaConfig[]; // las de su pipeline, en orden
  todasLasEtapas: EtapaConfig[];
  ahora: number;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const nombreEtapa = new Map(todasLasEtapas.map((e) => [e.id, e.nombre]));
  const abiertas = etapas.filter((e) => !e.resultado);
  const etapaGanada = etapas.find((e) => e.resultado === "ganada");
  const etapaPerdida = etapas.find((e) => e.resultado === "perdida");
  const actual = etapas.find((e) => e.id === o.etapaId);
  const idxActual = abiertas.findIndex((e) => e.id === o.etapaId);
  const siguiente = idxActual >= 0 ? abiertas[idxActual + 1] : undefined;
  const cerrada = o.estado === "cerrada";
  const ganada = cerrada && actual?.resultado === "ganada";

  const periodoActual = o.historial.find((h) => !h.fechaSalida);
  const diasEnEtapa = periodoActual
    ? Math.max(0, Math.floor((ahora - new Date(periodoActual.fechaEntrada).getTime()) / MS_DIA))
    : 0;
  const luz = o.estado === "activa" ? semaforo(diasEnEtapa, actual) : "verde";

  function correr(accion: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await accion();
      if (!res.ok) setError(res.error ?? "Error desconocido");
      else despues?.();
    });
  }

  return (
    <div className="space-y-5">
      {/* ---------------- Encabezado ---------------- */}
      <div>
        <h1 className="text-base font-bold text-slate-900">{o.nombre}</h1>
        <p className="text-sm text-slate-600">{o.cliente.nombre}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              cerrada
                ? ganada
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
                : o.estado === "aplazada"
                  ? "bg-slate-200 text-slate-700"
                  : "bg-blue-100 text-blue-800"
            }`}
          >
            {nombreEtapa.get(o.etapaId)}
            {o.estado === "aplazada" && " · aplazada"}
          </span>
          {o.estado === "activa" && (
            <span
              className={
                luz === "rojo" ? "text-red-700" : luz === "amarillo" ? "text-amber-700" : "text-slate-500"
              }
            >
              {diasEnEtapa} {diasEnEtapa === 1 ? "día" : "días"} en esta etapa
              {luz === "rojo" && " — estancada"}
            </span>
          )}
          {o.estado === "aplazada" && o.fechaReactivacion && (
            <span className="text-slate-600">Retomar el {fechaCorta(o.fechaReactivacion)}</span>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* ---------------- Etapas ---------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <ol className="mb-3 flex flex-wrap gap-1">
          {abiertas.map((e, i) => {
            const pasada = cerrada ? true : i < idxActual;
            const esActual = e.id === o.etapaId;
            return (
              <li
                key={e.id}
                className={`rounded px-2 py-1 text-xs ${
                  esActual
                    ? "bg-slate-900 font-semibold text-white"
                    : pasada
                      ? "bg-slate-200 text-slate-700"
                      : "bg-slate-50 text-slate-400"
                }`}
              >
                {e.nombre}
              </li>
            );
          })}
        </ol>

        {cerrada ? (
          <div className="space-y-2 text-sm">
            {!ganada && o.motivoPerdida && (
              <div className="rounded-md bg-red-50 p-2 text-red-900">
                <p className="font-medium">{MOTIVO_LABEL[o.motivoPerdida]}</p>
                {o.motivoPerdidaDetalle && <p className="text-xs">{o.motivoPerdidaDetalle}</p>}
                {o.competidorGanador && <p className="text-xs">Ganó: {o.competidorGanador}</p>}
                {o.etapaAlPerder && (
                  <p className="text-xs">Se perdió en: {nombreEtapa.get(o.etapaAlPerder)}</p>
                )}
              </div>
            )}
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              ¿Se cerró por error? Reabrir en
              <select
                defaultValue=""
                disabled={pendiente}
                onChange={(e) => {
                  const etapa = e.target.value;
                  if (etapa && window.confirm("¿Reabrir este negocio? El cierre queda en el historial.")) {
                    correr(() => moverEtapa(o.id, etapa));
                  }
                  e.target.value = "";
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                <option value="">elige etapa…</option>
                {abiertas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : o.estado === "aplazada" ? (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => reactivar(o.id))}
            className="w-full rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Retomar ahora (vuelve a {nombreEtapa.get(o.etapaId)})
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {siguiente && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => correr(() => moverEtapa(o.id, siguiente.id))}
                  className="flex-1 rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Pasar a {siguiente.nombre} →
                </button>
              )}
              {etapaGanada && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => {
                    if (window.confirm(`¿Marcar como ${etapaGanada.nombre}?`)) {
                      correr(() => marcarGanada(o.id, etapaGanada.id));
                    }
                  }}
                  className={`rounded-md px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                    siguiente ? "border border-green-600 text-green-700" : "flex-1 bg-green-600 text-white"
                  }`}
                >
                  ✓ {etapaGanada.nombre}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPanel(panel === "perdida" ? null : "perdida")}
                className="rounded-md border border-red-300 px-3 py-1.5 text-red-700"
              >
                ✕ {etapaPerdida?.nombre ?? "Perdida"}
              </button>
              <button
                type="button"
                onClick={() => setPanel(panel === "aplazar" ? null : "aplazar")}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700"
              >
                ⏸ Aplazar
              </button>
              <select
                defaultValue=""
                disabled={pendiente}
                onChange={(e) => {
                  const etapa = e.target.value;
                  if (etapa) correr(() => moverEtapa(o.id, etapa));
                  e.target.value = "";
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                aria-label="Mover a otra etapa"
              >
                <option value="">Mover a otra etapa…</option>
                {abiertas
                  .filter((e) => e.id !== o.etapaId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
              </select>
            </div>

            {panel === "perdida" && etapaPerdida && (
              <PanelPerdida
                pendiente={pendiente}
                onCancelar={() => setPanel(null)}
                onConfirmar={(motivo, detalle, competidor) =>
                  correr(
                    () => marcarPerdida(o.id, etapaPerdida.id, motivo, detalle, competidor),
                    () => setPanel(null),
                  )
                }
              />
            )}
            {panel === "aplazar" && (
              <PanelAplazar
                pendiente={pendiente}
                onCancelar={() => setPanel(null)}
                onConfirmar={(fecha) => correr(() => aplazar(o.id, fecha), () => setPanel(null))}
              />
            )}
          </div>
        )}
      </section>

      {/* ---------------- Pronóstico ---------------- */}
      <Pronostico o={o} pendiente={pendiente} correr={correr} />

      {/* ---------------- Seguimientos ---------------- */}
      <Seguimientos o={o} pendiente={pendiente} correr={correr} />

      {/* ---------------- Historial ---------------- */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</h2>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
          {[...o.historial].reverse().map((h) => {
            const fin = h.fechaSalida ? new Date(h.fechaSalida).getTime() : ahora;
            const dias = Math.max(0, Math.floor((fin - new Date(h.fechaEntrada).getTime()) / MS_DIA));
            return (
              <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-slate-800">
                  {nombreEtapa.get(h.etapaId)}
                  {h.estado === "aplazada" && <span className="text-slate-500"> · aplazada</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {new Date(h.fechaEntrada).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                  {h.estado !== "cerrada" && ` · ${dias} ${dias === 1 ? "día" : "días"}${h.fechaSalida ? "" : " (actual)"}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

type Correr = (accion: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) => void;

function PanelPerdida({
  pendiente,
  onCancelar,
  onConfirmar,
}: {
  pendiente: boolean;
  onCancelar: () => void;
  onConfirmar: (motivo: MotivoPerdida, detalle: string, competidor: string) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoPerdida | "">("");
  const [detalle, setDetalle] = useState("");
  const [competidor, setCompetidor] = useState("");
  const pideCompetidor = motivo !== "" && MOTIVOS_CON_COMPETIDOR.includes(motivo);

  return (
    <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-medium text-red-900">¿Por qué se perdió? (obligatorio)</p>
      <select
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as MotivoPerdida | "")}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
      >
        <option value="">Elige el motivo…</option>
        {MOTIVOS_PERDIDA.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {pideCompetidor && (
        <input
          value={competidor}
          onChange={(e) => setCompetidor(e.target.value)}
          placeholder="¿Quién ganó? (si se sabe)"
          className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
        />
      )}
      {motivo !== "" && (
        <input
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder={motivo === "otro" ? "¿Cuál fue el motivo? (obligatorio)" : "Detalle (opcional)"}
          className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
        />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pendiente || motivo === "" || (motivo === "otro" && !detalle.trim())}
          onClick={() => motivo && onConfirmar(motivo, detalle, competidor)}
          className="flex-1 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Cerrar como perdida
        </button>
        <button type="button" onClick={onCancelar} className="rounded-md px-3 py-2 text-sm text-slate-600">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PanelAplazar({
  pendiente,
  onCancelar,
  onConfirmar,
}: {
  pendiente: boolean;
  onCancelar: () => void;
  onConfirmar: (fecha: string) => void;
}) {
  const [fecha, setFecha] = useState("");
  return (
    <div className="space-y-2 rounded-md border border-slate-300 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-800">¿Cuándo hay que retomarlo?</p>
      <p className="text-xs text-slate-600">
        Conserva la etapa. Ese día aparece en &quot;Requiere atención&quot;.
      </p>
      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pendiente || !fecha}
          onClick={() => onConfirmar(fecha)}
          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Aplazar
        </button>
        <button type="button" onClick={onCancelar} className="rounded-md px-3 py-2 text-sm text-slate-600">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// El valor del negocio sale de la cotización real: se asocia una del cliente (o se
// arma con "Cotizar", que la deja asociada sola). El estimado solo se pide en las
// etapas tempranas, sin cotización; después queda como dato histórico.
function Pronostico({ o, pendiente, correr }: { o: OportunidadDetalle; pendiente: boolean; correr: Correr }) {
  const conEstimado = ETAPAS_CON_ESTIMADO.includes(o.etapaId);
  const estimadoTexto = o.valorEstimado === null ? "" : String(o.valorEstimado);
  const expensaTexto =
    o.requiereExpensaExtraordinaria === null ? "" : o.requiereExpensaExtraordinaria ? "si" : "no";

  const [cotizacionId, setCotizacionId] = useState(o.cotizacionId ?? "");
  const [valor, setValor] = useState(estimadoTexto);
  const [via, setVia] = useState<ViaAprobacion | "">(o.viaAprobacion ?? "");
  const [expensa, setExpensa] = useState(expensaTexto);
  const [fechaDecision, setFechaDecision] = useState(o.fechaEstimadaDecision ?? "");
  const [origen, setOrigen] = useState(o.origenLead ?? "");
  const [guardado, setGuardado] = useState(false);

  const cotizacionElegida = o.cotizacionesCliente.find((c) => c.id === cotizacionId);
  const pideEstimado = conEstimado && !cotizacionId;
  const cambiado =
    cotizacionId !== (o.cotizacionId ?? "") ||
    (pideEstimado && valor !== estimadoTexto) ||
    via !== (o.viaAprobacion ?? "") ||
    expensa !== expensaTexto ||
    fechaDecision !== (o.fechaEstimadaDecision ?? "") ||
    (o.origenLead !== undefined && origen !== (o.origenLead ?? ""));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      {/* ---- Cotización asociada: de acá sale el valor real ---- */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Cotización asociada
      </h2>
      <div className="mb-4 space-y-2">
        <select
          value={cotizacionId}
          onChange={(e) => setCotizacionId(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
          aria-label="Cotización asociada"
        >
          <option value="">
            {o.cotizacionesCliente.length === 0
              ? "Este cliente todavía no tiene cotizaciones"
              : "Sin cotización asociada"}
          </option>
          {o.cotizacionesCliente.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} — {c.descripcion}
              {c.total !== null ? ` — ${formatCOP(c.total)}` : ""}
            </option>
          ))}
        </select>
        {cotizacionElegida && (
          <p className="text-sm text-slate-800">
            Valor cotizado:{" "}
            <span className="font-semibold">
              {cotizacionElegida.total !== null ? formatCOP(cotizacionElegida.total) : "—"}
            </span>{" "}
            ·{" "}
            <Link href={`/comercial/cotizaciones/${cotizacionElegida.id}`} className="underline">
              ver cotización
            </Link>
          </p>
        )}
        {o.estado !== "cerrada" && (
          <Link
            href={`/comercial/cotizaciones/nueva?oportunidad=${o.id}`}
            className="block rounded-md border border-slate-900 px-3 py-2 text-center text-sm font-semibold text-slate-900"
          >
            {o.cotizacionId ? "Cotizar de nuevo (nueva versión)" : "Cotizar"}
          </Link>
        )}
        <p className="text-xs text-slate-500">
          &quot;Cotizar&quot; abre el armador con este cliente; al guardar, la cotización queda
          asociada sola y el negocio pasa a Cotización enviada.
        </p>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pronóstico</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {pideEstimado ? (
          <label className="block text-xs text-slate-600 sm:col-span-2">
            Valor estimado (mientras no hay cotización)
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="numeric"
              placeholder="Ej. 40000000"
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
        ) : (
          o.valorEstimado !== null && (
            <p className="text-xs text-slate-500 sm:col-span-2">
              Estimado inicial: {formatCOP(o.valorEstimado)} (dato histórico; el valor del
              negocio es el de la cotización)
            </p>
          )
        )}
        <label className="block text-xs text-slate-600">
          ¿Quién aprueba?
          <select
            value={via}
            onChange={(e) => setVia(e.target.value as ViaAprobacion | "")}
            className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
          >
            <option value="">No se sabe</option>
            {(Object.keys(VIA_LABEL) as ViaAprobacion[]).map((v) => (
              <option key={v} value={v}>
                {VIA_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-600">
          ¿Requiere expensa extraordinaria?
          <select
            value={expensa}
            onChange={(e) => setExpensa(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
          >
            <option value="">No se sabe</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="block text-xs text-slate-600 sm:col-span-2">
          Objetivo de cierre (fecha estimada de la decisión)
          <input
            type="date"
            value={fechaDecision}
            onChange={(e) => setFechaDecision(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
          {expensa === "si" && (
            <span className="mt-0.5 block text-amber-700">
              Con expensa extraordinaria normalmente decide la asamblea: la fecha suele correrse a la próxima reunión.
            </span>
          )}
          <span className="mt-0.5 block text-slate-500">Si pasa sin cerrarse, el negocio sale en el filtro “vencidos” del CRM.</span>
        </label>
        {o.origenLead !== undefined && (
          <label className="block text-xs text-slate-600 sm:col-span-2">
            Origen del lead
            <select value={origen} onChange={(e) => setOrigen(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
              <option value="">Sin registrar</option>
              {ORIGENES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {(cambiado || guardado) && (
        <button
          type="button"
          disabled={pendiente || !cambiado}
          onClick={() => {
            let estimado = o.valorEstimado; // fuera de las etapas tempranas no se toca
            if (pideEstimado) {
              const v = valor.trim() ? Number(valor.replace(/[.\s$]/g, "")) : null;
              estimado = v !== null && !Number.isNaN(v) ? v : null;
            }
            correr(
              () =>
                actualizarDatos(o.id, {
                  nombre: o.nombre,
                  valorEstimado: estimado,
                  cotizacionId: cotizacionId || null,
                  viaAprobacion: via || null,
                  requiereExpensaExtraordinaria: expensa === "" ? null : expensa === "si",
                  fechaEstimadaDecision: fechaDecision || null,
                  ...(o.origenLead !== undefined ? { origenLead: origen || null } : {}),
                }),
              () => setGuardado(true),
            );
          }}
          className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {cambiado ? "Guardar cambios" : "Guardado ✓"}
        </button>
      )}
    </section>
  );
}

function Seguimientos({ o, pendiente, correr }: { o: OportunidadDetalle; pendiente: boolean; correr: Correr }) {
  const [tipo, setTipo] = useState<TipoContacto>("llamada");
  const [conQuien, setConQuien] = useState("");
  const [nota, setNota] = useState("");
  const [modo, setModo] = useState<"programar" | "hecho">("programar");
  const [fecha, setFecha] = useState("");

  const pendientes = o.contactos
    .filter((c) => !c.fechaRealizada)
    .sort((a, b) => (a.fechaProgramada ?? "").localeCompare(b.fechaProgramada ?? ""));
  const hechos = o.contactos.filter((c) => c.fechaRealizada);

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Seguimientos</h2>

      {o.estado === "activa" && pendientes.length === 0 && (
        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No hay ningún seguimiento programado: así es como se caen los negocios. Programa el próximo.
        </p>
      )}

      <div className="space-y-2">
        {pendientes.map((c) => (
          <div key={c.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-slate-900">
                {CONTACTO_LABEL[c.tipo]} {c.conQuien && <span className="font-normal">· {c.conQuien}</span>}
              </p>
              <p className="text-xs text-slate-600">Para el {fechaCorta(c.fechaProgramada)}</p>
              {c.nota && <p className="text-xs text-slate-600">{c.nota}</p>}
            </div>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => completarContacto(o.id, c.id))}
              className="shrink-0 rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-700"
            >
              Hecho ✓
            </button>
          </div>
        ))}
      </div>

      {o.estado !== "cerrada" && (
        <form
          className="mt-2 space-y-2 rounded-lg border border-dashed border-slate-300 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            correr(
              () =>
                agregarContacto(o.id, {
                  tipo,
                  conQuien,
                  nota,
                  hecho: modo === "hecho",
                  fechaProgramada: modo === "programar" ? fecha || null : null,
                }),
              () => {
                setConQuien("");
                setNota("");
                setFecha("");
              },
            );
          }}
        >
          <div className="flex gap-1 text-xs">
            {(["programar", "hecho"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={`rounded-full border px-3 py-1 ${
                  modo === m ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
                }`}
              >
                {m === "programar" ? "Programar seguimiento" : "Registrar uno hecho"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoContacto)}
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              {(Object.keys(CONTACTO_LABEL) as TipoContacto[]).map((t) => (
                <option key={t} value={t}>
                  {CONTACTO_LABEL[t]}
                </option>
              ))}
            </select>
            {modo === "programar" ? (
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                aria-label="Fecha del seguimiento"
              />
            ) : (
              <span className="self-center text-xs text-slate-500">Se registra con fecha de hoy</span>
            )}
          </div>
          <input
            value={conQuien}
            onChange={(e) => setConQuien(e.target.value)}
            placeholder="¿Con quién? (ej. Administradora)"
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (opcional)"
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pendiente || (modo === "programar" && !fecha)}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {modo === "programar" ? "Programar" : "Registrar"}
          </button>
        </form>
      )}

      {hechos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {hechos.map((c) => (
            <li key={c.id} className="text-xs text-slate-600">
              <span className="text-slate-400">
                {new Date(c.fechaRealizada!).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
              </span>{" "}
              · {CONTACTO_LABEL[c.tipo]}
              {c.conQuien && ` con ${c.conQuien}`}
              {c.nota && ` — ${c.nota}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function fechaCorta(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

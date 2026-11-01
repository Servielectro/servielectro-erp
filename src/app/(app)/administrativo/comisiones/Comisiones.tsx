"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/pricing";
import { fechaCorta, hoyBogota } from "@/lib/marketing";
import { ESTADO_COMISION, ETIQUETA_BASE, pct, type Plan } from "@/lib/referidos";

export interface Comision {
  id: string;
  referido_id: string;
  registro_id: string | null;
  proyecto_id: string | null;
  cotizacion_id: string | null;
  concepto: string;
  base_calculo: number;
  porcentaje: number;
  valor: number;
  estado: "causada" | "aprobada" | "pagada" | "anulada";
  causada_en: string;
  aprobada_en: string | null;
  pagada_en: string | null;
  motivo: string | null;
  referidos: { nombre: string } | null;
  proyectos: { codigo: string; nombre: string } | null;
  cotizaciones: { codigo: string } | null;
  referido_registros: { nombre_prospecto: string } | null;
}
export interface OpcionReferido {
  id: string;
  nombre: string;
  estado: string;
  plan: Plan | null;
  registros: { id: string; nombre_prospecto: string }[];
}

const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal";
const etiqueta = "block text-sm font-semibold text-slate-800";
const digitos = (t: string) => Number(t.replace(/\D/g, "")) || 0;

export function Comisiones({ comisiones, escribe }: { comisiones: Comision[]; escribe: boolean }) {
  if (!comisiones.length) return <p className="py-6 text-center text-sm text-slate-500">No hay comisiones en este estado.</p>;
  return (
    <ul className="space-y-2">
      {comisiones.map((c) => (
        <FilaComision key={c.id} c={c} escribe={escribe} />
      ))}
    </ul>
  );
}

function FilaComision({ c, escribe }: { c: Comision; escribe: boolean }) {
  const router = useRouter();
  const [accion, setAccion] = useState<"pagar" | "anular" | null>(null);
  const [fecha, setFecha] = useState(hoyBogota());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const e = ESTADO_COMISION[c.estado];

  const guardarCambios = async (cambios: Record<string, unknown>) => {
    setError(null);
    const { data, error: err } = await createClient().from("referido_comisiones").update(cambios).eq("id", c.id).select("id");
    if (err) return setError(err.message);
    if (!data?.length) return setError("No se guardó (sin permiso).");
    setAccion(null);
    router.refresh();
  };
  const actualizar = (cambios: Record<string, unknown>) => empezar(() => guardarCambios(cambios));
  const aprobar = () =>
    empezar(async () => {
      const { data: u } = await createClient().auth.getUser();
      if (!u.user) return setError("La sesión se cerró: hay que volver a entrar.");
      await guardarCambios({ estado: "aprobada", aprobada_por: u.user.id, aprobada_en: new Date().toISOString() });
    });

  return (
    <li className={`rounded-lg border border-slate-300 bg-white p-3 ${c.estado === "anulada" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            <Link href={`/administrativo/referidos/${c.referido_id}`} className="hover:underline">
              {c.referidos?.nombre ?? "—"}
            </Link>
            {" · "}
            {c.concepto}
          </p>
          <p className="text-xs text-slate-600">
            {[
              c.referido_registros?.nombre_prospecto,
              c.proyectos && `${c.proyectos.codigo} ${c.proyectos.nombre}`,
              c.cotizaciones?.codigo,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-xs text-slate-700">
            {pct(c.porcentaje)} de {formatCOP(Number(c.base_calculo))} · causada {fechaCorta(c.causada_en)}
            {c.aprobada_en && ` · aprobada ${fechaCorta(c.aprobada_en)}`}
            {c.pagada_en && ` · pagada ${fechaCorta(c.pagada_en)}`}
          </p>
          {c.motivo && <p className="text-xs text-slate-700">Motivo: {c.motivo}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold text-slate-900">{formatCOP(Number(c.valor))}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.clase}`}>{e.label}</span>
        </div>
      </div>
      {escribe && !accion && c.estado !== "pagada" && c.estado !== "anulada" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {c.estado === "causada" && (
            <button type="button" disabled={pendiente} onClick={aprobar} className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40">
              Aprobar
            </button>
          )}
          {c.estado === "aprobada" && (
            <button type="button" onClick={() => setAccion("pagar")} className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">
              Marcar pagada
            </button>
          )}
          <button type="button" onClick={() => setAccion("anular")} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
            Anular
          </button>
        </div>
      )}
      {accion === "pagar" && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
          <label className={etiqueta}>
            Fecha del giro
            <input type="date" value={fecha} max={hoyBogota()} onChange={(ev) => setFecha(ev.target.value)} className={`${input} sm:w-48`} />
          </label>
          <Botones onCancelar={() => setAccion(null)} deshabilitado={pendiente || !fecha} onGuardar={() => actualizar({ estado: "pagada", pagada_en: fecha })} texto="Guardar pago" />
        </div>
      )}
      {accion === "anular" && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
          <label className={etiqueta}>
            ¿Por qué no se paga? (obligatorio)
            <input autoFocus value={motivo} onChange={(ev) => setMotivo(ev.target.value)} className={input} />
          </label>
          <Botones onCancelar={() => setAccion(null)} deshabilitado={pendiente || !motivo.trim()} onGuardar={() => actualizar({ estado: "anulada", motivo: motivo.trim() })} texto="Anular" />
        </div>
      )}
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </li>
  );
}

function Botones({ onCancelar, onGuardar, deshabilitado, texto }: { onCancelar: () => void; onGuardar: () => void; deshabilitado: boolean; texto: string }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onCancelar} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm">
        Cancelar
      </button>
      <button type="button" disabled={deshabilitado} onClick={onGuardar} className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
        {texto}
      </button>
    </div>
  );
}

/** Causar una comisión por un pago recibido. El % sale del plan; el tope por proyecto se respeta. */
export function NuevaComision({
  referidos,
  inicial,
  proyectos,
  cotizaciones,
  yaCausadas,
}: {
  referidos: OpcionReferido[];
  inicial: string | null;
  proyectos: { id: string; codigo: string; nombre: string }[];
  cotizaciones: { id: string; codigo: string }[];
  yaCausadas: { referido_id: string; proyecto_id: string | null; valor: number }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ referido: inicial ?? "", tipo: "proyecto" as "proyecto" | "recurrente", registro: "", proyecto: "", cotizacion: "", concepto: "", base: "", porcentaje: "", causada_en: hoyBogota() });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const ref = referidos.find((r) => r.id === f.referido);
  const plan = ref?.plan ?? null;
  const pctPlan = plan ? Number(f.tipo === "recurrente" ? plan.porcentaje_recurrente ?? 0 : plan.porcentaje) : 0;
  const pctUsado = f.porcentaje.trim() ? Number(f.porcentaje.replace(",", ".")) / 100 : pctPlan;
  const base = digitos(f.base);
  const bruto = Math.round(base * pctUsado);
  // Tope del plan por proyecto, contando lo ya causado (no anulado) a este referido en ese proyecto.
  const usado = f.proyecto ? yaCausadas.filter((c) => c.referido_id === f.referido && c.proyecto_id === f.proyecto).reduce((t, c) => t + c.valor, 0) : 0;
  const tope = plan?.tope_por_proyecto && f.tipo === "proyecto" && f.proyecto ? Math.max(0, Number(plan.tope_por_proyecto) - usado) : null;
  const valor = tope != null ? Math.min(bruto, tope) : bruto;

  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-lg bg-brand-red px-4 text-sm font-semibold text-white">
        + Causar comisión por un pago recibido
      </button>
    );

  const guardar = () =>
    empezar(async () => {
      setError(null);
      if (!valor) return setError("La comisión da cero: falta la base o el porcentaje.");
      const { data, error: e } = await createClient()
        .from("referido_comisiones")
        .insert({
          referido_id: f.referido,
          registro_id: f.registro || null,
          proyecto_id: f.proyecto || null,
          cotizacion_id: f.cotizacion || null,
          concepto: f.concepto.trim(),
          base_calculo: base,
          porcentaje: pctUsado,
          valor,
          causada_en: f.causada_en,
        })
        .select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó (sin permiso).");
      setAbierto(false);
      setF({ ...f, registro: "", proyecto: "", cotizacion: "", concepto: "", base: "", porcentaje: "" });
      router.refresh();
    });

  return (
    <section className="space-y-3 rounded-lg border border-slate-400 bg-white p-3">
      <label className={etiqueta}>
        Referido
        <select value={f.referido} onChange={(e) => setF({ ...f, referido: e.target.value, registro: "" })} className={`${input} px-2`}>
          <option value="">Elegir…</option>
          {referidos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </label>
      {ref && !plan && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Este referido no tiene plan: el porcentaje hay que escribirlo a mano.</p>}
      {plan && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Plan «{plan.nombre}»: {pct(plan.porcentaje)} {ETIQUETA_BASE[plan.base]}
          {plan.porcentaje_recurrente ? ` · ${pct(plan.porcentaje_recurrente)} del canon por ${plan.meses_recurrencia ?? "?"} meses` : ""}
          {plan.causa === "firma" && " · este plan se causa con la firma"}
        </p>
      )}
      {plan?.porcentaje_recurrente && (
        <div className="flex gap-2">
          {(["proyecto", "recurrente"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setF({ ...f, tipo: t })} className={`min-h-11 flex-1 rounded-lg border text-sm ${f.tipo === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
              {t === "proyecto" ? "Del proyecto" : "Del canon recurrente"}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>
          Prospecto registrado
          <select value={f.registro} onChange={(e) => setF({ ...f, registro: e.target.value })} className={`${input} px-2`}>
            <option value="">—</option>
            {ref?.registros.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre_prospecto}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Proyecto
          <select value={f.proyecto} onChange={(e) => setF({ ...f, proyecto: e.target.value })} className={`${input} px-2`}>
            <option value="">—</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Cotización
          <select value={f.cotizacion} onChange={(e) => setF({ ...f, cotizacion: e.target.value })} className={`${input} px-2`}>
            <option value="">—</option>
            {cotizaciones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={etiqueta}>
        Concepto
        <input value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder={f.tipo === "recurrente" ? "Ej.: canon de monitoreo de marzo" : "Ej.: anticipo 50% recibido"} className={input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>
          {plan?.base === "utilidad" && f.tipo === "proyecto" ? "Utilidad de lo recaudado" : "Valor recaudado"}
          <input inputMode="numeric" value={f.base ? Number(digitos(f.base)).toLocaleString("es-CO") : ""} onChange={(e) => setF({ ...f, base: e.target.value })} className={input} />
        </label>
        <label className={etiqueta}>
          Porcentaje
          <input inputMode="decimal" value={f.porcentaje} onChange={(e) => setF({ ...f, porcentaje: e.target.value })} placeholder={pctPlan ? String(Math.round(pctPlan * 10000) / 100) : ""} className={input} />
        </label>
        <label className={etiqueta}>
          Fecha del pago del cliente
          <input type="date" value={f.causada_en} max={hoyBogota()} onChange={(e) => setF({ ...f, causada_en: e.target.value })} className={input} />
        </label>
      </div>
      <p className="text-xs text-slate-600">
        {plan?.base === "utilidad" && f.tipo === "proyecto"
          ? "Base: la utilidad que corresponde a lo que el cliente pagó, no el valor del contrato."
          : "Base: lo que el cliente pagó en este pago (con IVA, igual que lo precia el cotizador). Si pagó la mitad, la comisión es la mitad."}
      </p>
      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-900">
        Comisión: <span className="font-bold">{formatCOP(valor)}</span>
        {tope != null && bruto > tope && <span className="text-xs text-amber-800"> (recortada por el tope del plan; ya se causaron {formatCOP(usado)} en este proyecto)</span>}
      </p>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <Botones onCancelar={() => setAbierto(false)} deshabilitado={pendiente || !f.referido || !f.concepto.trim() || !base || !pctUsado} onGuardar={guardar} texto={pendiente ? "Guardando…" : "Causar comisión"} />
    </section>
  );
}

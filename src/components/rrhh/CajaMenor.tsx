"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, ElegirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { carpetaCaja, type CajaMenor, type FotoCaja, type GastoCaja } from "@/lib/caja-menor";
import { BUCKET_SOPORTES, fechaCorta, leerMonto, pesos } from "@/lib/rrhh-registros";

const C = "mt-0.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
const L = "block text-sm text-slate-600";

/**
 * Asignado / gastado / saldo. El saldo es lo primero que se ve; si se pasó, en rojo con el
 * excedente (no se bloquea: el gasto tiene que quedar registrado).
 */
export function ResumenSaldo({ caja, grande }: { caja: CajaMenor; grande?: boolean }) {
  const negativo = Number(caja.saldo) < 0;
  return (
    <div className={`rounded-xl border-2 p-3 ${negativo ? "border-red-500 bg-red-50" : "border-green-600 bg-green-50"}`}>
      <p className={`text-sm font-semibold ${negativo ? "text-red-800" : "text-green-800"}`}>{negativo ? "Te pasaste del saldo" : "Te queda"}</p>
      <p className={`${grande ? "text-3xl" : "text-2xl"} font-bold ${negativo ? "text-red-700" : "text-green-800"}`}>{pesos(Number(caja.saldo))}</p>
      {negativo && (
        <p className="text-sm font-semibold text-red-800">Excedente: {pesos(Number(caja.excedente))} por encima de lo asignado.</p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <p>
          <span className="block text-slate-600">Asignado</span>
          <span className="font-semibold">{pesos(Number(caja.monto_asignado))}</span>
        </p>
        <p>
          <span className="block text-slate-600">Gastado</span>
          <span className="font-semibold">{pesos(Number(caja.gastado))}</span>
        </p>
      </div>
    </div>
  );
}

/** Registrar un gasto: concepto, documento soporte, valor, fecha y foto de la factura. */
export function FormGastoCaja({ caja, hoy, onListo }: { caja: CajaMenor; hoy: string; onListo?: () => void }) {
  const router = useRouter();
  const [concepto, setConcepto] = useState("");
  const [documento, setDocumento] = useState("");
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const monto = leerMonto(valor);
  const saldoDespues = monto !== null ? Number(caja.saldo) - monto : null;
  const falta = !concepto.trim() ? "Falta en qué se gastó." : monto === null ? "Falta el valor." : !fecha ? "Falta la fecha." : fecha > hoy ? "La fecha no puede ser futura." : null;

  function guardar() {
    if (falta) return;
    setError(null);
    setAviso(null);
    empezar(async () => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("caja_menor_lineas")
        .insert({ recibo_id: caja.id, concepto: concepto.trim(), documento_soporte: documento.trim() || null, valor: monto, fecha })
        .select("id")
        .single();
      if (e) return setError(e.message);
      let sinFoto = false;
      if (foto) {
        try {
          const s = await subirSoporte(carpetaCaja(caja.id), foto, BUCKET_SOPORTES);
          const { error: e2 } = await supabase
            .from("caja_menor_soportes")
            .insert({ recibo_id: caja.id, linea_id: data.id, storage_path: s.path, nombre_archivo: s.nombre, mime: s.mime, bytes: s.bytes });
          if (e2) throw new Error(e2.message);
        } catch (x) {
          sinFoto = true;
          setError(`El gasto quedó registrado, pero la foto no se subió: ${x instanceof Error ? x.message : String(x)}. Vuelve a adjuntarla desde el gasto.`);
        }
      }
      setConcepto("");
      setDocumento("");
      setValor("");
      setFecha(hoy);
      setFoto(null);
      if (!sinFoto) setAviso(foto ? "Gasto registrado con su foto." : "Gasto registrado. Si tienes la factura, adjúntale la foto.");
      router.refresh();
      onListo?.();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3">
      <label className={L}>
        En qué se gastó *
        <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Hotel, alimentación, transporte…" className={C} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={L}>
          Valor *
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="numeric" placeholder="$ 0" className={C} />
        </label>
        <label className={L}>
          Fecha
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={C} />
        </label>
      </div>
      {monto !== null && (
        <p className={`text-sm ${saldoDespues !== null && saldoDespues < 0 ? "font-semibold text-red-700" : "text-slate-600"}`}>
          {pesos(monto)} · te quedaría {pesos(saldoDespues ?? 0)}
          {saldoDespues !== null && saldoDespues < 0 ? " (te pasas: igual se registra y RRHH lo ve)" : ""}
        </p>
      )}
      <label className={L}>
        Documento soporte
        <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Factura, cuenta de cobro o relación (n.º)" className={C} />
      </label>
      <div>
        <p className={L}>Foto de la factura</p>
        {foto ? (
          <p className="mt-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate">📷 {foto.name}</span>
            <button type="button" onClick={() => setFoto(null)} className="text-sm font-semibold underline">
              Quitar
            </button>
          </p>
        ) : (
          <div className="mt-1">
            <ElegirArchivo onElegido={setFoto} textoFoto="📷 Tomar foto" textoArchivo="Elegir archivo" />
          </div>
        )}
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{aviso}</p>}
      <button
        type="button"
        onClick={guardar}
        disabled={pendiente || falta !== null}
        className="min-h-11 w-full rounded-lg bg-slate-900 text-base font-semibold text-white disabled:opacity-40"
      >
        {pendiente ? "Guardando…" : "Registrar gasto"}
      </button>
      {falta && !pendiente && <p className="text-center text-sm text-slate-500">{falta}</p>}
    </div>
  );
}

/**
 * Los gastos registrados, con su foto y quién los registró. Se anulan con motivo (no se
 * editan); uno anulado no suma al saldo y queda a la vista tachado.
 */
export function ListaGastosCaja({
  caja,
  gastos,
  fotos,
  quien,
  puedeOperar,
}: {
  caja: CajaMenor;
  gastos: GastoCaja[];
  fotos: FotoCaja[];
  /** Nombre de quien registró (para RRHH); sin esto no se muestra. */
  quien?: (perfilId: string | null) => string;
  /** Anular y adjuntar: con la caja abierta y sin anular. */
  puedeOperar: boolean;
}) {
  if (gastos.length === 0) return <p className="text-sm text-slate-500">Todavía no hay gastos registrados en esta caja.</p>;
  return (
    <ul className="space-y-2">
      {gastos.map((g) => (
        <FilaGasto key={g.id} caja={caja} g={g} fotos={fotos.filter((f) => f.linea_id === g.id)} quien={quien} puedeOperar={puedeOperar} />
      ))}
    </ul>
  );
}

function FilaGasto({
  caja,
  g,
  fotos,
  quien,
  puedeOperar,
}: {
  caja: CajaMenor;
  g: GastoCaja;
  fotos: FotoCaja[];
  quien?: (perfilId: string | null) => string;
  puedeOperar: boolean;
}) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [adjuntando, setAdjuntando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const anulada = !!g.anulada_en;

  return (
    <li className={`rounded-xl border border-slate-300 bg-white p-3 ${anulada ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-base font-semibold ${anulada ? "line-through" : ""}`}>{g.concepto}</p>
          <p className="text-sm text-slate-600">
            {fechaCorta(g.fecha)}
            {g.documento_soporte ? ` · ${g.documento_soporte}` : ""}
            {quien ? ` · ${quien(g.registrado_por)}` : ""}
          </p>
        </div>
        <p className={`shrink-0 text-base font-bold ${anulada ? "line-through" : ""}`}>{pesos(Number(g.valor))}</p>
      </div>
      {anulada && <p className="mt-1 text-sm text-slate-700">Anulado: {g.motivo_anulacion} (no suma al saldo)</p>}
      <div className="mt-1 flex flex-wrap gap-x-3 text-sm">
        {fotos.length === 0 ? (
          <span className="text-amber-700">Sin foto de la factura</span>
        ) : (
          fotos.map((f, i) => (
            <AbrirArchivo key={f.storage_path} path={f.storage_path}>
              📷 Factura{fotos.length > 1 ? ` ${i + 1}` : ""}
            </AbrirArchivo>
          ))
        )}
      </div>
      {!anulada && puedeOperar && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          {anulando ? (
            <div className="space-y-1">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se anula (ej. valor mal digitado)" className={C} />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setAnulando(false)} className="min-h-11 rounded-lg border border-slate-300 text-sm font-semibold">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendiente || !motivo.trim()}
                  onClick={() =>
                    empezar(async () => {
                      setError(null);
                      const { error: e } = await createClient().from("caja_menor_lineas").update({ motivo_anulacion: motivo.trim() }).eq("id", g.id);
                      if (e) return setError(e.message);
                      router.refresh();
                    })
                  }
                  className="min-h-11 rounded-lg bg-red-700 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Anular gasto
                </button>
              </div>
              {!motivo.trim() && <p className="text-sm text-slate-500">Escribe por qué se anula. No se borra: queda el rastro de la corrección.</p>}
            </div>
          ) : adjuntando ? (
            <ElegirArchivo
              textoFoto="📷 Tomar foto"
              onElegido={(f) => {
                setAdjuntando(false);
                empezar(async () => {
                  setError(null);
                  try {
                    const s = await subirSoporte(carpetaCaja(caja.id), f, BUCKET_SOPORTES);
                    const { error: e } = await createClient()
                      .from("caja_menor_soportes")
                      .insert({ recibo_id: caja.id, linea_id: g.id, storage_path: s.path, nombre_archivo: s.nombre, mime: s.mime, bytes: s.bytes });
                    if (e) throw new Error(e.message);
                    router.refresh();
                  } catch (x) {
                    setError(x instanceof Error ? x.message : String(x));
                  }
                });
              }}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={pendiente} onClick={() => setAdjuntando(true)} className="min-h-11 rounded-lg border border-slate-400 text-sm font-semibold disabled:opacity-40">
                {fotos.length ? "Otra foto" : "Adjuntar foto"}
              </button>
              <button type="button" disabled={pendiente} onClick={() => setAnulando(true)} className="min-h-11 rounded-lg border border-red-300 text-sm font-semibold text-red-800 disabled:opacity-40">
                Anular
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </li>
  );
}

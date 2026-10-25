"use client";

import { useState } from "react";
import { FormGastoCaja, ListaGastosCaja, ResumenSaldo } from "@/components/rrhh/CajaMenor";
import type { CajaMenor, FotoCaja, GastoCaja } from "@/lib/caja-menor";
import { fechaCorta } from "@/lib/rrhh-registros";

/**
 * Abiertas: el saldo arriba (lo primero que se ve), el botón grande de agregar gasto y lo ya
 * registrado. Cerradas: solo para consultar (historial), sin registrar ni anular.
 */
export function CajaMenorTecnico({
  abiertas,
  cerradas,
  gastos,
  fotos,
  hoy,
}: {
  abiertas: CajaMenor[];
  cerradas: CajaMenor[];
  gastos: GastoCaja[];
  fotos: FotoCaja[];
  hoy: string;
}) {
  const de = (c: CajaMenor) => ({ gastos: gastos.filter((g) => g.recibo_id === c.id), fotos: fotos.filter((f) => f.recibo_id === c.id) });
  return (
    <div className="space-y-6">
      {abiertas.map((c) => (
        <Caja key={c.id} caja={c} {...de(c)} hoy={hoy} />
      ))}
      {cerradas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-slate-600">Cajas cerradas (historial)</h2>
          <p className="text-sm text-slate-600">RRHH ya las legalizó: se consultan, ya no se registra ni se anula nada en ellas.</p>
          {cerradas.map((c) => (
            <Cerrada key={c.id} caja={c} {...de(c)} />
          ))}
        </section>
      )}
    </div>
  );
}

function Caja({ caja, gastos, fotos, hoy }: { caja: CajaMenor; gastos: GastoCaja[]; fotos: FotoCaja[]; hoy: string }) {
  const [agregando, setAgregando] = useState(false);
  return (
    <section className="space-y-3">
      <div>
        <p className="text-base font-semibold text-slate-900">{caja.concepto}</p>
        <p className="text-sm text-slate-600">Entregada el {fechaCorta(caja.fecha_entrega)}</p>
      </div>
      <ResumenSaldo caja={caja} grande />
      {agregando ? (
        <>
          <FormGastoCaja caja={caja} hoy={hoy} />
          <button type="button" onClick={() => setAgregando(false)} className="min-h-11 w-full rounded-lg border-2 border-slate-300 text-sm font-semibold">
            Cerrar el formulario
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setAgregando(true)} className="min-h-11 w-full rounded-lg bg-slate-900 text-base font-semibold text-white">
          + Agregar gasto
        </button>
      )}
      <h2 className="pt-2 text-sm font-bold uppercase text-slate-600">Lo que llevas registrado</h2>
      <ListaGastosCaja caja={caja} gastos={gastos} fotos={fotos} puedeOperar />
    </section>
  );
}

function Cerrada({ caja, gastos, fotos }: { caja: CajaMenor; gastos: GastoCaja[]; fotos: FotoCaja[] }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-3">
      <button type="button" onClick={() => setAbierta((a) => !a)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-slate-900">{caja.concepto}</span>
          <span className="block text-sm text-slate-600">
            Entregada el {fechaCorta(caja.fecha_entrega)} · cerrada el {fechaCorta(caja.cerrada_en)}
          </span>
        </span>
        <span className="shrink-0 text-sm text-slate-500">{abierta ? "▲" : "▼"}</span>
      </button>
      {abierta && (
        <div className="mt-2 space-y-3">
          <ResumenSaldo caja={caja} />
          <ListaGastosCaja caja={caja} gastos={gastos} fotos={fotos} puedeOperar={false} />
        </div>
      )}
    </div>
  );
}

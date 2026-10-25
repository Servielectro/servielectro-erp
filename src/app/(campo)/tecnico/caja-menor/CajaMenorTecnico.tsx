"use client";

import { useState } from "react";
import { FormGastoCaja, ListaGastosCaja, ResumenSaldo } from "@/components/rrhh/CajaMenor";
import type { CajaMenor, FotoCaja, GastoCaja } from "@/lib/caja-menor";
import { fechaCorta } from "@/lib/rrhh-registros";

/** El saldo arriba (lo primero que se ve), el botón grande de agregar gasto y lo ya registrado. */
export function CajaMenorTecnico({ cajas, gastos, fotos, hoy }: { cajas: CajaMenor[]; gastos: GastoCaja[]; fotos: FotoCaja[]; hoy: string }) {
  return (
    <div className="space-y-6">
      {cajas.map((c) => (
        <Caja key={c.id} caja={c} gastos={gastos.filter((g) => g.recibo_id === c.id)} fotos={fotos.filter((f) => f.recibo_id === c.id)} hoy={hoy} />
      ))}
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

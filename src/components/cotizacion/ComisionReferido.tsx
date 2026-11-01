"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hoyColombia } from "@/lib/crm";

// Referenciados (migración 127): si el cliente de la cotización lo registró un referido y el
// registro sigue vigente, se muestra quién y con qué plan, y se puede cargar el % del plan en
// pct_comision_comercial. Es un gasto interno: el documento del cliente no lo muestra.

interface Plan {
  nombre: string;
  base: "utilidad" | "precio_con_comision";
  porcentaje: number;
  causa: "recaudo" | "firma";
}
interface Registro {
  id: string;
  vence_el: string;
  referidos: { nombre: string; estado: string; referido_planes: Plan | null } | null;
}

const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;

export function ComisionReferido({
  clienteId,
  clienteNit,
  pctActual,
  onUsar,
}: {
  clienteId: string | null;
  clienteNit: string;
  pctActual: number;
  onUsar: (v: number) => void;
}) {
  const nit = clienteNit.split("-")[0].replace(/\D/g, "");
  const clave = `${clienteId ?? ""}|${nit}`;
  const [resultado, setResultado] = useState<{ clave: string; registro: Registro | null } | null>(null);

  useEffect(() => {
    if (!clienteId && !nit) return;
    let vivo = true;
    // clienteId es un uuid y nit solo dígitos: no hay forma de colar otro filtro en el .or().
    const filtros = [clienteId && `cliente_id.eq.${clienteId}`, nit && `nit_prospecto.eq.${nit}`].filter(Boolean).join(",");
    createClient()
      .from("referido_registros")
      .select("id, vence_el, referidos(nombre, estado, referido_planes(nombre, base, porcentaje, causa))")
      .eq("estado", "vigente")
      .or(filtros)
      .limit(1)
      .then(({ data }) => {
        if (vivo) setResultado({ clave, registro: ((data ?? []) as unknown as Registro[])[0] ?? null });
      });
    return () => {
      vivo = false;
    };
  }, [clienteId, nit, clave]);

  const registro = resultado?.clave === clave ? resultado.registro : null;
  if (!registro?.referidos) return null;
  const { referidos: ref } = registro;
  const plan = ref.referido_planes;
  const vencido = registro.vence_el < hoyColombia();
  const porcentaje = plan ? Number(plan.porcentaje) : 0;

  return (
    <div className="rounded-md border border-violet-300 bg-violet-50 p-2 text-xs text-violet-950">
      <p>
        <span className="font-semibold">Este cliente lo registró un referido: {ref.nombre}</span>
        {vencido ? ` · el registro venció el ${registro.vence_el}` : ` · registro vigente hasta el ${registro.vence_el}`}
      </p>
      {!plan ? (
        <p className="mt-1">El referido no tiene plan asignado: asígnalo en Administrativo → Referenciados.</p>
      ) : plan.base === "precio_con_comision" ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span>
            Plan «{plan.nombre}»: {pct(porcentaje)} preciado dentro de la cotización, se causa con el {plan.causa}.
          </span>
          {Math.abs(pctActual - porcentaje) < 1e-9 ? (
            <span className="font-semibold text-green-800">✓ Ya está cargado</span>
          ) : (
            <button type="button" onClick={() => onUsar(porcentaje)} className="min-h-9 rounded-md border border-violet-400 bg-white px-2 font-semibold">
              Usar {pct(porcentaje)} del plan
            </button>
          )}
        </div>
      ) : (
        // La comisión del cotizador es un % del total con IVA; un % de la utilidad no se copia tal cual.
        <p className="mt-1">
          Plan «{plan.nombre}»: {pct(porcentaje)} de la utilidad. No se carga solo, porque «Comisión comercial %» es un porcentaje del total con IVA:
          un {pct(porcentaje)} de la utilidad es mucho menos. Se liquida aparte en Comisiones.
        </p>
      )}
      <p className="mt-1 text-violet-800">Solo para uso interno: el documento que recibe el cliente no muestra la comisión.</p>
    </div>
  );
}

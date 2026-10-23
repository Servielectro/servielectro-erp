"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FORMAS_PAGO, TIPO_CONTRATO } from "@/lib/contratos";
import { TIPOS_DOC_IDENTIDAD } from "@/lib/personal";
import { leerMonto, pesos } from "@/lib/rrhh-registros";

const C = "mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const L = "block text-xs text-slate-600";

type EmpleadoOpcion = { id: string; nombre: string; tipo_documento: string; numero_documento: string; salario: number; tipo_contrato: string | null; cargo: string | null; ciudad: string | null };

export function GenerarContrato({
  plantillas,
  empleados,
  empleadoInicial,
  hoy,
}: {
  plantillas: { id: string; tipo: string; nombre: string }[];
  empleados: EmpleadoOpcion[];
  empleadoInicial: string;
  hoy: string;
}) {
  const router = useRouter();
  const inicial = empleados.find((e) => e.id === empleadoInicial);
  const [tipo, setTipo] = useState(inicial?.tipo_contrato ?? "termino_fijo");
  const [plantilla, setPlantilla] = useState(plantillas.find((p) => p.tipo === (inicial?.tipo_contrato ?? "termino_fijo"))?.id ?? "");
  const [origen, setOrigen] = useState<"empleado" | "externo">("empleado");
  const [empleado, setEmpleado] = useState(empleadoInicial);
  const [d, setD] = useState({
    trabajador: "",
    tipoDoc: inicial?.tipo_documento ?? "CC",
    documento: inicial?.numero_documento ?? "",
    salario: inicial ? String(Math.round(inicial.salario)) : "",
    ciudad: inicial?.ciudad ?? "",
    fecha: hoy,
    inicio: "",
    fin: "",
    objeto: inicial?.cargo ?? "",
    formaPago: "",
    detallePago: "",
    plazo: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const del = plantillas.filter((p) => p.tipo === tipo);
  const forma = FORMAS_PAGO.find((f) => f.id === d.formaPago);

  function elegirEmpleado(id: string) {
    setEmpleado(id);
    const e = empleados.find((x) => x.id === id);
    if (e) {
      setD((p) => ({ ...p, tipoDoc: e.tipo_documento, documento: e.numero_documento, salario: String(Math.round(e.salario)), ciudad: p.ciudad || (e.ciudad ?? ""), objeto: p.objeto || (e.cargo ?? "") }));
      if (e.tipo_contrato) elegirTipo(e.tipo_contrato);
    }
  }
  function elegirTipo(t: string) {
    setTipo(t);
    setPlantilla(plantillas.find((p) => p.tipo === t)?.id ?? "");
  }

  const falta = origen === "empleado" && !empleado ? "Elige el colaborador." : origen === "externo" && !d.trabajador.trim() ? "Escribe el trabajador (nombre o razón social)." : d.inicio && d.fin && d.fin < d.inicio ? "La fecha de fin es antes del inicio." : null;

  return (
    <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className={L}>
          Tipo de documento
          <select value={tipo} onChange={(e) => elegirTipo(e.target.value)} className={C}>
            {Object.entries(TIPO_CONTRATO).map(([k, v]) => (
              <option key={k} value={k}>
                {k === "prestacion_servicios" ? "Contrato de prestación de servicios" : `Laboral · ${v}`}
              </option>
            ))}
          </select>
        </label>
        <label className={L}>
          Plantilla
          <select value={plantilla} onChange={(e) => setPlantilla(e.target.value)} className={C}>
            <option value="">Sin plantilla (contrato vacío)</option>
            {del.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">Solo valores base · no es el contrato.</span>
        </label>
        <label className={L}>
          Origen
          <select value={origen} onChange={(e) => setOrigen(e.target.value as "empleado" | "externo")} className={C}>
            <option value="empleado">Empleado (nómina)</option>
            <option value="externo">Externo (no está en Personal)</option>
          </select>
        </label>
        {origen === "empleado" ? (
          <label className={L}>
            Empleado
            <select value={empleado} onChange={(e) => elegirEmpleado(e.target.value)} className={C}>
              <option value="">Elegir…</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            {empleados.length === 0 && <span className="text-xs text-slate-500">No hay fichas en Personal todavía.</span>}
          </label>
        ) : (
          <label className={L}>
            Trabajador (razón social)
            <input value={d.trabajador} onChange={(e) => setD({ ...d, trabajador: e.target.value })} className={C} />
          </label>
        )}
        <label className={L}>
          Tipo documento
          <select value={d.tipoDoc} onChange={(e) => setD({ ...d, tipoDoc: e.target.value })} className={C}>
            {TIPOS_DOC_IDENTIDAD.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className={L}>
          Documento
          <input value={d.documento} onChange={(e) => setD({ ...d, documento: e.target.value })} className={C} />
        </label>
        <label className={L}>
          Salario (COP)
          <input value={d.salario} onChange={(e) => setD({ ...d, salario: e.target.value })} inputMode="numeric" className={C} />
          {leerMonto(d.salario) !== null && <span className="text-xs text-slate-500">{pesos(leerMonto(d.salario)!)}</span>}
        </label>
        <label className={L}>
          Ciudad de firma
          <input value={d.ciudad} onChange={(e) => setD({ ...d, ciudad: e.target.value })} className={C} />
        </label>
        <label className={L}>
          Fecha del contrato
          <input type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} className={C} />
        </label>
        <span />
        <label className={L}>
          Inicio
          <input type="date" value={d.inicio} onChange={(e) => setD({ ...d, inicio: e.target.value })} className={C} />
        </label>
        <label className={L}>
          Fin {tipo === "indefinido" ? "(no aplica)" : ""}
          <input type="date" value={d.fin} disabled={tipo === "indefinido"} onChange={(e) => setD({ ...d, fin: e.target.value })} className={C} />
        </label>
      </div>
      <label className={L}>
        Objeto del contrato
        <textarea value={d.objeto} onChange={(e) => setD({ ...d, objeto: e.target.value })} rows={2} className={C} />
      </label>

      <div className="rounded-md bg-slate-50 p-2">
        <p className="text-xs font-semibold text-slate-700">Desde la cotización (forma de pago y plazo)</p>
        <p className="text-xs text-slate-500">
          Más adelante, al elegir una cotización aprobada se cargarán solos las cláusulas comerciales, pólizas, forma de pago y plazo según lo cotizado. Por
          ahora se escriben acá.
        </p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <label className={L}>
            Forma de pago
            <select value={d.formaPago} onChange={(e) => setD({ ...d, formaPago: e.target.value })} className={C}>
              <option value="">—</option>
              {FORMAS_PAGO.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={L}>
            Plazo de ejecución
            <input value={d.plazo} onChange={(e) => setD({ ...d, plazo: e.target.value })} className={C} />
          </label>
        </div>
        {forma?.hitos && <p className="mt-1 text-xs text-slate-600">{forma.hitos}</p>}
        {d.formaPago && (
          <label className={`${L} mt-1`}>
            Detalle de la forma de pago
            <input value={d.detallePago} onChange={(e) => setD({ ...d, detallePago: e.target.value })} className={C} />
          </label>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button
        type="button"
        disabled={pendiente || falta !== null}
        onClick={() =>
          empezar(async () => {
            setError(null);
            const { data, error: e } = await createClient().rpc("fn_crear_contrato_laboral", {
              p_datos: {
                tipo,
                plantilla_id: plantilla,
                origen,
                empleado_id: origen === "empleado" ? empleado : "",
                trabajador: origen === "externo" ? d.trabajador.trim() : "",
                tipo_documento: d.tipoDoc,
                documento: d.documento.trim(),
                salario: leerMonto(d.salario) === null ? "" : String(leerMonto(d.salario)),
                ciudad_firma: d.ciudad.trim(),
                fecha_contrato: d.fecha,
                fecha_inicio: d.inicio,
                fecha_fin: tipo === "indefinido" ? "" : d.fin,
                objeto: d.objeto.trim(),
                forma_pago: d.formaPago,
                forma_pago_detalle: d.detallePago.trim(),
                plazo_ejecucion: d.plazo.trim(),
              },
            });
            if (e) return setError(e.message);
            router.push(`/rrhh/contratos/${data}`);
          })
        }
        className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pendiente ? "Generando…" : "Generar contrato (borrador)"}
      </button>
      {falta && <p className="text-center text-xs text-slate-500">{falta}</p>}
    </div>
  );
}

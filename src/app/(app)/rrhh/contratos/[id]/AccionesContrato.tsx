"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, BUCKET_PERSONAL, ElegirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { FORMAS_PAGO } from "@/lib/contratos";
import { leerMonto, pesos } from "@/lib/rrhh-registros";

const C = "mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const L = "block text-xs text-slate-600";
const BOTON = "min-h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40";
const BOTON2 = "min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold disabled:opacity-40";

export interface DatosContrato {
  id: string;
  tipo: string;
  estado: string;
  documento: string | null;
  tipo_documento: string | null;
  salario: number | null;
  ciudad_firma: string | null;
  fecha_contrato: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  objeto: string | null;
  forma_pago: string | null;
  forma_pago_detalle: string | null;
  plazo_ejecucion: string | null;
  archivo_firmado_path: string | null;
  notas: string | null;
}

/** Datos del contrato: editables en borrador; firmado, solo se ven (los cambios van por Otro sí). */
export function DatosContratoForm({ c }: { c: DatosContrato }) {
  const router = useRouter();
  const editable = c.estado === "borrador";
  const inicial = {
    documento: c.documento ?? "",
    salario: c.salario === null ? "" : String(Math.round(Number(c.salario))),
    ciudad: c.ciudad_firma ?? "",
    fecha: c.fecha_contrato ?? "",
    inicio: c.fecha_inicio ?? "",
    fin: c.fecha_fin ?? "",
    objeto: c.objeto ?? "",
    formaPago: c.forma_pago ?? "",
    detallePago: c.forma_pago_detalle ?? "",
    plazo: c.plazo_ejecucion ?? "",
  };
  const [d, setD] = useState(inicial);
  const cambio = JSON.stringify(d) !== JSON.stringify(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const forma = FORMAS_PAGO.find((f) => f.id === d.formaPago);
  const campo = (k: keyof typeof d, etiqueta: string, tipo = "text") => (
    <label className={L}>
      {etiqueta}
      <input type={tipo} disabled={!editable} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} className={`${C} disabled:bg-slate-50`} />
    </label>
  );
  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        {campo("documento", `Documento (${c.tipo_documento ?? "—"})`)}
        <label className={L}>
          Salario (COP)
          <input disabled={!editable} value={d.salario} onChange={(e) => setD({ ...d, salario: e.target.value })} inputMode="numeric" className={`${C} disabled:bg-slate-50`} />
          {leerMonto(d.salario) !== null && <span className="text-xs text-slate-500">{pesos(leerMonto(d.salario)!)}</span>}
        </label>
        {campo("ciudad", "Ciudad de firma")}
        {campo("fecha", "Fecha del contrato", "date")}
        {campo("inicio", "Inicio", "date")}
        {campo("fin", "Fin", "date")}
      </div>
      <label className={L}>
        Objeto del contrato
        <textarea disabled={!editable} value={d.objeto} onChange={(e) => setD({ ...d, objeto: e.target.value })} rows={2} className={`${C} disabled:bg-slate-50`} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={L}>
          Forma de pago
          <select disabled={!editable} value={d.formaPago} onChange={(e) => setD({ ...d, formaPago: e.target.value })} className={`${C} disabled:bg-slate-50`}>
            <option value="">—</option>
            {FORMAS_PAGO.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </label>
        {campo("plazo", "Plazo de ejecución")}
      </div>
      {forma?.hitos && <p className="text-xs text-slate-600">{forma.hitos}</p>}
      {campo("detallePago", "Detalle de la forma de pago")}
      {editable && cambio && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const { error: e } = await createClient()
                .from("contratos_laborales")
                .update({
                  documento: d.documento.trim() || null,
                  salario: leerMonto(d.salario),
                  ciudad_firma: d.ciudad.trim() || null,
                  fecha_contrato: d.fecha || null,
                  fecha_inicio: d.inicio || null,
                  fecha_fin: d.fin || null,
                  objeto: d.objeto.trim() || null,
                  forma_pago: d.formaPago || null,
                  forma_pago_detalle: d.detallePago.trim() || null,
                  plazo_ejecucion: d.plazo.trim() || null,
                })
                .eq("id", c.id);
              if (e) return setError(e.message);
              router.refresh();
            })
          }
          className={BOTON}
        >
          Guardar datos
        </button>
      )}
      {!editable && <p className="text-xs text-slate-500">El contrato ya no está en borrador: sus datos no se cambian. Para modificarlo, haga un Otro sí.</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </div>
  );
}

/** Pasar a vigente, subir el firmado, terminar, anular un borrador, Renovar y Otro sí. */
export function AccionesContrato({ c, hoy }: { c: DatosContrato; hoy: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const [nuevo, setNuevo] = useState<"renovacion" | "otro_si" | null>(null);
  const [fechas, setFechas] = useState({ fecha: hoy, inicio: "", fin: "" });
  const [archivo, setArchivo] = useState<File | null>(null);

  const actualizar = (cambios: Record<string, unknown>, pregunta?: string) =>
    empezar(async () => {
      if (pregunta && !window.confirm(pregunta)) return;
      setError(null);
      const { error: e } = await createClient().from("contratos_laborales").update(cambios).eq("id", c.id);
      if (e) return setError(e.message);
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        <a href={`/rrhh/contratos/${c.id}/imprimir`} target="_blank" rel="noreferrer" className={`${BOTON2} inline-flex items-center`}>
          Ver / imprimir PDF
        </a>
        {c.estado === "borrador" && (
          <>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => actualizar({ estado: "vigente" }, "¿Pasar el contrato a vigente? Después no se edita: los cambios van por Otro sí.")}
              className={BOTON}
            >
              Pasar a vigente
            </button>
            <button type="button" disabled={pendiente} onClick={() => actualizar({ estado: "anulado" }, "¿Anular este borrador?")} className={`${BOTON2} text-red-800`}>
              Anular borrador
            </button>
          </>
        )}
        {c.estado === "vigente" && (
          <>
            <button type="button" disabled={pendiente} onClick={() => setNuevo("renovacion")} className={BOTON2}>
              Renovar
            </button>
            <button type="button" disabled={pendiente} onClick={() => setNuevo("otro_si")} className={BOTON2}>
              Otro sí
            </button>
            <button type="button" disabled={pendiente} onClick={() => actualizar({ estado: "terminado" }, "¿Marcar el contrato como terminado?")} className={`${BOTON2} text-red-800`}>
              Terminar
            </button>
          </>
        )}
      </div>
      {c.estado === "terminado" && <p className="text-xs text-slate-500">Contrato terminado: ya no se renueva ni se modifica.</p>}

      {nuevo && (
        <div className="space-y-2 rounded-md bg-slate-50 p-2">
          <p className="text-xs font-semibold">
            {nuevo === "renovacion" ? "Renovar: copia este contrato con sus cláusulas para un nuevo periodo." : "Otro sí: copia este contrato para modificarlo; el original queda igual."}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <label className={L}>
              Fecha
              <input type="date" value={fechas.fecha} onChange={(e) => setFechas({ ...fechas, fecha: e.target.value })} className={C} />
            </label>
            <label className={L}>
              Inicio
              <input type="date" value={fechas.inicio} onChange={(e) => setFechas({ ...fechas, inicio: e.target.value })} className={C} />
            </label>
            <label className={L}>
              Fin
              <input type="date" value={fechas.fin} onChange={(e) => setFechas({ ...fechas, fin: e.target.value })} className={C} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setNuevo(null)} className={`${BOTON2} flex-1`}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                empezar(async () => {
                  setError(null);
                  const { data, error: e } = await createClient().rpc("fn_crear_contrato_laboral", {
                    p_datos: { clase: nuevo, contrato_padre_id: c.id, fecha_contrato: fechas.fecha, fecha_inicio: fechas.inicio, fecha_fin: fechas.fin },
                  });
                  if (e) return setError(e.message);
                  router.push(`/rrhh/contratos/${data}`);
                })
              }
              className={`${BOTON} flex-1`}
            >
              Crear {nuevo === "renovacion" ? "renovación" : "otro sí"} (borrador)
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-2">
        <p className="text-xs font-semibold text-slate-700">Contrato firmado (PDF)</p>
        {c.archivo_firmado_path ? (
          <AbrirArchivo bucket={BUCKET_PERSONAL} path={c.archivo_firmado_path}>
            📎 Ver el firmado
          </AbrirArchivo>
        ) : c.estado === "vigente" || c.estado === "terminado" ? (
          <div className="mt-1 space-y-1">
            {archivo ? (
              <p className="text-xs">
                📎 {archivo.name}{" "}
                <button type="button" onClick={() => setArchivo(null)} className="underline">
                  Quitar
                </button>
              </p>
            ) : (
              <ElegirArchivo onElegido={setArchivo} textoFoto="📷 Foto" textoArchivo="PDF firmado" />
            )}
            <button
              type="button"
              disabled={pendiente || !archivo}
              onClick={() =>
                empezar(async () => {
                  setError(null);
                  try {
                    const s = await subirSoporte(`contratos/${c.id}`, archivo!, BUCKET_PERSONAL);
                    const { error: e } = await createClient().from("contratos_laborales").update({ archivo_firmado_path: s.path }).eq("id", c.id);
                    if (e) throw new Error(e.message);
                    setArchivo(null);
                    router.refresh();
                  } catch (x) {
                    setError(x instanceof Error ? x.message : String(x));
                  }
                })
              }
              className={BOTON}
            >
              Subir firmado
            </button>
            {!archivo && <span className="ml-2 text-xs text-slate-500">Elige el archivo primero.</span>}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Se sube cuando el contrato esté vigente (firmado).</p>
        )}
      </div>
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </div>
  );
}

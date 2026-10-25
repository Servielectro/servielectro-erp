"use client";

// Caja menor en la ficha, lado RRHH (migraciones 66 y 69): viáticos para obra fuera de la ciudad.
// RRHH crea la caja con el monto asignado; el técnico (si la ficha está enlazada a su usuario)
// registra cada gasto con la foto desde su app, y acá se ve en vivo. RRHH puede ajustar el monto
// mientras esté abierta y la cierra al legalizar. No es salario ni entra al desprendible.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo, ElegirArchivo, subirSoporte } from "@/components/rrhh/archivos";
import { FormGastoCaja, ListaGastosCaja, ResumenSaldo } from "@/components/rrhh/CajaMenor";
import { carpetaCaja, type CajaMenor, type FotoCaja, type GastoCaja } from "@/lib/caja-menor";
import { BUCKET_SOPORTES, fechaCorta, leerMonto, pesos } from "@/lib/rrhh-registros";
import { AvisoPrevia, Bloque } from "./TabDatos";

const C = "mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const L = "block text-xs text-slate-600";
const BOTON = "min-h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40";
const BOTON2 = "min-h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40";

export function TabCajaMenor({
  empleadoId,
  perfilId,
  previa,
  cajas,
  gastos,
  fotos,
  proyectos,
  hoy,
}: {
  empleadoId: string;
  /** Usuario del ERP enlazado: sin él, el técnico no ve la caja en su app. */
  perfilId: string | null;
  previa?: boolean;
  cajas: CajaMenor[];
  gastos: GastoCaja[];
  fotos: FotoCaja[];
  proyectos: { id: string; codigo: string; nombre: string }[];
  hoy: string;
}) {
  const router = useRouter();
  const [concepto, setConcepto] = useState("");
  const [proyecto, setProyecto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const valor = leerMonto(monto);
  const falta = !concepto.trim() ? "Falta para qué se entrega el dinero." : valor === null ? "Falta el monto asignado." : null;
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, `${p.nombre} (${p.codigo})`]));

  return (
    <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900 lg:col-span-2">
        Caja menor = viáticos para obra fuera de la ciudad (estadía, alimentación…). Las compras de material en la ciudad van por Gastos. No constituye
        salario ni entra al desprendible de nómina.
      </p>
      {!previa && !perfilId && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 lg:col-span-2">
          Esta ficha no está enlazada a un usuario del ERP: <span className="font-semibold">el técnico no verá su caja menor en la app</span>. Enlázala en la
          pestaña Accesos.
        </p>
      )}

      <Bloque titulo="Asignar caja menor">
        <label className={L}>
          Concepto
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Para qué se entrega el dinero" className={C} />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className={L}>
            Monto asignado *
            <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" placeholder="$ 0" className={C} />
            {valor !== null && <span className="text-xs text-slate-500">{pesos(valor)}</span>}
          </label>
          <label className={L}>
            Fecha de entrega
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={C} />
          </label>
        </div>
        <label className={`${L} mt-2`}>
          Obra (fuera de la ciudad)
          <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={C}>
            <option value="">—</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.codigo})
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">El técnico registra cada gasto con su foto desde la app; acá se ve el saldo en vivo.</p>
        {error && <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
        {aviso && <p className="mt-2 rounded-md bg-green-50 px-2 py-1 text-xs text-green-800">{aviso}</p>}
        <div className="mt-2">
          <button
            type="button"
            disabled={pendiente || previa || falta !== null}
            onClick={() =>
              empezar(async () => {
                setError(null);
                setAviso(null);
                const { error: e } = await createClient()
                  .from("caja_menor_recibos")
                  .insert({ empleado_id: empleadoId, concepto: concepto.trim(), proyecto_id: proyecto || null, fecha_entrega: fecha, monto_asignado: valor });
                if (e) return setError(e.message);
                setConcepto("");
                setMonto("");
                setAviso(perfilId ? "Caja menor asignada: ya le aparece al técnico en su app." : "Caja menor asignada. Enlaza la ficha en Accesos para que el técnico la vea.");
                router.refresh();
              })
            }
            className={BOTON}
          >
            Asignar caja menor
          </button>
          {previa ? <AvisoPrevia /> : falta && <span className="ml-2 text-xs text-slate-500">{falta}</span>}
        </div>
      </Bloque>

      <div className="space-y-3">
        {cajas.length === 0 && <p className="text-xs text-slate-500">Sin cajas menores.</p>}
        {cajas.map((c) => (
          <TarjetaCaja
            key={c.id}
            caja={c}
            gastos={gastos.filter((g) => g.recibo_id === c.id)}
            fotos={fotos.filter((f) => f.recibo_id === c.id)}
            perfilId={perfilId}
            obra={c.proyecto_id ? (nombreProyecto.get(c.proyecto_id) ?? "obra") : null}
            hoy={hoy}
          />
        ))}
      </div>
    </div>
  );
}

function TarjetaCaja({
  caja,
  gastos,
  fotos,
  perfilId,
  obra,
  hoy,
}: {
  caja: CajaMenor;
  gastos: GastoCaja[];
  fotos: FotoCaja[];
  perfilId: string | null;
  obra: string | null;
  hoy: string;
}) {
  const router = useRouter();
  const abierta = caja.estado === "abierta" && !caja.anulado_en;
  const [modo, setModo] = useState<"nada" | "monto" | "cerrar" | "anular" | "gasto">("nada");
  const [monto, setMonto] = useState(String(Math.round(Number(caja.monto_asignado))));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const generales = fotos.filter((f) => !f.linea_id);

  const actualizar = (cambios: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { error: e } = await createClient().from("caja_menor_recibos").update(cambios).eq("id", caja.id);
      if (e) return setError(e.message);
      setModo("nada");
      router.refresh();
    });

  return (
    <section className={`space-y-2 rounded-lg border bg-white p-3 ${caja.anulado_en ? "border-slate-200 opacity-60" : "border-slate-300"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{caja.concepto}</p>
          <p className="text-xs text-slate-600">
            Entregada el {fechaCorta(caja.fecha_entrega)}
            {obra ? ` · ${obra}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            caja.anulado_en ? "bg-slate-200 text-slate-700" : abierta ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          {caja.anulado_en ? "Anulada" : abierta ? "Abierta" : `Cerrada el ${fechaCorta(caja.cerrada_en)}`}
        </span>
      </div>
      {caja.anulado_en && <p className="text-xs text-slate-700">Anulada: {caja.motivo_anulacion}</p>}
      <ResumenSaldo caja={caja} paraRrhh />

      {abierta && (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          {modo === "monto" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${L} flex-1`}>
                Nuevo monto asignado
                <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" className={C} />
              </label>
              <button type="button" disabled={pendiente || leerMonto(monto) === null} onClick={() => actualizar({ monto_asignado: leerMonto(monto) })} className={BOTON}>
                Guardar monto
              </button>
              <button type="button" onClick={() => setModo("nada")} className={BOTON2}>
                Cancelar
              </button>
              {leerMonto(monto) === null && <span className="w-full text-xs text-slate-500">Escribe un monto.</span>}
            </div>
          ) : modo === "cerrar" ? (
            <div className="space-y-1 rounded-md bg-slate-50 p-2">
              <p className="text-xs text-slate-700">
                Cerrar es legalizar: el técnico ya no podrá registrar ni anular gastos, y el monto ya no cambia. Saldo final:{" "}
                <span className={`font-semibold ${Number(caja.saldo) < 0 ? "text-red-700" : ""}`}>{pesos(Number(caja.saldo))}</span>.
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={pendiente} onClick={() => actualizar({ estado: "cerrada" })} className={BOTON}>
                  Cerrar caja (legalizada)
                </button>
                <button type="button" onClick={() => setModo("nada")} className={BOTON2}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : modo === "anular" ? (
            <div className="space-y-1">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se anula la caja" className={C} />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pendiente || !motivo.trim()}
                  onClick={() => actualizar({ motivo_anulacion: motivo.trim() })}
                  className="min-h-9 rounded-md bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Anular caja
                </button>
                <button type="button" onClick={() => setModo("nada")} className={BOTON2}>
                  Cancelar
                </button>
              </div>
              {!motivo.trim() && <p className="text-xs text-slate-500">Escribe por qué se anula.</p>}
            </div>
          ) : modo === "gasto" ? (
            <div className="space-y-2">
              <FormGastoCaja caja={caja} hoy={hoy} />
              <button type="button" onClick={() => setModo("nada")} className={BOTON2}>
                Cerrar el formulario
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setModo("monto")} className={BOTON2}>
                Cambiar monto asignado
              </button>
              <button type="button" onClick={() => setModo("gasto")} className={BOTON2}>
                + Registrar un gasto
              </button>
              <SoporteGeneral caja={caja} />
              <button type="button" onClick={() => setModo("cerrar")} className={BOTON}>
                Cerrar caja
              </button>
              <button type="button" onClick={() => setModo("anular")} className={`${BOTON2} text-red-800`}>
                Anular…
              </button>
            </div>
          )}
          {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
        </div>
      )}
      {!abierta && !caja.anulado_en && <p className="text-xs text-slate-500">Caja cerrada (legalizada): ya no cambia.</p>}

      {generales.length > 0 && (
        <p className="flex flex-wrap gap-x-2 text-xs">
          <span className="text-slate-600">Soportes generales:</span>
          {generales.map((f) => (
            <AbrirArchivo key={f.storage_path} path={f.storage_path}>
              📎 {f.nombre_archivo ?? "soporte"}
            </AbrirArchivo>
          ))}
        </p>
      )}
      <p className="pt-1 text-xs font-semibold uppercase text-slate-500">Gastos registrados</p>
      <ListaGastosCaja
        caja={caja}
        gastos={gastos}
        fotos={fotos}
        quien={(p) => (p && p === perfilId ? "lo registró el técnico" : "lo registró RRHH")}
        puedeOperar={abierta}
      />
    </section>
  );
}

/** Soporte general de la caja (relación de gastos, tiquetes, peajes…), sin un gasto puntual. */
function SoporteGeneral({ caja }: { caja: CajaMenor }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className={BOTON2}>
        Subir soporte general
      </button>
    );
  return (
    <div className="w-full space-y-1">
      <ElegirArchivo
        textoFoto="📷 Foto"
        textoArchivo="Relación, tiquetes…"
        onElegido={(f) =>
          empezar(async () => {
            setError(null);
            try {
              const s = await subirSoporte(carpetaCaja(caja.id), f, BUCKET_SOPORTES);
              const { error: e } = await createClient()
                .from("caja_menor_soportes")
                .insert({ recibo_id: caja.id, storage_path: s.path, nombre_archivo: s.nombre, mime: s.mime, bytes: s.bytes });
              if (e) throw new Error(e.message);
              setAbierto(false);
              router.refresh();
            } catch (x) {
              setError(x instanceof Error ? x.message : String(x));
            }
          })
        }
      />
      {pendiente && <p className="text-xs text-slate-500">Subiendo…</p>}
      {error && <p className="text-xs text-red-800">{error}</p>}
    </div>
  );
}

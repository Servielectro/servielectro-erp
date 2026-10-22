"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClienteCombobox } from "@/components/clientes/ClienteCombobox";
import type { ClienteResumen } from "@/lib/supabase/clientes";
import { ESTADO_PROYECTO, type EstadoProyecto } from "@/lib/supabase/proyectos";
import { crearProyecto, editarProyecto, type DatosProyecto } from "./actions";

const CAMPO = "mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

/**
 * Alta y edición de un proyecto a mano. Lo que importa para los técnicos y RRHH es el nombre:
 * es lo que ven al cargar un gasto o abrir una obra. Cliente y fechas son opcionales; la
 * cotización la enlaza Comercial después.
 */
export function FormProyecto({
  id,
  inicial,
  clientes,
  veClientes,
  tieneCotizacion,
  editaClienteConCotizacion,
  anioActual,
}: {
  /** Sin id = nuevo. */
  id?: string;
  inicial: DatosProyecto & { clienteNombre: string };
  clientes: ClienteResumen[];
  /** comercial/consultar: puede buscar en la lista de clientes. */
  veClientes: boolean;
  /** El proyecto ya tiene cotización enlazada: el cliente sale de ahí. */
  tieneCotizacion: boolean;
  /** comercial/trabajar: puede cambiar el cliente aunque haya cotización. */
  editaClienteConCotizacion: boolean;
  anioActual: string;
}) {
  const router = useRouter();
  const [d, setD] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const cambiar = <K extends keyof typeof d>(k: K, valor: (typeof d)[K]) => {
    setGuardado(false);
    setD((p) => ({ ...p, [k]: valor }));
  };

  const clienteBloqueado = tieneCotizacion && !editaClienteConCotizacion;
  const motivoSinGuardar = !d.nombre.trim()
    ? "Falta el nombre del proyecto."
    : id && !d.codigo.trim()
      ? "El código no puede quedar vacío."
      : null;

  function guardar() {
    setError(null);
    startTransition(async () => {
      const datos: DatosProyecto = {
        nombre: d.nombre,
        codigo: d.codigo,
        clienteId: d.clienteId,
        estado: d.estado,
        fechaInicio: d.fechaInicio,
        fechaFinEstimada: d.fechaFinEstimada,
        descripcion: d.descripcion,
      };
      if (id) {
        const r = await editarProyecto(id, datos);
        if (!r.ok) return setError(r.error);
        setGuardado(true);
        router.refresh();
      } else {
        const r = await crearProyecto(datos);
        if (!r.ok) return setError(r.error);
        router.push(`/proyectos/${r.id}?creado=1`);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <div>
        <label className="text-xs text-slate-600">Nombre del proyecto u obra *</label>
        <input
          value={d.nombre}
          onChange={(e) => cambiar("nombre", e.target.value)}
          placeholder="Ej. Conjunto Tintalá — CCTV torre 2"
          className={CAMPO}
        />
        <p className="mt-1 text-xs text-slate-500">Es lo que ven los técnicos, Operativo y RRHH al elegir el proyecto.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-600">Código</label>
          <input
            value={d.codigo}
            onChange={(e) => cambiar("codigo", e.target.value)}
            placeholder={id ? "" : `Automático: PRY-${anioActual}-…`}
            className={CAMPO}
          />
        </div>
        <div>
          <label className="text-xs text-slate-600">Estado</label>
          <select value={d.estado} onChange={(e) => cambiar("estado", e.target.value as EstadoProyecto)} className={CAMPO}>
            {(Object.keys(ESTADO_PROYECTO) as EstadoProyecto[]).map((e) => (
              <option key={e} value={e}>
                {ESTADO_PROYECTO[e]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {d.estado !== "EN_EJECUCION" && (
        <p className="text-xs text-amber-800">
          Solo los proyectos en ejecución le aparecen al técnico para cargar gastos.
        </p>
      )}

      {clienteBloqueado ? (
        <div>
          <label className="text-xs text-slate-600">Cliente</label>
          <p className="mt-0.5 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{d.clienteNombre || "—"}</p>
          <p className="mt-1 text-xs text-slate-500">
            Tiene cotización enlazada: el cliente sale de ahí y lo cambia Comercial.
          </p>
        </div>
      ) : veClientes ? (
        <div>
          <ClienteCombobox
            clientes={clientes}
            label="Cliente (opcional)"
            seleccionado={d.clienteId ? { id: d.clienteId, nombre: d.clienteNombre } : null}
            onSeleccionar={(c) => setD((p) => ({ ...p, clienteId: c.id, clienteNombre: c.nombre }))}
            motivoSinCrear="Si el cliente no está, créalo en Comercial y enlázalo después. El proyecto se puede guardar sin cliente."
          />
          {d.clienteId && (
            <button
              type="button"
              onClick={() => setD((p) => ({ ...p, clienteId: null, clienteNombre: "" }))}
              className="mt-1 text-xs font-semibold text-slate-700 underline"
            >
              Quitar cliente
            </button>
          )}
        </div>
      ) : (
        <div>
          <label className="text-xs text-slate-600">Cliente</label>
          <p className="mt-0.5 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{d.clienteNombre || "Sin cliente"}</p>
          <p className="mt-1 text-xs text-slate-500">
            La lista de clientes es de Comercial: el proyecto se guarda sin cliente y Comercial lo enlaza después.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-600">Inicio</label>
          <input type="date" value={d.fechaInicio} onChange={(e) => cambiar("fechaInicio", e.target.value)} className={CAMPO} />
        </div>
        <div>
          <label className="text-xs text-slate-600">Fin estimado</label>
          <input
            type="date"
            value={d.fechaFinEstimada}
            min={d.fechaInicio || undefined}
            onChange={(e) => cambiar("fechaFinEstimada", e.target.value)}
            className={CAMPO}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-600">Descripción (opcional)</label>
        <textarea
          value={d.descripcion}
          onChange={(e) => cambiar("descripcion", e.target.value)}
          rows={3}
          placeholder="Alcance, dirección, notas…"
          className={CAMPO}
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {guardado && <p className="text-xs text-green-700">Cambios guardados.</p>}
      <button
        type="button"
        onClick={guardar}
        disabled={pendiente || motivoSinGuardar !== null}
        className="min-h-11 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pendiente ? "Guardando…" : id ? "Guardar cambios" : "Crear proyecto"}
      </button>
      {motivoSinGuardar && !pendiente && <p className="text-center text-xs text-slate-500">{motivoSinGuardar}</p>}
    </div>
  );
}

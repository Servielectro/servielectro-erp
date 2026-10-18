"use client";

import { useState, useTransition } from "react";
import { ClienteCombobox } from "@/components/clientes/ClienteCombobox";
import type { ClienteResumen } from "@/lib/supabase/clientes";
import { hoyColombia } from "@/lib/crm";
import { crearVisita, type NuevaVisita } from "./actions";

const CAMPO = "mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

function vacia(): NuevaVisita {
  return {
    titulo: "",
    clienteId: null,
    clienteNombre: "",
    direccion: "",
    contactoSitio: "",
    telefonoSitio: "",
    tipo: "visita",
    tecnicoId: null,
    fechaProgramada: hoyColombia(),
    fechaFinEstimada: "",
    descripcionTrabajo: "",
  };
}

export function NuevaVisitaForm({
  tecnicos,
  clientes,
  errorTecnicos,
}: {
  tecnicos: { id: string; nombre: string }[];
  clientes: ClienteResumen[];
  errorTecnicos: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [v, setV] = useState<NuevaVisita>(vacia);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const cambiar = <K extends keyof NuevaVisita>(k: K, valor: NuevaVisita[K]) => setV((p) => ({ ...p, [k]: valor }));

  function guardar() {
    setError(null);
    startTransition(async () => {
      const res = await crearVisita(v);
      if (!res.ok) return setError(res.error);
      setOk(true);
      setV(vacia());
      setAbierto(false);
    });
  }

  if (!abierto) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setAbierto(true);
            setOk(false);
          }}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          + Nueva visita
        </button>
        {ok && <p className="mt-2 text-center text-xs text-green-700">Visita creada. Le aparece al técnico la próxima vez que abra la app con señal.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">Nueva visita</p>
      <div>
        <label className="text-xs text-slate-600">Qué es (lo ve el técnico en su lista) *</label>
        <input value={v.titulo} onChange={(e) => cambiar("titulo", e.target.value)} placeholder="Ej. Mantenimiento CCTV torre 2" className={CAMPO} />
      </div>
      {clientes.length > 0 ? (
        <ClienteCombobox
          clientes={clientes}
          label="Cliente"
          seleccionado={v.clienteNombre ? { id: v.clienteId, nombre: v.clienteNombre } : null}
          onSeleccionar={(c) =>
            setV((p) => ({
              ...p,
              clienteId: c.id,
              clienteNombre: c.nombre,
              direccion: p.direccion || c.direccion || "",
              contactoSitio: p.contactoSitio || c.contacto || "",
              telefonoSitio: p.telefonoSitio || c.telefono || "",
            }))
          }
          onCrearNuevo={(busqueda) => setV((p) => ({ ...p, clienteId: null, clienteNombre: busqueda }))}
        />
      ) : (
        <div>
          <label className="text-xs text-slate-600">Cliente</label>
          <input value={v.clienteNombre} onChange={(e) => cambiar("clienteNombre", e.target.value)} className={CAMPO} />
        </div>
      )}
      <div>
        <label className="text-xs text-slate-600">Dirección</label>
        <input value={v.direccion} onChange={(e) => cambiar("direccion", e.target.value)} className={CAMPO} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-600">Contacto en sitio</label>
          <input value={v.contactoSitio} onChange={(e) => cambiar("contactoSitio", e.target.value)} className={CAMPO} />
        </div>
        <div>
          <label className="text-xs text-slate-600">Teléfono</label>
          <input value={v.telefonoSitio} inputMode="tel" onChange={(e) => cambiar("telefonoSitio", e.target.value)} className={CAMPO} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-600">Técnico *</label>
          <select value={v.tecnicoId ?? ""} onChange={(e) => cambiar("tecnicoId", e.target.value || null)} className={CAMPO}>
            <option value="">Elegir…</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          {errorTecnicos && <p className="mt-1 text-xs text-red-700">{errorTecnicos}</p>}
        </div>
        <div>
          <label className="text-xs text-slate-600">Tipo</label>
          <select value={v.tipo} onChange={(e) => cambiar("tipo", e.target.value as NuevaVisita["tipo"])} className={CAMPO}>
            <option value="visita">Visita (un día)</option>
            <option value="obra">Obra (varios días)</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-600">Fecha *</label>
          <input type="date" value={v.fechaProgramada} onChange={(e) => cambiar("fechaProgramada", e.target.value)} className={CAMPO} />
        </div>
        {v.tipo === "obra" && (
          <div>
            <label className="text-xs text-slate-600">Termina (estimado)</label>
            <input type="date" value={v.fechaFinEstimada} onChange={(e) => cambiar("fechaFinEstimada", e.target.value)} className={CAMPO} />
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-slate-600">Qué hay que hacer</label>
        <textarea rows={3} value={v.descripcionTrabajo} onChange={(e) => cambiar("descripcionTrabajo", e.target.value)} className={CAMPO} />
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} disabled={pendiente} className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium">
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={pendiente} className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pendiente ? "Guardando…" : "Crear visita"}
        </button>
      </div>
    </div>
  );
}

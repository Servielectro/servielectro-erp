"use client";

import { useState, useTransition } from "react";
import { ClienteCombobox } from "@/components/clientes/ClienteCombobox";
import { NuevoClienteModal } from "@/components/clientes/NuevoClienteModal";
import type { ClienteResumen } from "@/lib/supabase/clientes";
import type { ProyectoNombre } from "@/lib/supabase/proyectos";
import { hoyColombia } from "@/lib/crm";
import { crearVisita, resolverUbicacionMaps, type NuevaVisita } from "./actions";

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
    horaProgramada: "",
    sitioLat: null,
    sitioLng: null,
    sitioUrlMaps: null,
    fechaFinEstimada: "",
    descripcionTrabajo: "",
    fotosMinimasDia: "",
    proyectoId: null,
  };
}

export function NuevaVisitaForm({
  tecnicos,
  clientes: clientesIniciales,
  errorTecnicos,
  veClientes,
  puedeCrearCliente,
  proyectos,
}: {
  tecnicos: { id: string; nombre: string }[];
  clientes: ClienteResumen[];
  errorTecnicos: string | null;
  /** comercial/consultar: puede buscar en la lista de clientes. */
  veClientes: boolean;
  /** comercial/trabajar: puede crear clientes (el mismo alta del cotizador). */
  puedeCrearCliente: boolean;
  /** Proyectos en ejecución (fn_proyectos_nombres). Null: la migración 63 no está corrida. */
  proyectos: ProyectoNombre[] | null;
}) {
  const [clientes, setClientes] = useState(clientesIniciales);
  const [nuevoCliente, setNuevoCliente] = useState<string | null>(null);
  const [avisoCliente, setAvisoCliente] = useState<string | null>(null);
  // Ubicación del sitio desde Google Maps: lo pegado, y qué se sacó de ahí.
  const [enlaceMaps, setEnlaceMaps] = useState("");
  const [ubicacion, setUbicacion] = useState<
    { tipo: "lugar" | "punto" | "centro"; aviso: string | null; nombre: string | null } | null
  >(null);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  const [extrayendo, setExtrayendo] = useState(false);

  async function extraerUbicacion() {
    setExtrayendo(true);
    setErrorUbicacion(null);
    try {
      const r = await resolverUbicacionMaps(enlaceMaps);
      if (!r.ok) {
        setUbicacion(null);
        setV((p) => ({ ...p, sitioLat: null, sitioLng: null, sitioUrlMaps: null }));
        return setErrorUbicacion(r.error);
      }
      setUbicacion({ tipo: r.tipo, aviso: r.aviso, nombre: r.nombre });
      setV((p) => ({ ...p, sitioLat: r.lat, sitioLng: r.lng, sitioUrlMaps: r.urlMaps ?? enlaceMaps.trim() }));
    } finally {
      setExtrayendo(false);
    }
  }
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
          className="min-h-11 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
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
      {veClientes ? (
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
          // Crear: el MISMO alta del cotizador (RUT, NIT, ubicación). Sin permiso de Comercial
          // para crear, no se ofrece un botón que no puede funcionar: se usa como texto y se dice.
          onCrearNuevo={puedeCrearCliente ? (busqueda) => setNuevoCliente(busqueda) : undefined}
          onUsarTexto={puedeCrearCliente ? undefined : (texto) => setV((p) => ({ ...p, clienteId: null, clienteNombre: texto }))}
          motivoSinCrear={
            puedeCrearCliente
              ? undefined
              : "Crear clientes es de Comercial: puedes dejar el nombre como texto y Comercial lo registra después."
          }
        />
      ) : (
        <div>
          <label className="text-xs text-slate-600">Cliente</label>
          <input value={v.clienteNombre} onChange={(e) => cambiar("clienteNombre", e.target.value)} className={CAMPO} />
          <p className="mt-1 text-xs text-slate-600">
            Sin permiso de Comercial no se ve la lista de clientes: el nombre queda como texto.
          </p>
        </div>
      )}
      {avisoCliente && <p className="text-xs text-blue-700">{avisoCliente}</p>}
      {nuevoCliente !== null && (
        <NuevoClienteModal
          nombreInicial={nuevoCliente}
          onCerrar={() => setNuevoCliente(null)}
          onCreado={(c, yaExistia) => {
            if (!yaExistia) setClientes((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            // Enlazado por id, no solo por nombre; y lo que se sepa del sitio, precargado.
            setV((p) => ({
              ...p,
              clienteId: c.id,
              clienteNombre: c.nombre,
              direccion: p.direccion || c.direccion || "",
              contactoSitio: p.contactoSitio || c.contacto || "",
              telefonoSitio: p.telefonoSitio || c.telefono || "",
            }));
            setAvisoCliente(
              yaExistia
                ? `Ya existía un cliente con ese NIT (${c.nombre}): quedó seleccionado, no se duplicó.`
                : `Cliente ${c.nombre} creado y seleccionado.`,
            );
            setNuevoCliente(null);
          }}
        />
      )}
      {proyectos !== null && (
        <div>
          <label className="text-xs text-slate-600">Proyecto u obra (opcional)</label>
          <select
            value={v.proyectoId ?? ""}
            onChange={(e) => cambiar("proyectoId", e.target.value || null)}
            disabled={proyectos.length === 0}
            className={`${CAMPO} disabled:bg-slate-50`}
          >
            <option value="">{proyectos.length === 0 ? "No hay proyectos en ejecución" : "Sin proyecto"}</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.codigo})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {proyectos.length === 0
              ? "Los proyectos se crean en el módulo Proyectos."
              : "Con el proyecto, el técnico lo puede elegir al cargar gastos de esta obra."}
          </p>
        </div>
      )}
      <div>
        <label className="text-xs text-slate-600">Dirección</label>
        <input value={v.direccion} onChange={(e) => cambiar("direccion", e.target.value)} className={CAMPO} />
      </div>
      <div>
        {/* Ubicación del sitio: pegando el enlace de Google Maps. La dirección de arriba sigue
            siendo la que se escribe: del enlace solo salen las coordenadas. */}
        <label className="text-xs text-slate-600">Ubicación del sitio (enlace de Google Maps, opcional)</label>
        <div className="mt-0.5 flex gap-2">
          <input
            value={enlaceMaps}
            onChange={(e) => setEnlaceMaps(e.target.value)}
            inputMode="url"
            placeholder="Pega el enlace de Google Maps"
            className={`${CAMPO} mt-0 min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={extraerUbicacion}
            disabled={extrayendo || !enlaceMaps.trim()}
            className="min-h-11 shrink-0 rounded-md border border-slate-900 px-3 text-sm font-semibold disabled:opacity-40"
          >
            {extrayendo ? "…" : "Extraer"}
          </button>
        </div>
        {!enlaceMaps.trim() && !ubicacion && (
          <p className="mt-1 text-xs text-slate-500">
            En Google Maps marca el sitio (o amplía al máximo sobre él), copia el enlace y pégalo.
          </p>
        )}
        {errorUbicacion && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{errorUbicacion}</p>}
        {ubicacion && v.sitioLat !== null && v.sitioLng !== null && (
          <div className="mt-1 space-y-0.5 text-xs">
            <p className="text-slate-700">
              {ubicacion.tipo === "lugar" ? "Lugar marcado" : ubicacion.tipo === "punto" ? "Punto" : "Centro del mapa"}:{" "}
              {v.sitioLat.toFixed(6)}, {v.sitioLng.toFixed(6)}
              {ubicacion.nombre ? ` · ${ubicacion.nombre}` : ""} ·{" "}
              <a
                href={`https://www.google.com/maps?q=${v.sitioLat},${v.sitioLng}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#A82323] underline"
              >
                Ver en el mapa
              </a>{" "}
              ·{" "}
              <button
                type="button"
                onClick={() => {
                  setUbicacion(null);
                  setEnlaceMaps("");
                  setV((p) => ({ ...p, sitioLat: null, sitioLng: null, sitioUrlMaps: null }));
                }}
                className="font-semibold underline"
              >
                Quitar
              </button>
            </p>
            {ubicacion.aviso && <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">{ubicacion.aviso}</p>}
          </div>
        )}
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
        <div>
          {/* Con la hora, la pantalla de la visita calcula el retraso (entrada − hora programada). */}
          <label className="text-xs text-slate-600">Hora</label>
          <input type="time" value={v.horaProgramada} onChange={(e) => cambiar("horaProgramada", e.target.value)} className={CAMPO} />
        </div>
        {v.tipo === "obra" && (
          <div>
            <label className="text-xs text-slate-600">Termina (estimado)</label>
            <input type="date" value={v.fechaFinEstimada} onChange={(e) => cambiar("fechaFinEstimada", e.target.value)} className={CAMPO} />
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-slate-600">Mínimo de fotos por día</label>
        <input
          inputMode="numeric"
          value={v.fotosMinimasDia}
          onChange={(e) => cambiar("fotosMinimasDia", e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Vacío = sin mínimo (ej. 6 en un mantenimiento, 20 en una canalización)"
          className={CAMPO}
        />
        <p className="mt-0.5 text-xs text-slate-500">
          No bloquea al técnico: si sale con menos, se le pide el motivo y queda registrado.
        </p>
      </div>
      <div>
        <label className="text-xs text-slate-600">Qué hay que hacer</label>
        <textarea rows={3} value={v.descripcionTrabajo} onChange={(e) => cambiar("descripcionTrabajo", e.target.value)} className={CAMPO} />
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} disabled={pendiente} className="min-h-11 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium">
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={pendiente} className="min-h-11 flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pendiente ? "Guardando…" : "Crear visita"}
        </button>
      </div>
    </div>
  );
}

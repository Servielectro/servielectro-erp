"use client";

import { useState } from "react";
import { crearCliente } from "@/app/(app)/comercial/clientes-actions";
import type {
  CamposConfirmadosRut,
  RutLeidoSinCliente,
} from "@/app/(app)/comercial/cotizaciones/documentos-actions";
import { RutUploader } from "@/components/cotizacion/RutUploader";
import type { ClienteResumen } from "@/lib/supabase/clientes";

export interface UbicacionCliente {
  latitud: number;
  longitud: number;
  precisionM: number | null;
}

/**
 * Ventana "Nuevo cliente" (mismo estilo que Nuevo ítem). Los campos se llenan a mano
 * SIEMPRE; el RUT es un atajo opcional que los rellena, y el GPS toma la ubicación de la
 * obra solo cuando se toca el botón. Al guardar, el cliente queda creado y seleccionado
 * donde se abrió. Si el NIT ya existe, se usa el existente (no se duplica).
 *
 * Letra y espacios chicos en celular (que quepa sin desbordar) y proporcionales en
 * tablet (md:), que es donde Jhojan cotiza en campo.
 */
export function NuevoClienteModal({
  nombreInicial,
  onCerrar,
  onCreado,
}: {
  nombreInicial: string;
  onCerrar: () => void;
  onCreado: (cliente: ClienteResumen, yaExistia: boolean) => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [nit, setNit] = useState("");
  const [direccion, setDireccion] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [contacto, setContacto] = useState("");
  // Responsable de IVA: lo dice el RUT de ESTE cliente (casilla 53, código 48). Sin RUT,
  // se marca a mano; nunca se deduce por el tipo de cliente.
  const [responsableIva, setResponsableIva] = useState<"" | "si" | "no">("");
  const [rut, setRut] = useState<{ campos: CamposConfirmadosRut; archivo: RutLeidoSinCliente } | null>(null);
  const [leyendoRut, setLeyendoRut] = useState(false);
  const [ubicacion, setUbicacion] = useState<UbicacionCliente | null>(null);
  const [tomandoUbicacion, setTomandoUbicacion] = useState(false);
  const [avisoUbicacion, setAvisoUbicacion] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo al tocar el botón: nunca se pide la ubicación sola al abrir la ventana.
  function tomarUbicacion() {
    setAvisoUbicacion(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setAvisoUbicacion("Este navegador no permite tomar la ubicación. Puedes guardar el cliente sin ella.");
      return;
    }
    setTomandoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicacion({
          latitud: Math.round(pos.coords.latitude * 1e6) / 1e6,
          longitud: Math.round(pos.coords.longitude * 1e6) / 1e6,
          precisionM: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
        });
        setTomandoUbicacion(false);
      },
      (err) => {
        setTomandoUbicacion(false);
        setAvisoUbicacion(
          err.code === err.PERMISSION_DENIED
            ? "Permiso de ubicación denegado. Actívalo para esta página en el navegador y vuelve a tocar el botón. El cliente se puede guardar igual."
            : err.code === err.TIMEOUT
              ? "El GPS tardó demasiado (¿poca señal?). Intenta de nuevo al aire libre, o guarda sin ubicación."
              : "No se pudo obtener la ubicación (sin señal GPS). Puedes guardar el cliente sin ella.",
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function guardar() {
    if (!nombre.trim()) {
      setError("Falta el nombre o la razón social del cliente");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await crearCliente({
      nombre,
      nit,
      direccion,
      email,
      contacto,
      telefono,
      rut,
      ubicacion,
      responsableIva: responsableIva === "" ? null : responsableIva === "si",
    });
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreado(res.cliente, res.yaExistia);
  }

  if (leyendoRut) {
    return (
      <RutUploader
        clienteNombre={nombre}
        onCerrar={() => setLeyendoRut(false)}
        onLeidoClienteNuevo={(campos, archivo) => {
          if (campos.razonSocial) setNombre(campos.razonSocial);
          setNit(campos.nit ? (campos.dv ? `${campos.nit}-${campos.dv}` : campos.nit) : "");
          if (campos.direccion) setDireccion(campos.direccion);
          if (campos.correo) setEmail(campos.correo);
          if (campos.telefono) setTelefono(campos.telefono);
          if (campos.representanteLegal) setContacto(campos.representanteLegal);
          setResponsableIva(campos.responsableIva === null ? "" : campos.responsableIva ? "si" : "no");
          setRut({ campos, archivo });
          setLeyendoRut(false);
        }}
      />
    );
  }

  const etiqueta = "block text-xs font-medium text-slate-700";
  const campo =
    "mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white/90 px-2.5 py-2 text-sm md:px-3 md:py-2.5";
  const mapa = ubicacion ? `https://www.google.com/maps?q=${ubicacion.latitud},${ubicacion.longitud}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm md:p-6">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/40 bg-white/80 p-4 shadow-2xl backdrop-blur-xl md:max-w-xl md:p-6">
        <h2 className="text-base font-semibold text-slate-900">Nuevo cliente</h2>
        <p className="mb-3 text-xs text-slate-600">
          Llena los datos a mano. Si tienes el RUT, puedes subirlo para que los llene solo.
        </p>

        {error && <p className="mb-3 rounded-md bg-red-50/90 px-3 py-2 text-xs text-red-700">{error}</p>}

        <div className="space-y-2.5 md:space-y-3">
          <label className={etiqueta}>
            Nombre del cliente / razón social *
            <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
            <label className={etiqueta}>
              NIT
              <input value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900123456-7" className={campo} />
            </label>
            <label className={etiqueta}>
              Teléfono de contacto
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="300 123 4567" className={campo} />
            </label>
          </div>
          <label className={etiqueta}>
            Dirección
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={campo} />
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
            <label className={etiqueta}>
              Correo
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
            </label>
            <label className={etiqueta}>
              Persona de contacto (opcional; con RUT, el representante legal)
              <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Ej. Administradora" className={campo} />
            </label>
          </div>
        </div>

        <label className={`${etiqueta} mt-2.5 md:mt-3`}>
          ¿Responsable de IVA?
          <select
            value={responsableIva}
            onChange={(e) => setResponsableIva(e.target.value as "" | "si" | "no")}
            className={campo}
          >
            <option value="">No se sabe</option>
            <option value="si">Sí (código 48 en el RUT)</option>
            <option value="no">No</option>
          </select>
          {rut && (
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Leído del RUT
              {rut.campos.responsabilidades.length > 0 &&
                ` — responsabilidades (casilla 53): ${rut.campos.responsabilidades.join(", ")}`}
            </span>
          )}
        </label>

        {/* ---- Atajos opcionales: RUT y ubicación ---- */}
        <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opcional</p>

          <button
            type="button"
            onClick={() => setLeyendoRut(true)}
            className="w-full rounded-md border border-dashed border-slate-400 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700"
          >
            📄 {rut ? "Volver a leer el RUT" : "¿Tienes el RUT? Súbelo y llena los campos solo"}
          </button>
          {rut && <p className="text-xs text-green-700">✓ Datos leídos del RUT. Revísalos arriba antes de guardar.</p>}

          <button
            type="button"
            onClick={tomarUbicacion}
            disabled={tomandoUbicacion}
            className="w-full rounded-md border border-dashed border-slate-400 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 disabled:opacity-60"
          >
            📍 {tomandoUbicacion ? "Tomando ubicación…" : ubicacion ? "Volver a tomar la ubicación" : "Tomar la ubicación de la obra (GPS)"}
          </button>
          {ubicacion && mapa && (
            <p className="text-xs text-green-700">
              ✓ {ubicacion.latitud}, {ubicacion.longitud}
              {ubicacion.precisionM !== null && ` (±${ubicacion.precisionM} m)`} ·{" "}
              <a href={mapa} target="_blank" rel="noopener noreferrer" className="underline">
                ver en Google Maps
              </a>{" "}
              ·{" "}
              <button type="button" onClick={() => setUbicacion(null)} className="underline">
                quitar
              </button>
            </p>
          )}
          {avisoUbicacion && <p className="text-xs text-amber-800">{avisoUbicacion}</p>}
        </div>

        <div className="mt-4 flex gap-2 md:mt-6 md:gap-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="flex-1 rounded-md border border-slate-300 bg-white/70 px-3 py-2.5 text-sm font-medium text-slate-700 md:py-3"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex-1 rounded-md bg-slate-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60 md:py-3"
          >
            {guardando ? "Guardando…" : "Guardar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

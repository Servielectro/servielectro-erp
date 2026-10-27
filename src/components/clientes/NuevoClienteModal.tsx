"use client";

import { useState } from "react";
import { crearCliente, type RutParaCliente } from "@/app/(app)/comercial/clientes-actions";
import type { ClienteResumen } from "@/lib/supabase/clientes";
import { LectorRut } from "@/components/rut/LectorRut";
import { SelectorMunicipio } from "@/components/rut/SelectorMunicipio";
import { useCatalogoResponsabilidades } from "@/components/rut/Responsabilidades";
import { cargarMunicipios, describirResponsabilidad } from "@/lib/rut/catalogos";
import { armarPropuesta, type PropuestaRut } from "@/lib/rut/propuesta";
import type { RutLeido } from "@/lib/rut/useLecturaRut";

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
  // Lo leído del RUT (el mismo lector de Administrativo → Clientes): propuesta que se revisa aquí.
  const [rut, setRut] = useState<{ archivo: RutParaCliente; propuesta: PropuestaRut; proveedor: string } | null>(null);
  const [avisoRut, setAvisoRut] = useState<string | null>(null);
  const [lugar, setLugar] = useState({ municipio: "", departamento: "", municipio_dane: "" });
  const [declarante, setDeclarante] = useState<"" | "si" | "no">("");
  const { catalogo } = useCatalogoResponsabilidades();

  async function aplicarRut(r: RutLeido) {
    setAvisoRut(null);
    if (!r.resultado.extraccion.es_documento_rut) {
      setAvisoRut(`Ese archivo no parece un RUT${r.resultado.extraccion.tipo_documento_detectado ? ` (parece: ${r.resultado.extraccion.tipo_documento_detectado})` : ""}. No se cambió nada.`);
      return;
    }
    let municipios: Awaited<ReturnType<typeof cargarMunicipios>> = [];
    try {
      municipios = await cargarMunicipios();
    } catch {
      // el municipio queda escrito y el código se elige a mano
    }
    const p = armarPropuesta(r.resultado, municipios, catalogo);
    if (p.nombre) setNombre(p.nombre);
    if (p.nit) setNit(p.dv ? `${p.nit}-${p.dv}` : p.nit);
    if (p.direccion) setDireccion(p.direccion);
    if (p.email) setEmail(p.email);
    if (p.telefono) setTelefono(p.telefono);
    if (p.contacto) setContacto(p.contacto);
    if (p.municipio || p.municipio_dane) setLugar({ municipio: p.municipio, departamento: p.departamento, municipio_dane: p.municipio_dane ?? "" });
    setRut({
      archivo: { storagePath: r.storagePath, nombreArchivo: r.nombreArchivo, extraccion: r.resultado.extraccion, costoEstimadoUsd: r.resultado.costoEstimadoUsd },
      propuesta: p,
      proveedor: r.proveedor,
    });
  }
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
      rut: rut?.archivo ?? null,
      fiscales: {
        tipoDocumento: rut ? "31" : null,
        tipoPersona: rut?.propuesta.tipo_persona ?? null,
        dv: rut?.propuesta.dv || null,
        municipio: lugar.municipio || null,
        departamento: lugar.departamento || null,
        municipioDane: lugar.municipio_dane || null,
        responsabilidadesRut: rut?.propuesta.responsabilidades_rut ?? [],
        declaranteRenta: declarante === "" ? null : declarante === "si",
      },
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
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
          {rut?.propuesta.responsable_iva && responsableIva !== (rut.propuesta.responsable_iva.valor ? "si" : "no") && (
            <span className="mt-1 block rounded-md bg-sky-50 px-2 py-1 text-xs font-normal text-sky-950">
              Sugerencia: <b>{rut.propuesta.responsable_iva.valor ? "Sí" : "No"}</b>, {rut.propuesta.responsable_iva.porque}.{" "}
              <button type="button" onClick={() => setResponsableIva(rut.propuesta.responsable_iva!.valor ? "si" : "no")} className="min-h-9 font-semibold underline">
                Usar la sugerencia
              </button>
            </span>
          )}
        </label>
        <label className={`${etiqueta} mt-2.5 md:mt-3`}>
          ¿Declarante de renta?
          <select value={declarante} onChange={(e) => setDeclarante(e.target.value as "" | "si" | "no")} className={campo}>
            <option value="">No se sabe</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
          {rut?.propuesta.declarante_renta && declarante !== (rut.propuesta.declarante_renta.valor ? "si" : "no") && (
            <span className="mt-1 block rounded-md bg-sky-50 px-2 py-1 text-xs font-normal text-sky-950">
              Sugerencia: <b>{rut.propuesta.declarante_renta.valor ? "Sí" : "No"}</b>, {rut.propuesta.declarante_renta.porque}.{" "}
              <button type="button" onClick={() => setDeclarante(rut.propuesta.declarante_renta!.valor ? "si" : "no")} className="min-h-9 font-semibold underline">
                Usar la sugerencia
              </button>
            </span>
          )}
        </label>
        <div className="mt-2.5 md:mt-3">
          <SelectorMunicipio valor={lugar} onCambio={setLugar} />
        </div>
        {rut && rut.propuesta.responsabilidades_rut.length > 0 && (
          <div className="mt-2.5 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
            <p className="font-semibold">Responsabilidades del RUT (se guardan todas):</p>
            <ul className="mt-1 list-disc pl-4">
              {rut.propuesta.responsabilidades_rut.map((c) => (
                <li key={c}>{describirResponsabilidad(c, catalogo)}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- Atajos opcionales: RUT y ubicación ---- */}
        <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opcional</p>

          <LectorRut texto={rut ? "📄 Volver a leer el RUT" : "📄 ¿Tienes el RUT? Súbelo y llena los campos solo"} onLeido={(r) => void aplicarRut(r)} />
          {rut && (
            <div className="space-y-0.5 text-xs">
              <p className="text-green-700">✓ Leído con {rut.proveedor}. Es una propuesta: revísala arriba antes de guardar.</p>
              {rut.propuesta.revisar.length > 0 && <p className="text-amber-800">Revisa a mano: {rut.propuesta.revisar.join(", ")}.</p>}
              {rut.propuesta.nit_coincide === false && <p className="font-semibold text-red-800">El DV leído no corresponde al NIT: revísalos en el RUT.</p>}
              {rut.propuesta.dane_aviso && <p className="text-amber-800">{rut.propuesta.dane_aviso}</p>}
            </div>
          )}
          {avisoRut && <p className="text-xs text-amber-800">{avisoRut}</p>}

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

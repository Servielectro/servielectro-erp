"use client";

import { useState } from "react";
import { crearCliente } from "@/app/(app)/comercial/clientes-actions";
import type {
  CamposConfirmadosRut,
  RutLeidoSinCliente,
} from "@/app/(app)/comercial/cotizaciones/documentos-actions";
import { RutUploader } from "@/components/cotizacion/RutUploader";
import type { ClienteResumen } from "@/lib/supabase/clientes";

/**
 * Ventana "Nuevo cliente" (mismo estilo que Nuevo ítem): los datos del cliente y, adentro,
 * el lector de RUT que los llena solo. Se revisa y se guarda; el cliente queda creado y
 * seleccionado donde se abrió. Si el NIT ya existe, se usa el existente (no se duplica).
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
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rut, setRut] = useState<{ campos: CamposConfirmadosRut; archivo: RutLeidoSinCliente } | null>(null);
  const [leyendoRut, setLeyendoRut] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!nombre.trim()) {
      setError("El nombre del cliente es obligatorio");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await crearCliente({ nombre, nit, direccion, email, contacto, telefono, rut });
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
          setDireccion(campos.direccion);
          setEmail(campos.correo);
          setTelefono(campos.telefono);
          setRut({ campos, archivo });
          setLeyendoRut(false);
        }}
      />
    );
  }

  const campo = "mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2.5 text-base";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/40 bg-white/70 p-6 shadow-2xl backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-slate-900">Nuevo cliente</h2>
        <p className="mb-4 text-sm text-slate-600">
          Queda guardado en la lista de clientes y seleccionado aquí.
        </p>

        {error && <p className="mb-3 rounded-md bg-red-50/90 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => setLeyendoRut(true)}
          className="mb-3 w-full rounded-md border border-dashed border-slate-400 bg-white/70 px-3 py-2.5 text-sm font-medium text-slate-700"
        >
          📄 {rut ? "Volver a leer el RUT" : "Leer RUT (llena los campos solo)"}
        </button>
        {rut && (
          <p className="mb-3 text-xs text-green-700">
            ✓ Datos leídos del RUT. Revísalos antes de guardar.
          </p>
        )}

        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Nombre / razón social *
            <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              NIT
              <input value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900123456-7" className={campo} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Celular / teléfono
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" className={campo} />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Dirección
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={campo} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Correo
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Contacto
              <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Ej. Administradora" className={campo} />
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="flex-1 rounded-md border border-slate-300 bg-white/70 px-4 py-3 text-base font-medium text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex-1 rounded-md bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

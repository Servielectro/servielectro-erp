"use client";

import { useState } from "react";
import {
  subirYLeerRut,
  confirmarRut,
  type CamposConfirmadosRut,
} from "@/app/cotizaciones/documentos-actions";
import type { ResultadoExtraccionRut } from "@/lib/documentos/extraer-rut";
import type { Confianza } from "@/lib/documentos/rut-schema";

interface Props {
  clienteNombre: string;
  onCerrar: () => void;
  onConfirmado: (clienteId: string, campos: CamposConfirmadosRut) => void;
}

type Estado =
  | { paso: "elegir_archivo" }
  | { paso: "leyendo" }
  | {
      paso: "revisar";
      documentoId: string;
      clienteId: string;
      resultado: ResultadoExtraccionRut;
      campos: CamposConfirmadosRut;
    }
  | { paso: "no_es_rut"; tipoDetectado: string | null }
  | { paso: "guardando" };

const BADGE: Record<Confianza, string> = {
  alta: "bg-green-100 text-green-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-orange-100 text-orange-700",
  no_legible: "bg-red-100 text-red-700",
};

const BADGE_LABEL: Record<Confianza, string> = {
  alta: "Alta confianza",
  media: "Media confianza",
  baja: "Baja confianza",
  no_legible: "No legible",
};

export function RutUploader({ clienteNombre, onCerrar, onConfirmado }: Props) {
  const [estado, setEstado] = useState<Estado>({ paso: "elegir_archivo" });
  const [error, setError] = useState<string | null>(null);

  async function onArchivoSeleccionado(file: File) {
    if (!clienteNombre.trim()) {
      setError("Escribí primero el nombre del cliente, arriba.");
      return;
    }
    setError(null);
    setEstado({ paso: "leyendo" });

    const formData = new FormData();
    formData.append("archivo", file);
    formData.append("clienteNombre", clienteNombre);

    const res = await subirYLeerRut(formData);

    if (!res.ok) {
      setError(res.error);
      setEstado({ paso: "elegir_archivo" });
      return;
    }

    const { resultado, documentoId, clienteId } = res;

    if (!resultado.extraccion.es_documento_rut) {
      setEstado({
        paso: "no_es_rut",
        tipoDetectado: resultado.extraccion.tipo_documento_detectado,
      });
      return;
    }

    const e = resultado.extraccion;
    const valorSiConfianza = (campo: { valor: string | null; confianza: Confianza }) =>
      campo.confianza === "no_legible" ? "" : (campo.valor ?? "");

    setEstado({
      paso: "revisar",
      documentoId,
      clienteId,
      resultado,
      campos: {
        nit: valorSiConfianza(e.nit),
        dv: valorSiConfianza(e.dv),
        razonSocial: valorSiConfianza(e.razon_social),
        nombreComercial: valorSiConfianza(e.nombre_comercial),
        direccion: valorSiConfianza(e.direccion),
        municipio: valorSiConfianza(e.municipio),
        departamento: valorSiConfianza(e.departamento),
        correo: valorSiConfianza(e.correo),
        telefono: valorSiConfianza(e.telefono),
        tipoContribuyente: e.tipo_contribuyente,
        responsableIva: e.responsabilidades.responsable_iva,
      },
    });
  }

  function actualizarCampo(campo: keyof CamposConfirmadosRut, valor: string) {
    if (estado.paso !== "revisar") return;
    setEstado({ ...estado, campos: { ...estado.campos, [campo]: valor } });
  }

  async function onConfirmar() {
    if (estado.paso !== "revisar") return;
    setError(null);
    setEstado({ paso: "guardando" });

    const res = await confirmarRut(estado.documentoId, estado.clienteId, estado.campos);
    if (!res.ok) {
      setError(res.error);
      setEstado({ ...estado, paso: "revisar" } as Estado);
      return;
    }

    onConfirmado(estado.clienteId, estado.campos);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/40 bg-white/80 p-6 shadow-2xl backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-slate-900">
          Cargar RUT de {clienteNombre || "el cliente"}
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          La IA lee el documento y vos confirmás cada dato antes de que se guarde.
        </p>

        {error && (
          <p className="mb-3 rounded-md bg-red-50/90 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {estado.paso === "elegir_archivo" && (
          <div className="space-y-3">
            <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-600">
              Tocá para elegir un PDF o una foto del RUT
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onArchivoSeleccionado(file);
                }}
              />
            </label>
            <button
              type="button"
              onClick={onCerrar}
              className="w-full rounded-md border border-slate-300 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              Cancelar
            </button>
          </div>
        )}

        {estado.paso === "leyendo" && (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-600">Leyendo el RUT con IA…</p>
          </div>
        )}

        {estado.paso === "no_es_rut" && (
          <div className="space-y-3">
            <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
              Esto no parece un RUT
              {estado.tipoDetectado ? ` (parece: ${estado.tipoDetectado})` : ""}. No
              se cargó ningún dato — completá los campos del cliente a mano, o
              intentá con otro archivo.
            </p>
            <button
              type="button"
              onClick={() => setEstado({ paso: "elegir_archivo" })}
              className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
            >
              Intentar con otro archivo
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="w-full rounded-md border border-slate-300 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              Cerrar
            </button>
          </div>
        )}

        {(estado.paso === "revisar" || estado.paso === "guardando") && (
          <div className="space-y-3">
            {estado.paso === "revisar" &&
              estado.resultado.nitValidado.coincide === false && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  ⚠️ El dígito de verificación no coincide con el NIT leído
                  (calculado: {estado.resultado.nitValidado.dvCalculado}). Revisá
                  estos dos campos con cuidado, probablemente hay un dígito mal leído.
                </p>
              )}

            {estado.paso === "revisar" &&
              estado.resultado.extraccion.observaciones && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {estado.resultado.extraccion.observaciones}
                </p>
              )}

            {estado.paso === "revisar" && (
              <>
                <CampoRevision
                  label="NIT"
                  valor={estado.campos.nit}
                  confianza={estado.resultado.extraccion.nit.confianza}
                  onChange={(v) => actualizarCampo("nit", v)}
                />
                <CampoRevision
                  label="DV"
                  valor={estado.campos.dv}
                  confianza={estado.resultado.extraccion.dv.confianza}
                  onChange={(v) => actualizarCampo("dv", v)}
                />
                <CampoRevision
                  label="Razón social"
                  valor={estado.campos.razonSocial}
                  confianza={estado.resultado.extraccion.razon_social.confianza}
                  onChange={(v) => actualizarCampo("razonSocial", v)}
                />
                <CampoRevision
                  label="Nombre comercial"
                  valor={estado.campos.nombreComercial}
                  confianza={estado.resultado.extraccion.nombre_comercial.confianza}
                  onChange={(v) => actualizarCampo("nombreComercial", v)}
                />
                <CampoRevision
                  label="Dirección"
                  valor={estado.campos.direccion}
                  confianza={estado.resultado.extraccion.direccion.confianza}
                  onChange={(v) => actualizarCampo("direccion", v)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <CampoRevision
                    label="Municipio"
                    valor={estado.campos.municipio}
                    confianza={estado.resultado.extraccion.municipio.confianza}
                    onChange={(v) => actualizarCampo("municipio", v)}
                  />
                  <CampoRevision
                    label="Departamento"
                    valor={estado.campos.departamento}
                    confianza={estado.resultado.extraccion.departamento.confianza}
                    onChange={(v) => actualizarCampo("departamento", v)}
                  />
                </div>
                <CampoRevision
                  label="Correo"
                  valor={estado.campos.correo}
                  confianza={estado.resultado.extraccion.correo.confianza}
                  onChange={(v) => actualizarCampo("correo", v)}
                />
                <CampoRevision
                  label="Teléfono"
                  valor={estado.campos.telefono}
                  confianza={estado.resultado.extraccion.telefono.confianza}
                  onChange={(v) => actualizarCampo("telefono", v)}
                />

                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-700">
                      Responsable de IVA
                    </label>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${BADGE[estado.resultado.extraccion.responsabilidades.confianza]}`}
                    >
                      {BADGE_LABEL[estado.resultado.extraccion.responsabilidades.confianza]}
                    </span>
                  </div>
                  <select
                    value={
                      estado.campos.responsableIva === null
                        ? ""
                        : estado.campos.responsableIva
                          ? "si"
                          : "no"
                    }
                    onChange={(e) => {
                      if (estado.paso !== "revisar") return;
                      const v = e.target.value;
                      setEstado({
                        ...estado,
                        campos: {
                          ...estado.campos,
                          responsableIva: v === "" ? null : v === "si",
                        },
                      });
                    }}
                    className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm"
                  >
                    <option value="">Sin determinar — revisar a mano</option>
                    <option value="si">Sí, responsable de IVA (código 48)</option>
                    <option value="no">No responsable de IVA (código 49)</option>
                  </select>
                  {estado.resultado.extraccion.responsabilidades.codigos.length > 0 && (
                    <p className="mt-1 text-xs text-slate-600">
                      Códigos leídos en casilla 53:{" "}
                      {estado.resultado.extraccion.responsabilidades.codigos.join(", ")}
                    </p>
                  )}
                </div>

                <p className="text-xs text-slate-600">
                  Costo de esta lectura: ~$
                  {estado.resultado.costoEstimadoUsd.toFixed(4)} USD
                </p>
              </>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onCerrar}
                disabled={estado.paso === "guardando"}
                className="flex-1 rounded-md border border-slate-300 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirmar}
                disabled={estado.paso === "guardando"}
                className="flex-1 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {estado.paso === "guardando" ? "Guardando…" : "Usar estos datos"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CampoRevision({
  label,
  valor,
  confianza,
  onChange,
}: {
  label: string;
  valor: string;
  confianza: Confianza;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <span className={`rounded-full px-2 py-0.5 text-xs ${BADGE[confianza]}`}>
          {BADGE_LABEL[confianza]}
        </span>
      </div>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={confianza === "no_legible" ? "No se pudo leer — completar a mano" : ""}
        className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm"
      />
    </div>
  );
}

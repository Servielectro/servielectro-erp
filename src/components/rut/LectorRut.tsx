"use client";

import { useRef } from "react";
import { useLecturaRut, type FaseLectura, type RutLeido } from "@/lib/rut/useLecturaRut";

/** La línea de progreso: con cuál servicio, cuántos segundos, y por qué pasó al siguiente. */
export function ProgresoLectura({ estado, onCancelar }: { estado: FaseLectura; onCancelar: () => void }) {
  if (estado.fase === "inactivo") return null;
  if (estado.fase === "error") return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{estado.mensaje}</p>;
  return (
    <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
      {estado.fase === "subiendo" ? (
        <p>Subiendo el archivo… {estado.segundos} s</p>
      ) : (
        <>
          {estado.fallosPrevios.map((f, i) => (
            <p key={i} className="text-xs text-amber-800">
              Servicio {i + 1}: {f}.
            </p>
          ))}
          <p>
            {estado.numero === 1 ? "Leyendo el RUT" : "Probando con el segundo servicio"} ({estado.proveedor}
            {estado.de > 1 ? `, ${estado.numero} de ${estado.de}` : ""})… {estado.segundos} s
          </p>
          {estado.segundos >= 12 && <p className="text-xs text-slate-500">Si en 20 s no responde, se pasa solo al siguiente.</p>}
        </>
      )}
      <button type="button" onClick={onCancelar} className="min-h-11 text-sm font-semibold underline">
        Dejar así y llenar a mano
      </button>
    </div>
  );
}

/**
 * "Llenar desde el RUT": el MISMO componente en Administrativo → Clientes y en "Nuevo cliente"
 * (visitas, CRM, cotización). Devuelve lo leído; quien lo usa lo muestra como propuesta.
 */
export function LectorRut({
  clienteId,
  onLeido,
  texto = "📄 Llenar desde el RUT (PDF o foto)",
}: {
  clienteId?: string | null;
  onLeido: (r: RutLeido) => void;
  texto?: string;
}) {
  const { estado, leer, cancelar } = useLecturaRut();
  const camara = useRef<HTMLInputElement>(null);
  const ocupado = estado.fase === "subiendo" || estado.fase === "leyendo";
  async function elegido(f: File | undefined) {
    if (!f) return;
    const r = await leer(f, { clienteId });
    if (r) onLeido(r);
  }
  return (
    <div className="space-y-2">
      {!ocupado && (
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-400 bg-white px-3 text-sm font-semibold text-slate-800">
            {texto}
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void elegido(f); }} />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-400 bg-white px-3 text-sm font-semibold text-slate-800">
            📷 Foto
            <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void elegido(f); }} />
          </label>
        </div>
      )}
      <ProgresoLectura estado={estado} onCancelar={cancelar} />
    </div>
  );
}

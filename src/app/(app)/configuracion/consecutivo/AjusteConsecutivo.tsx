"use client";

import { useState, useTransition } from "react";
import { ajustarConsecutivo } from "./actions";

function codigo(anio: number, numero: number): string {
  return `CSE-${String(anio % 100).padStart(2, "0")}-${String(numero).padStart(3, "0")}`;
}

export function AjusteConsecutivo({
  anio,
  ultimoNumero,
  mayorEmitido,
}: {
  anio: number;
  ultimoNumero: number;
  mayorEmitido: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState(String(ultimoNumero));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const valor = Number(numero);
  const valido = /^\d+$/.test(numero.trim());
  const bajoEmitido = valido && valor < mayorEmitido;

  function guardar() {
    setError(null);
    setOk(false);
    if (!valido) return setError("Escribe un número entero.");
    if (bajoEmitido) {
      return setError(
        `Ya existe ${codigo(anio, mayorEmitido)} en el sistema: el último usado no puede ser menor que ${mayorEmitido}.`,
      );
    }
    if (!motivo.trim()) return setError("Escribe el motivo del cambio: queda en el historial.");
    if (
      !window.confirm(
        `¿Cambiar el último usado de ${anio} a ${codigo(anio, valor)}?\n\nLa próxima cotización saldrá como ${codigo(anio, valor + 1)}.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await ajustarConsecutivo({ anio, ultimoNumero: valor, motivo });
      if (!res.ok) return setError(res.error);
      setOk(true);
      setMotivo("");
      setAbierto(false);
    });
  }

  if (!abierto) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            setNumero(String(ultimoNumero));
            setAbierto(true);
            setOk(false);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 active:bg-slate-100"
        >
          Ajustar
        </button>
        {ok && <span className="ml-2 text-xs text-green-700">Cambio guardado.</span>}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
      <div>
        <label className="text-xs text-slate-600">Último número usado</label>
        <input
          inputMode="numeric"
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/[^0-9]/g, ""))}
          className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
        {valido && (
          <p className={`mt-1 text-xs ${bajoEmitido ? "text-red-700" : "text-slate-600"}`}>
            Próxima cotización: <span className="font-mono">{codigo(anio, valor + 1)}</span>
          </p>
        )}
      </div>
      <div>
        <label className="text-xs text-slate-600">Motivo (queda en el historial)</label>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. Ajuste a la numeración real del año"
          className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={pendiente}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar cambio"}
        </button>
      </div>
    </div>
  );
}

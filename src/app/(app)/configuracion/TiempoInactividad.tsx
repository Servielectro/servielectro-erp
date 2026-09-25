"use client";

import { useEffect, useState } from "react";
import {
  MINUTOS_INACTIVIDAD_DEFAULT,
  OPCIONES_MINUTOS_INACTIVIDAD,
  guardarMinutosInactividad,
  leerMinutosInactividad,
} from "@/lib/inactividad";

export function TiempoInactividad() {
  const [minutos, setMinutos] = useState<number | null>(null);

  // localStorage no existe en el servidor: se lee al montar.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMinutos(leerMinutosInactividad());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <span className="text-2xl">⏱️</span>
      <div className="min-w-0 flex-1">
        <label
          htmlFor="minutos-inactividad"
          className="text-sm font-semibold text-slate-900"
        >
          Cerrar sesión por inactividad
        </label>
        <p className="text-xs text-slate-600">
          Solo en este dispositivo. Avisa un minuto antes.
        </p>
      </div>
      <select
        id="minutos-inactividad"
        value={minutos ?? MINUTOS_INACTIVIDAD_DEFAULT}
        disabled={minutos === null}
        onChange={(e) => {
          const n = Number(e.target.value);
          guardarMinutosInactividad(n);
          setMinutos(n);
        }}
        className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
      >
        {OPCIONES_MINUTOS_INACTIVIDAD.map((m) => (
          <option key={m} value={m}>
            {m} min{m === MINUTOS_INACTIVIDAD_DEFAULT ? " (recomendado)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

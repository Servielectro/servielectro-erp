"use client";

import { useState } from "react";
import { seAparto, type Campo, type Columna } from "@/lib/sst/plantillas";

const CAMPO = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50 disabled:text-slate-800";

export interface ArchivoVista {
  id: string;
  url: string | null; // null = todavía sin imagen a la mano (subido, sin enlace)
  pendiente?: boolean;
}

/**
 * Dibuja cualquier plantilla (los campos son datos). Lo usan la vista previa del armador, el
 * llenado en sitio y la consulta en la oficina. Sin `onCambio` es de solo lectura.
 */
export function FormularioSst({
  campos,
  respuestas,
  onCambio,
  archivos = {},
  onFoto,
  onFirmaCampo,
  onUbicacion,
  bloqueadoPor,
}: {
  campos: Campo[];
  respuestas: Record<string, unknown>;
  onCambio?: (id: string, valor: unknown) => void;
  archivos?: Record<string, ArchivoVista[]>;
  onFoto?: (campoId: string, archivo: File) => void;
  onFirmaCampo?: (campoId: string, etiqueta: string) => void;
  onUbicacion?: (campoId: string) => void;
  /** Por qué no se puede editar (se muestra arriba). */
  bloqueadoPor?: string | null;
}) {
  const dis = !onCambio || !!bloqueadoPor;
  return (
    <div className="space-y-4">
      {bloqueadoPor && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{bloqueadoPor}</p>}
      {campos.map((c) => {
        if (c.tipo === "seccion") {
          return (
            <h3 key={c.id} className="border-b border-slate-300 pb-1 pt-2 text-base font-bold text-slate-900">
              {c.etiqueta}
              {c.ayuda && <span className="block text-xs font-normal text-slate-500">{c.ayuda}</span>}
            </h3>
          );
        }
        const v = respuestas[c.id];
        const aparte = seAparto(c, respuestas);
        return (
          <div key={c.id}>
            <p className="text-sm font-medium text-slate-900">
              {c.etiqueta}
              {c.obligatorio && <span className="text-red-700"> *</span>}
              {c.calculado && <span className="ml-1 text-xs font-normal text-slate-500">(calculada)</span>}
            </p>
            {c.ayuda && <p className="text-xs text-slate-500">{c.ayuda}</p>}
            {c.calculado && !v && <p className="text-xs text-amber-800">Se calcula con la fecha del acta, el inicio de labores y el plazo (al sincronizar, si este celular no tiene el calendario de festivos).</p>}
            <Control c={c} v={v} dis={dis || !!c.calculado} onCambio={(x) => onCambio?.(c.id, x)} />
            {aparte && (
              <details className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-900">
                <summary className="cursor-pointer font-semibold">⚠ Se apartó de lo que traía (para el alcance: del contrato confirmado)</summary>
                <p className="mt-1 whitespace-pre-line text-xs text-amber-900">{aparte.original}</p>
              </details>
            )}
            {(c.tipo === "foto" || c.tipo === "firma") && (
              <div className="mt-1 space-y-2">
                {(archivos[c.id] ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(archivos[c.id] ?? []).map((a) =>
                      a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={a.id} src={a.url} alt={c.etiqueta} className={`h-24 w-24 rounded-md border border-slate-200 object-cover ${c.tipo === "firma" ? "bg-white object-contain" : ""}`} />
                      ) : (
                        <span key={a.id} className="flex h-24 w-24 items-center justify-center rounded-md border border-slate-200 text-xs text-slate-500">
                          {a.pendiente ? "Por subir" : "Guardada"}
                        </span>
                      ),
                    )}
                  </div>
                )}
                {!dis && c.tipo === "foto" && onFoto && (
                  <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-slate-400 px-3 text-sm font-semibold">
                    📷 {(archivos[c.id] ?? []).length ? "Otra foto" : "Tomar foto"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) onFoto(c.id, f);
                      }}
                    />
                  </label>
                )}
                {!dis && c.tipo === "firma" && onFirmaCampo && !(archivos[c.id] ?? []).length && (
                  <button type="button" onClick={() => onFirmaCampo(c.id, c.etiqueta)} className="flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-slate-400 text-sm font-semibold">
                    ✍ Firmar aquí
                  </button>
                )}
                {dis && !(archivos[c.id] ?? []).length && <p className="text-sm text-slate-500">Sin {c.tipo === "foto" ? "fotos" : "firma"}.</p>}
              </div>
            )}
            {c.tipo === "ubicacion" && (
              <div className="mt-1">
                {v && typeof v === "object" && "lat" in (v as object) ? (
                  <p className="text-sm text-slate-700">
                    📍 {(v as { lat: number }).lat.toFixed(5)}, {(v as { lng: number }).lng.toFixed(5)}
                    {(v as { precision?: number }).precision ? ` (±${Math.round((v as { precision: number }).precision)} m)` : ""}
                  </p>
                ) : v && typeof v === "object" && "estado" in (v as object) ? (
                  <p className="text-sm text-amber-800">Sin ubicación: {(v as { estado: string }).estado.replace("_", " ")}.</p>
                ) : (
                  dis && <p className="text-sm text-slate-500">Sin ubicación.</p>
                )}
                {!dis && onUbicacion && (
                  <button type="button" onClick={() => onUbicacion(c.id)} className="mt-1 flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-slate-400 text-sm font-semibold">
                    📍 {v ? "Tomar de nuevo" : "Tomar ubicación"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Control({ c, v, dis, onCambio }: { c: Campo; v: unknown; dis: boolean; onCambio: (x: unknown) => void }) {
  switch (c.tipo) {
    case "texto":
      return <input disabled={dis} value={(v as string) ?? ""} onChange={(e) => onCambio(e.target.value)} className={CAMPO} />;
    case "texto_largo":
      return <textarea disabled={dis} value={(v as string) ?? ""} onChange={(e) => onCambio(e.target.value)} rows={3} className={CAMPO} />;
    case "numero":
      return <input disabled={dis} inputMode="decimal" value={(v as string) ?? ""} onChange={(e) => onCambio(e.target.value)} className={CAMPO} />;
    case "fecha":
      return <input disabled={dis} type="date" value={(v as string) ?? ""} onChange={(e) => onCambio(e.target.value)} className={CAMPO} />;
    case "hora":
      return <input disabled={dis} type="time" value={(v as string) ?? ""} onChange={(e) => onCambio(e.target.value)} className={CAMPO} />;
    case "si_no":
      return <SiNo v={v} dis={dis} onCambio={onCambio} />;
    case "lista":
      return <Lista opciones={c.opciones ?? []} multiple={!!c.multiple} v={v} dis={dis} onCambio={onCambio} />;
    case "tabla":
      return <Tabla columnas={c.columnas ?? []} v={v} dis={dis} onCambio={onCambio} />;
    default:
      return null;
  }
}

function SiNo({ v, dis, onCambio }: { v: unknown; dis: boolean; onCambio: (x: unknown) => void }) {
  return (
    <div className="mt-1 flex gap-2">
      {[
        [true, "Sí"],
        [false, "No"],
      ].map(([valor, texto]) => (
        <button
          key={String(valor)}
          type="button"
          disabled={dis}
          aria-pressed={v === valor}
          onClick={() => onCambio(v === valor ? null : valor)}
          className={`min-h-11 flex-1 rounded-lg border-2 text-sm font-semibold ${v === valor ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"} disabled:opacity-80`}
        >
          {texto as string}
        </button>
      ))}
    </div>
  );
}

function Lista({ opciones, multiple, v, dis, onCambio }: { opciones: string[]; multiple: boolean; v: unknown; dis: boolean; onCambio: (x: unknown) => void }) {
  const elegidas = multiple ? ((v as string[]) ?? []) : v ? [v as string] : [];
  return (
    <div className="mt-1 space-y-1">
      {opciones.map((o) => {
        const on = elegidas.includes(o);
        return (
          <label key={o} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${on ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
            <input
              type={multiple ? "checkbox" : "radio"}
              disabled={dis}
              checked={on}
              onChange={() => onCambio(multiple ? (on ? elegidas.filter((x) => x !== o) : [...elegidas, o]) : on ? null : o)}
              className="h-5 w-5"
            />
            {o}
          </label>
        );
      })}
    </div>
  );
}

function Tabla({ columnas, v, dis, onCambio }: { columnas: Columna[]; v: unknown; dis: boolean; onCambio: (x: unknown) => void }) {
  const filas = (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  const [abierta, setAbierta] = useState<number | null>(null);
  const poner = (i: number, col: string, x: unknown) => onCambio(filas.map((f, j) => (j === i ? { ...f, [col]: x } : f)));
  return (
    <div className="mt-1 space-y-2">
      {filas.length === 0 && <p className="text-sm text-slate-500">Sin filas.</p>}
      {filas.map((f, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2">
          <button type="button" onClick={() => setAbierta(abierta === i ? null : i)} className="flex min-h-11 w-full items-center justify-between text-left text-sm">
            <span className="font-medium">
              {i + 1}. {columnas.map((c) => (f[c.id] === true ? "Sí" : f[c.id] === false ? "No" : (f[c.id] as string) || "—")).join(" · ")}
            </span>
            {!dis && <span className="text-xs text-slate-500">{abierta === i ? "Cerrar" : "Editar"}</span>}
          </button>
          {abierta === i && !dis && (
            <div className="space-y-2 border-t border-slate-100 pt-2">
              {columnas.map((col) => (
                <div key={col.id}>
                  <p className="text-xs font-medium text-slate-700">{col.etiqueta}</p>
                  <Control c={{ ...col, tipo: col.tipo }} v={f[col.id]} dis={dis} onCambio={(x) => poner(i, col.id, x)} />
                </div>
              ))}
              <button type="button" onClick={() => { onCambio(filas.filter((_, j) => j !== i)); setAbierta(null); }} className="min-h-11 text-sm text-red-800 underline">
                Quitar esta fila
              </button>
            </div>
          )}
        </div>
      ))}
      {!dis && (
        <button
          type="button"
          onClick={() => {
            onCambio([...filas, {}]);
            setAbierta(filas.length);
          }}
          className="flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-400 text-sm font-semibold"
        >
          + Agregar fila
        </button>
      )}
    </div>
  );
}

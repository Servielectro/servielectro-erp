"use client";

import { useEffect, useRef, useState } from "react";

// Graba en el celular a 32 kbps (≈15 MB por hora, dentro del tope de 50 MB de Storage). Los
// trozos se piden cada 10 s para no perder la reunión si el navegador se cierra al final.
// Mantiene la pantalla encendida mientras graba (en iPhone, si se bloquea, Safari corta el micrófono).
const BITS = 32_000;

function tipoSoportado(): string {
  const tipos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return tipos.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

const reloj = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function Grabador({ onListo }: { onListo: (audio: Blob, duracionS: number) => void }) {
  const [estado, setEstado] = useState<"quieto" | "grabando" | "pausa">("quieto");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sinBloqueo, setSinBloqueo] = useState(false);
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const pantalla = useRef<{ release: () => Promise<void> } | null>(null);
  const segundosRef = useRef(0);
  useEffect(() => {
    segundosRef.current = segundos;
  }, [segundos]);

  useEffect(() => {
    if (estado !== "grabando") return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);

  useEffect(
    () => () => {
      grabadora.current?.stream.getTracks().forEach((t) => t.stop());
      void pantalla.current?.release();
    },
    [],
  );

  async function empezar() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return setError("Este navegador no graba audio. Graba con la app de grabadora del celular y súbelo abajo.");
    }
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const tipo = tipoSoportado();
      const g = new MediaRecorder(flujo, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: BITS });
      trozos.current = [];
      g.ondataavailable = (e) => {
        if (e.data.size) trozos.current.push(e.data);
      };
      g.onstop = () => {
        flujo.getTracks().forEach((t) => t.stop());
        void pantalla.current?.release();
        pantalla.current = null;
        onListo(new Blob(trozos.current, { type: g.mimeType || tipo || "audio/webm" }), segundosRef.current);
      };
      g.start(10_000);
      grabadora.current = g;
      setSegundos(0);
      setEstado("grabando");
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        pantalla.current = (await wl?.request("screen")) ?? null;
      } catch {
        pantalla.current = null;
      }
      setSinBloqueo(!pantalla.current);
    } catch {
      setError("No se pudo usar el micrófono. Revisa el permiso del navegador para este sitio.");
    }
  }

  if (estado === "quieto") {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => void empezar()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-red-700 text-base font-semibold text-white">
          ● Empezar a grabar
        </button>
        <p className="text-xs text-slate-500">Deja el celular en la mesa, con la pantalla encendida, mientras dure la reunión.</p>
        {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border-2 border-red-300 bg-red-50 p-3 text-center">
      <p className="text-sm font-semibold text-red-800">{estado === "grabando" ? "● Grabando" : "En pausa"}</p>
      <p className="font-mono text-3xl font-bold text-slate-900">{reloj(segundos)}</p>
      <div className="flex gap-2">
        {estado === "grabando" ? (
          <button
            type="button"
            onClick={() => {
              grabadora.current?.pause();
              setEstado("pausa");
            }}
            className="min-h-12 flex-1 rounded-lg border border-slate-400 bg-white text-sm font-semibold"
          >
            Pausar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              grabadora.current?.resume();
              setEstado("grabando");
            }}
            className="min-h-12 flex-1 rounded-lg border border-slate-400 bg-white text-sm font-semibold"
          >
            Continuar
          </button>
        )}
        <button type="button" onClick={() => grabadora.current?.stop()} className="min-h-12 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white">
          Terminar y subir
        </button>
      </div>
      {sinBloqueo && <p className="text-xs text-amber-800">Este celular no deja mantener la pantalla encendida: no la bloquees mientras graba.</p>}
    </div>
  );
}

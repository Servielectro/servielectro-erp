"use client";

import { useState } from "react";
import { eliminarTareaDefinitivo, eliminarVisitaDefinitivo } from "@/app/(app)/eliminar-actions";

/**
 * "Eliminar definitivamente": borra y NO se recupera. Distinto de Archivar (guardar, reversible,
 * sin contraseña). Pide motivo y la contraseña del usuario, cada vez. La contraseña vive solo en
 * este formulario mientras dura el envío: se vacía al terminar, salga bien o mal.
 * Si la base dice que hay trabajo hecho, ofrece archivar ahí mismo.
 */
export function EliminarDefinitivo({
  tipo,
  id,
  titulo,
  onEliminado,
  onArchivar,
}: {
  tipo: "tarea" | "visita";
  id: string;
  titulo: string;
  onEliminado: (aviso: string | null) => void;
  /** Si se pasa y la base no deja eliminar por tener trabajo, se ofrece archivar. */
  onArchivar?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ofrecerArchivar, setOfrecerArchivar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cerrar = () => {
    setAbierto(false);
    setContrasena("");
    setError(null);
    setOfrecerArchivar(false);
  };

  async function enviar() {
    setEnviando(true);
    setError(null);
    setOfrecerArchivar(false);
    try {
      const r =
        tipo === "tarea"
          ? await eliminarTareaDefinitivo(id, motivo, contrasena)
          : await eliminarVisitaDefinitivo(id, motivo, contrasena);
      if (!r.ok) {
        setError(r.error);
        setOfrecerArchivar(Boolean(r.ofrecerArchivar && onArchivar));
        return;
      }
      cerrar();
      onEliminado(r.aviso);
    } finally {
      setContrasena("");
      setEnviando(false);
    }
  }

  const faltan = [!motivo.trim() && "el motivo", !contrasena && "tu contraseña"].filter(Boolean);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-700 underline"
      >
        Eliminar definitivamente
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/60 p-3 sm:items-center" role="dialog" aria-label="Eliminar definitivamente">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (faltan.length === 0 && !enviando) void enviar();
        }}
        className="w-full max-w-md space-y-2 rounded-xl bg-white p-4 text-sm"
      >
        <p className="text-base font-bold text-red-800">Eliminar definitivamente</p>
        <p className="font-semibold text-slate-900">{titulo}</p>
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-900">
          {tipo === "visita"
            ? "Se borra la visita entera: jornadas, fotos, firmas, sugerencias y sus archivos."
            : "Se borra la tarea con sus subtareas."}{" "}
          <span className="font-semibold">No se recupera.</span> Si solo quieres sacarla de la vista, archívala.
        </p>
        <label className="block">
          <span className="text-xs text-slate-600">Motivo *</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={tipo === "visita" ? "Ej.: visita de prueba" : "Ej.: creada por error"}
            className="mt-0.5 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-base"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Tu contraseña *</span>
          <input
            type="password"
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            className="mt-0.5 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-base"
          />
        </label>
        {error && <p className="rounded-md bg-red-100 px-2 py-1 text-red-800">{error}</p>}
        {ofrecerArchivar && onArchivar && (
          <button
            type="button"
            onClick={() => {
              cerrar();
              onArchivar();
            }}
            className="min-h-11 w-full rounded-lg border-2 border-slate-900 px-3 font-semibold text-slate-900"
          >
            Archivarla en su lugar (se puede recuperar)
          </button>
        )}
        {faltan.length > 0 && <p className="text-xs text-slate-600">Para eliminar falta {faltan.join(" y ")}.</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={cerrar} disabled={enviando} className="min-h-11 rounded-lg border border-slate-400 px-4 font-medium">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando || faltan.length > 0}
            className="min-h-11 flex-1 rounded-lg bg-red-700 px-4 font-semibold text-white disabled:opacity-40"
          >
            {enviando ? "Eliminando…" : "Eliminar definitivamente"}
          </button>
        </div>
      </form>
    </div>
  );
}

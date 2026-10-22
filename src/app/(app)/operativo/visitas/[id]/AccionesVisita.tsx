"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarVisita, reasignarVisita, recuperarVisita } from "../../actions";
import { EliminarDefinitivo } from "@/components/eliminar/EliminarDefinitivo";

/**
 * Cambiar el técnico y "Archivar" (cancelar, se puede recuperar) una visita que todavía no
 * empezó. Ya empezada no se puede, y se dice por qué (no se apaga en silencio).
 */
export function AccionesVisita({
  visitaId,
  estado,
  tecnicoId,
  tecnicos,
  titulo,
}: {
  visitaId: string;
  titulo: string;
  estado: string;
  tecnicoId: string | null;
  tecnicos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState(tecnicoId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  // Eliminar de verdad (contraseña cada vez): la visita ya no existe, se vuelve a la lista.
  const eliminar = (
    <EliminarDefinitivo
      tipo="visita"
      id={visitaId}
      titulo={titulo}
      onEliminado={(avisoArchivos) => {
        if (avisoArchivos) window.alert(avisoArchivos);
        router.push("/operativo");
      }}
    />
  );

  const correr = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) =>
    empezar(async () => {
      setError(null);
      setAviso(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setAviso(ok);
      router.refresh();
    });

  if (estado === "cancelada") {
    return (
      <div className="space-y-2 rounded-lg border-2 border-slate-300 bg-slate-50 p-3 text-sm">
        <p className="font-semibold text-slate-900">Visita archivada (cancelada).</p>
        <p className="text-slate-600">El técnico no la ve. No se borró nada: con “Recuperar” vuelve a programada.</p>
        {error && <p className="rounded-md bg-red-100 px-2 py-1 text-red-800">{error}</p>}
        <button
          type="button"
          disabled={pendiente}
          onClick={() => correr(() => recuperarVisita(visitaId), "Visita recuperada.")}
          className="min-h-11 rounded-lg border-2 border-green-600 px-4 font-semibold text-green-800 disabled:opacity-50"
        >
          {pendiente ? "Recuperando…" : "Recuperar"}
        </button>
        <div>{eliminar}</div>
      </div>
    );
  }

  if (estado !== "programada") {
    return (
      <div className="space-y-1 text-sm">
        <p className="text-slate-600">
          La visita ya empezó: no se cambia el técnico ni se archiva (el técnico tiene evidencia en su celular). Si
          era de prueba o de error, se puede eliminar definitivamente.
        </p>
        {eliminar}
      </div>
    );
  }

  const otro = nuevo && nuevo !== tecnicoId;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="text-xs text-slate-600">Técnico</span>
          <select
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            className="mt-0.5 min-h-11 w-full rounded-md border border-slate-300 bg-white px-2 text-base"
          >
            {!tecnicoId && <option value="">Elige el técnico…</option>}
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pendiente || !otro}
          onClick={() => correr(() => reasignarVisita(visitaId, nuevo), "Técnico cambiado. El nuevo todavía no la vio.")}
          className="min-h-11 rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:opacity-40"
        >
          Cambiar técnico
        </button>
      </div>
      {!otro && <p className="text-xs text-slate-500">Elige otro técnico para cambiarlo.</p>}
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          if (
            window.confirm(
              "La visita se archiva (cancela): el técnico deja de verla, no se borra nada y se puede recuperar desde esta pantalla.\n\n¿Archivarla?",
            )
          ) {
            correr(() => cancelarVisita(visitaId), "Visita archivada (cancelada). Se puede recuperar.");
          }
        }}
        className="min-h-11 rounded-lg border-2 border-red-300 px-4 font-semibold text-red-800 disabled:opacity-50"
      >
        Archivar
      </button>
      {eliminar}
      {aviso && <p className="rounded-md bg-green-100 px-2 py-1 text-green-900">{aviso}</p>}
      {error && <p className="rounded-md bg-red-100 px-2 py-1 text-red-800">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GRUPO_TIPO, haceCuanto, type Notificacion, type TipoNotificacion } from "@/lib/notificaciones";

export function ListaNotificaciones({ iniciales }: { iniciales: Notificacion[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(iniciales);
  const [error, setError] = useState<string | null>(null);
  const noLeidas = lista.filter((n) => !n.leida_en).length;

  async function marcar(ids: string[] | "todas") {
    setError(null);
    const ahora = new Date().toISOString();
    let q = createClient().from("notificaciones").update({ leida_en: ahora }).is("leida_en", null);
    if (ids !== "todas") q = q.in("id", ids);
    const { error: e } = await q;
    if (e) return setError(`No se pudo marcar: ${e.message}`);
    setLista((l) => l.map((n) => (ids === "todas" || ids.includes(n.id) ? { ...n, leida_en: n.leida_en ?? ahora } : n)));
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1">
        <p className="text-sm text-slate-600">{noLeidas ? `${noLeidas} sin leer` : "Todas leídas"}</p>
        {noLeidas > 0 && (
          <button type="button" onClick={() => void marcar("todas")} className="min-h-11 text-sm font-semibold underline">
            Marcar todas como leídas
          </button>
        )}
      </div>
      {error && <p className="bg-red-50 px-3 py-1.5 text-sm text-red-800">{error}</p>}
      {lista.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-slate-500">No tienes notificaciones.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lista.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  if (!n.leida_en) void marcar([n.id]);
                  if (n.ruta) router.push(n.ruta);
                }}
                className={`flex w-full items-start gap-2 px-3 py-3 text-left ${n.leida_en ? "" : "bg-sky-50/60"}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.leida_en ? "bg-transparent" : n.urgente ? "bg-red-600" : "bg-sky-600"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block text-base ${n.leida_en ? "text-slate-700" : "font-semibold text-slate-900"} ${n.urgente && !n.leida_en ? "text-red-800" : ""}`}>{n.titulo}</span>
                  {n.cuerpo && <span className="block text-sm text-slate-600">{n.cuerpo}</span>}
                  <span className="block text-xs text-slate-400">
                    {haceCuanto(n.creada_en)}
                    {n.ruta ? " · tocar para ir" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Qué me avisa. Cada tipo trae su valor por defecto ("gasto registrado" viene apagada); lo que la
 * persona elige se guarda solo para ella (la base no deja tocar las de otros).
 */
export function PreferenciasNotificaciones({ tipos, prefs, yo }: { tipos: TipoNotificacion[]; prefs: Record<string, boolean>; yo: string }) {
  const [estado, setEstado] = useState<Record<string, boolean>>(() => Object.fromEntries(tipos.map((t) => [t.id, prefs[t.id] ?? t.por_defecto])));
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(t: TipoNotificacion, activa: boolean) {
    setError(null);
    setGuardando(t.id);
    const { error: e } = await createClient()
      .from("notificacion_preferencias")
      .upsert({ perfil_id: yo, tipo: t.id, activa, actualizada_en: new Date().toISOString() }, { onConflict: "perfil_id,tipo" });
    setGuardando(null);
    if (e) return setError(`No se guardó “${t.nombre}”: ${e.message}`);
    setEstado((s) => ({ ...s, [t.id]: activa }));
  }

  const grupos = (Object.keys(GRUPO_TIPO) as TipoNotificacion["para"][]).filter((g) => tipos.some((t) => t.para === g));
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-900">Qué me avisa</h2>
      <p className="mb-2 text-xs text-slate-500">
        Apaga lo que no te sirve: si llegan demasiadas, se dejan de mirar y se pierde la importante. Solo aparecen las que te pueden llegar.
      </p>
      {error && <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
      {grupos.map((g) => (
        <div key={g} className="mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{GRUPO_TIPO[g]}</p>
          <ul className="divide-y divide-slate-100">
            {tipos
              .filter((t) => t.para === g)
              .map((t) => (
                <li key={t.id}>
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{t.nombre}</span>
                      <span className="block text-xs text-slate-500">{t.descripcion}</span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={estado[t.id]}
                      disabled={guardando === t.id}
                      onChange={(e) => void cambiar(t, e.target.checked)}
                      className="h-6 w-6 shrink-0"
                    />
                  </label>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

"use client";

import type { GrupoCompartir } from "@/lib/supabase/tareas";
import type { Participante } from "@/lib/tareas";

const clave = (p: Participante) => (p.perfilId ? `p:${p.perfilId}` : `g:${p.grupoId}`);

/**
 * "Con quién": personas y grupos para una tarea o un evento compartido. Solo ofrece
 * personas con Planificación (las que tienen agenda donde verlo) y grupos activos; avisa si
 * en un grupo hay quien no lo va a ver. La base lo exige igual.
 */
export function ElegirParticipantes({
  yo,
  personas,
  grupos,
  valor,
  onCambiar,
  soloLectura = false,
  que = "la",
}: {
  yo: string;
  personas: { id: string; nombre: string }[];
  grupos: GrupoCompartir[];
  valor: Participante[];
  onCambiar: (v: Participante[]) => void;
  soloLectura?: boolean;
  /** "la" (tarea) o "lo" (evento), para el aviso. */
  que?: "la" | "lo";
}) {
  const elegidos = new Set(valor.map(clave));
  const nombrePersona = new Map(personas.map((p) => [p.id, p.nombre]));
  const nombreGrupo = new Map(grupos.map((g) => [g.id, g.nombre]));

  if (soloLectura) {
    return (
      <p className="mt-1 text-base text-slate-700">
        {valor
          .map((p) => (p.perfilId ? nombrePersona.get(p.perfilId) ?? "—" : `👥 ${nombreGrupo.get(p.grupoId!) ?? "Grupo"}`))
          .join(", ") || "—"}
      </p>
    );
  }

  function alternar(p: Participante) {
    const k = clave(p);
    onCambiar(elegidos.has(k) ? valor.filter((x) => clave(x) !== k) : [...valor, p]);
  }

  const otras = personas.filter((p) => p.id !== yo);
  const chip = (activo: boolean) =>
    `min-h-11 rounded-full border-2 px-3 text-sm ${activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`;

  return (
    <div>
      {grupos.length > 0 && (
        <>
          <p className="mt-1 text-xs font-semibold uppercase text-slate-500">Grupos</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {grupos.map((g) => (
              <button key={g.id} type="button" onClick={() => alternar({ perfilId: null, grupoId: g.id })} className={chip(elegidos.has(`g:${g.id}`))}>
                👥 {g.nombre}
                {g.miembros !== null && <span className="opacity-70"> · {g.miembros}</span>}
              </button>
            ))}
          </div>
          {grupos
            .filter((g) => elegidos.has(`g:${g.id}`) && (g.sinPlanificacion ?? 0) > 0)
            .map((g) => (
              <p key={g.id} className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                En “{g.nombre}”, {g.sinPlanificacion} de {g.miembros} no tienen Planificación: no {que} van a ver.
              </p>
            ))}
        </>
      )}
      <p className="mt-2 text-xs font-semibold uppercase text-slate-500">Personas</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {otras.map((p) => (
          <button key={p.id} type="button" onClick={() => alternar({ perfilId: p.id, grupoId: null })} className={chip(elegidos.has(`p:${p.id}`))}>
            {p.nombre}
          </button>
        ))}
        {otras.length === 0 && <p className="text-sm text-slate-500">Nadie más tiene Planificación todavía.</p>}
      </div>
    </div>
  );
}

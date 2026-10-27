"use client";

import type { Acta, Compromiso, Parte } from "@/lib/reuniones/acta";

const CAMPO = "mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-800";
const PARTES: Parte[] = ["servielectro", "cliente", "tercero"];
const NOMBRE_PARTE: Record<Parte, string> = { servielectro: "Servielectro", cliente: "Cliente", tercero: "Tercero" };

/** Listas de frases: una por renglón (vacíos fuera al guardar). */
function Lista({ titulo, valor, editable, onCambio, aviso }: { titulo: string; valor: string[]; editable: boolean; onCambio: (v: string[]) => void; aviso?: boolean }) {
  if (!editable && valor.length === 0) return null;
  return (
    <label className={`block text-sm font-semibold ${aviso ? "text-amber-900" : "text-slate-900"}`}>
      {titulo}
      {editable ? (
        <textarea value={valor.join("\n")} onChange={(e) => onCambio(e.target.value.split("\n"))} rows={Math.max(2, valor.length + 1)} className={`${CAMPO} font-normal`} placeholder="Uno por renglón" />
      ) : (
        <ul className="mt-0.5 list-disc pl-5 font-normal">
          {valor.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </label>
  );
}

/**
 * El acta de una reunión, para revisar (editable) o leer. Es la estructura del prompt 02_acta.md.
 * Las inconsistencias van arriba y resaltadas: son lo que hay que resolver antes de aprobar.
 */
export function EditorActa({ acta, editable, onCambio }: { acta: Acta; editable: boolean; onCambio: (a: Acta) => void }) {
  const poner = (c: Partial<Acta>) => onCambio({ ...acta, ...c });
  const ponerCompromiso = (i: number, c: Partial<Compromiso>) => poner({ compromisos: acta.compromisos.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  return (
    <div className="space-y-3">
      {acta.inconsistencias.filter((x) => x.trim()).length > 0 && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-2">
          <Lista titulo="⚠ Inconsistencias detectadas (requieren tu validación antes de aprobar)" valor={acta.inconsistencias} editable={editable} onCambio={(v) => poner({ inconsistencias: v })} aviso />
        </div>
      )}
      <label className="block text-sm font-semibold">
        Título
        <input disabled={!editable} value={acta.titulo} onChange={(e) => poner({ titulo: e.target.value })} className={`${CAMPO} font-normal`} />
      </label>
      <label className="block text-sm font-semibold">
        Cliente o contraparte
        <input disabled={!editable} value={acta.cliente} onChange={(e) => poner({ cliente: e.target.value })} className={`${CAMPO} font-normal`} />
      </label>

      <div>
        <p className="text-sm font-semibold">Participantes</p>
        <ul className="mt-1 space-y-1">
          {acta.participantes.map((p, i) => (
            <li key={i} className="flex flex-wrap gap-1">
              <input disabled={!editable} value={p.nombre} onChange={(e) => poner({ participantes: acta.participantes.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} className={`${CAMPO} mt-0 min-w-0 flex-[2]`} aria-label="Nombre" />
              <input disabled={!editable} value={p.rol} onChange={(e) => poner({ participantes: acta.participantes.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)) })} placeholder="Rol" className={`${CAMPO} mt-0 min-w-0 flex-1`} aria-label="Rol" />
              <select disabled={!editable} value={p.parte} onChange={(e) => poner({ participantes: acta.participantes.map((x, j) => (j === i ? { ...x, parte: e.target.value as Parte } : x)) })} className={`${CAMPO} mt-0 w-auto`} aria-label="Parte">
                {PARTES.map((x) => (
                  <option key={x} value={x}>
                    {NOMBRE_PARTE[x]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>

      <label className="block text-sm font-semibold">
        Resumen ejecutivo
        <textarea disabled={!editable} value={acta.resumen_ejecutivo} onChange={(e) => poner({ resumen_ejecutivo: e.target.value })} rows={4} className={`${CAMPO} font-normal`} />
      </label>

      <div>
        <p className="text-sm font-semibold">Temas tratados</p>
        <ol className="mt-1 space-y-2">
          {acta.temas.map((t, i) => (
            <li key={i} className="rounded-md border border-slate-200 p-2">
              <input disabled={!editable} value={t.tema} onChange={(e) => poner({ temas: acta.temas.map((x, j) => (j === i ? { ...x, tema: e.target.value } : x)) })} className={`${CAMPO} mt-0 font-semibold`} aria-label="Tema" />
              <textarea disabled={!editable} value={t.desarrollo} onChange={(e) => poner({ temas: acta.temas.map((x, j) => (j === i ? { ...x, desarrollo: e.target.value } : x)) })} rows={3} className={CAMPO} aria-label="Desarrollo" />
            </li>
          ))}
        </ol>
      </div>

      <Lista titulo="Puntos clave" valor={acta.puntos_clave} editable={editable} onCambio={(v) => poner({ puntos_clave: v })} />
      <Lista titulo="Decisiones" valor={acta.decisiones} editable={editable} onCambio={(v) => poner({ decisiones: v })} />
      <Lista titulo="Conclusiones" valor={acta.conclusiones} editable={editable} onCambio={(v) => poner({ conclusiones: v })} />

      <div>
        <p className="text-sm font-semibold">Compromisos</p>
        <p className="text-xs text-slate-500">Solo lo que alguien asumió en voz alta. Al aprobar, cada uno se puede volver tarea del tablero.</p>
        {acta.compromisos.length === 0 && <p className="text-sm text-slate-500">Ninguno.</p>}
        <ol className="mt-1 space-y-2">
          {acta.compromisos.map((c, i) => (
            <li key={i} className="space-y-1 rounded-md border border-slate-200 p-2">
              <input disabled={!editable} value={c.descripcion} onChange={(e) => ponerCompromiso(i, { descripcion: e.target.value })} className={`${CAMPO} mt-0 font-semibold`} aria-label="Compromiso" />
              <div className="flex flex-wrap gap-1">
                <input disabled={!editable} value={c.responsable} onChange={(e) => ponerCompromiso(i, { responsable: e.target.value })} placeholder="Responsable" className={`${CAMPO} mt-0 min-w-0 flex-[2]`} aria-label="Responsable" />
                <select disabled={!editable} value={c.parte} onChange={(e) => ponerCompromiso(i, { parte: e.target.value as Parte })} className={`${CAMPO} mt-0 w-auto`} aria-label="Parte">
                  {PARTES.map((x) => (
                    <option key={x} value={x}>
                      {NOMBRE_PARTE[x]}
                    </option>
                  ))}
                </select>
                <input disabled={!editable} type="date" value={c.fecha_limite ?? ""} onChange={(e) => ponerCompromiso(i, { fecha_limite: e.target.value || null })} className={`${CAMPO} mt-0 w-auto`} aria-label="Fecha límite" />
              </div>
              {c.cita && <p className="text-xs italic text-slate-500">“{c.cita}”</p>}
              {editable && (
                <button type="button" onClick={() => poner({ compromisos: acta.compromisos.filter((_, j) => j !== i) })} className="min-h-9 text-xs text-red-800 underline">
                  Quitar (no fue un compromiso)
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>

      <Lista titulo="Pendientes por confirmar" valor={acta.pendientes_por_confirmar} editable={editable} onCambio={(v) => poner({ pendientes_por_confirmar: v })} />
      <Lista titulo="Riesgos y objeciones" valor={acta.riesgos_u_objeciones} editable={editable} onCambio={(v) => poner({ riesgos_u_objeciones: v })} />
      <Lista titulo="Oportunidades comerciales" valor={acta.oportunidades_comerciales} editable={editable} onCambio={(v) => poner({ oportunidades_comerciales: v })} />
      <label className="block text-sm font-semibold">
        Próxima reunión
        <input disabled={!editable} value={acta.siguiente_reunion ?? ""} onChange={(e) => poner({ siguiente_reunion: e.target.value || null })} className={`${CAMPO} font-normal`} />
      </label>
    </div>
  );
}

/** Al guardar: sin renglones vacíos (lo que se escribe a medias queda; lo vacío, no). */
export function limpiarActa(a: Acta): Acta {
  const l = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  return {
    ...a,
    puntos_clave: l(a.puntos_clave),
    decisiones: l(a.decisiones),
    conclusiones: l(a.conclusiones),
    pendientes_por_confirmar: l(a.pendientes_por_confirmar),
    riesgos_u_objeciones: l(a.riesgos_u_objeciones),
    oportunidades_comerciales: l(a.oportunidades_comerciales),
    inconsistencias: l(a.inconsistencias),
    compromisos: a.compromisos.filter((c) => c.descripcion.trim()),
  };
}

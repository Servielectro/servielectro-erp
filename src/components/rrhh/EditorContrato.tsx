"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TABLAS, type Actividad, type Clausula, type Poliza } from "@/lib/contratos";

const C = "block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-50";
const BOTON = "min-h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40";
const BOTON2 = "min-h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40";

/**
 * Cláusulas (Título / Texto), pólizas y cronograma de una plantilla o de un contrato en
 * borrador: Editar, Eliminar y Agregar por fila, como en NEXGO. Con `editable` en falso (un
 * contrato firmado) se ve todo y se dice por qué no se edita.
 */
export function EditorContrato({
  de,
  id,
  clausulas,
  polizas,
  cronograma,
  editable,
  motivoNoEditable,
}: {
  de: "plantilla" | "contrato";
  id: string;
  clausulas: Clausula[];
  polizas: Poliza[];
  cronograma: Actividad[];
  editable: boolean;
  motivoNoEditable?: string;
}) {
  const t = TABLAS[de];
  const vacias = clausulas.filter((c) => !c.texto.trim()).length;
  const conTexto = clausulas.length - vacias;
  return (
    <div className="space-y-4">
      {!editable && motivoNoEditable && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{motivoNoEditable}</p>}

      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Cláusulas{" "}
          <span className={`font-normal ${vacias ? "text-amber-700" : "text-green-700"}`}>
            ({conTexto} de {clausulas.length} con texto{vacias ? ` · faltan ${vacias}` : ""})
          </span>
        </h2>
        {de === "plantilla" && (
          <p className="mb-2 text-xs text-slate-500">
            El texto de cada cláusula lo transcribe Jhojan (revisado por su abogado). El sistema no trae ningún texto legal.
          </p>
        )}
        <ul className="space-y-2">
          {clausulas.map((c, i) => (
            <FilaClausula key={c.id} tabla={t.clausulas} c={c} numero={i + 1} editable={editable} />
          ))}
        </ul>
        {editable && <Agregar tabla={t.clausulas} fila={{ [t.llave]: id, titulo: "NUEVA CLÁUSULA", texto: "", orden: siguiente(clausulas) }} texto="+ Agregar cláusula" />}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Pólizas</h2>
        <p className="mb-2 text-xs text-slate-500">En la cotización las pólizas van sin porcentaje ni vigencia; acá, en el contrato, sí llevan número.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="p-1">Activo</th>
                <th className="p-1">Póliza</th>
                <th className="p-1">%</th>
                <th className="p-1">Años</th>
                <th className="p-1">Meses extra</th>
                <th className="p-1">Complemento</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {polizas.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-2 text-slate-500">
                    Sin pólizas.
                  </td>
                </tr>
              )}
              {polizas.map((p) => (
                <FilaPoliza key={p.id} tabla={t.polizas} p={p} editable={editable} />
              ))}
            </tbody>
          </table>
        </div>
        {editable && <Agregar tabla={t.polizas} fila={{ [t.llave]: id, poliza: "Nueva póliza", orden: siguiente(polizas) }} texto="+ Agregar póliza" />}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Cronograma de ejecución</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="p-1">Actividad</th>
                <th className="p-1">Día inicio{de === "contrato" ? " / fecha" : ""}</th>
                <th className="p-1">Duración (hábiles)</th>
                <th className="p-1">Día fin</th>
                <th className="p-1">Responsable</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {cronograma.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-2 text-slate-500">
                    Sin actividades.
                  </td>
                </tr>
              )}
              {cronograma.map((a) => (
                <FilaActividad key={a.id} tabla={t.cronograma} a={a} editable={editable} conFechas={de === "contrato"} />
              ))}
            </tbody>
          </table>
        </div>
        {editable && <Agregar tabla={t.cronograma} fila={{ [t.llave]: id, actividad: "Nueva actividad", orden: siguiente(cronograma) }} texto="+ Agregar actividad" />}
      </section>
    </div>
  );
}

const siguiente = (filas: { orden: number }[]) => (filas.length ? Math.max(...filas.map((f) => f.orden)) + 10 : 10);

function useFila(tabla: string, id: string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const guardar = (cambios: Record<string, unknown>, despues?: () => void) =>
    empezar(async () => {
      setError(null);
      const { error: e } = await createClient().from(tabla).update(cambios).eq("id", id);
      if (e) return setError(e.message);
      despues?.();
      router.refresh();
    });
  const eliminar = (pregunta: string) =>
    empezar(async () => {
      if (!window.confirm(pregunta)) return;
      setError(null);
      const { error: e } = await createClient().from(tabla).delete().eq("id", id);
      if (e) return setError(e.message);
      router.refresh();
    });
  return { guardar, eliminar, pendiente, error };
}

/**
 * Una cláusula. Editable: el título y el campo de texto se ven siempre (para pegar el texto
 * revisado sin tener que buscar un botón); "Guardar" aparece cuando hay cambios. Las vacías se
 * resaltan. No editable (contrato firmado): solo se lee.
 */
function FilaClausula({ tabla, c, numero, editable }: { tabla: string; c: Clausula; numero: number; editable: boolean }) {
  const { guardar, eliminar, pendiente, error } = useFila(tabla, c.id);
  const [titulo, setTitulo] = useState(c.titulo);
  const [texto, setTexto] = useState(c.texto);
  const cambio = titulo !== c.titulo || texto !== c.texto;
  const vacia = !c.texto.trim();

  if (!editable) {
    return (
      <li className="rounded-lg border border-slate-300 bg-white p-3">
        <p className="text-sm font-semibold">
          {numero}. {c.titulo}
        </p>
        {vacia ? <p className="mt-1 text-xs italic text-amber-700">Sin texto.</p> : <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.texto}</p>}
      </li>
    );
  }
  return (
    <li className={`rounded-lg border bg-white p-3 ${vacia ? "border-amber-400" : "border-slate-300"}`}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm font-semibold text-slate-500">{numero}.</span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label="Título de la cláusula" className={`${C} font-semibold`} />
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={vacia && !texto ? 3 : 6}
        placeholder="Pegar o escribir aquí el texto de la cláusula"
        aria-label={`Texto de la cláusula ${c.titulo}`}
        className={`${C} mt-2 ${vacia && !texto ? "bg-amber-50" : ""}`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {cambio ? (
          <>
            <button type="button" disabled={pendiente || !titulo.trim()} onClick={() => guardar({ titulo: titulo.trim(), texto })} className={BOTON}>
              {pendiente ? "Guardando…" : "Guardar cláusula"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTitulo(c.titulo);
                setTexto(c.texto);
              }}
              className={BOTON2}
            >
              Deshacer
            </button>
            {!titulo.trim() && <span className="text-xs text-slate-500">El título no puede quedar vacío.</span>}
            <span className="text-xs font-semibold text-amber-800">Sin guardar.</span>
          </>
        ) : (
          <>
            <span className={`text-xs ${vacia ? "font-semibold text-amber-700" : "text-slate-500"}`}>{vacia ? "Sin texto todavía." : "Guardada."}</span>
            <button type="button" disabled={pendiente} onClick={() => eliminar(`¿Eliminar la cláusula «${c.titulo}»?`)} className={`${BOTON2} text-red-800`}>
              Eliminar
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
    </li>
  );
}

const numeroONulo = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

function FilaPoliza({ tabla, p, editable }: { tabla: string; p: Poliza; editable: boolean }) {
  const { guardar, eliminar, pendiente, error } = useFila(tabla, p.id);
  const inicial = {
    activo: p.activo,
    poliza: p.poliza,
    porcentaje: p.porcentaje === null ? "" : String(Number(p.porcentaje)),
    anios: p.durante_anios === null ? "" : String(p.durante_anios),
    meses: p.meses_extra === null ? "" : String(p.meses_extra),
    complemento: p.complemento ?? "",
  };
  const [f, setF] = useState(inicial);
  const cambio = JSON.stringify(f) !== JSON.stringify(inicial);
  return (
    <>
      <tr className="border-t border-slate-200">
        <td className="p-1">
          <input type="checkbox" disabled={!editable} checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
        </td>
        <td className="p-1">
          <input disabled={!editable} value={f.poliza} onChange={(e) => setF({ ...f, poliza: e.target.value })} className={C} />
        </td>
        <td className="w-16 p-1">
          <input disabled={!editable} value={f.porcentaje} onChange={(e) => setF({ ...f, porcentaje: e.target.value })} inputMode="decimal" className={C} />
        </td>
        <td className="w-14 p-1">
          <input disabled={!editable} value={f.anios} onChange={(e) => setF({ ...f, anios: e.target.value })} inputMode="numeric" className={C} />
        </td>
        <td className="w-14 p-1">
          <input disabled={!editable} value={f.meses} onChange={(e) => setF({ ...f, meses: e.target.value })} inputMode="numeric" className={C} />
        </td>
        <td className="p-1">
          <input disabled={!editable} value={f.complemento} onChange={(e) => setF({ ...f, complemento: e.target.value })} className={C} />
        </td>
        <td className="whitespace-nowrap p-1">
          {editable && cambio && (
            <button
              type="button"
              disabled={pendiente || !f.poliza.trim()}
              onClick={() =>
                guardar({
                  activo: f.activo,
                  poliza: f.poliza.trim(),
                  porcentaje: numeroONulo(f.porcentaje),
                  durante_anios: numeroONulo(f.anios),
                  meses_extra: numeroONulo(f.meses),
                  complemento: f.complemento.trim() || null,
                })
              }
              className={BOTON}
            >
              Guardar
            </button>
          )}
          {editable && !cambio && (
            <button type="button" disabled={pendiente} onClick={() => eliminar(`¿Eliminar la póliza «${p.poliza}»?`)} className={`${BOTON2} text-red-800`}>
              Eliminar
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="p-1 text-xs text-red-800">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

function FilaActividad({ tabla, a, editable, conFechas }: { tabla: string; a: Actividad; editable: boolean; conFechas: boolean }) {
  const { guardar, eliminar, pendiente, error } = useFila(tabla, a.id);
  const inicial = {
    actividad: a.actividad,
    dia: a.dia_inicio === null ? "" : String(a.dia_inicio),
    fechaInicio: a.fecha_inicio ?? "",
    duracion: a.duracion_habiles === null ? "" : String(a.duracion_habiles),
    fechaFin: a.fecha_fin ?? "",
    responsable: a.responsable ?? "",
  };
  const [f, setF] = useState(inicial);
  const cambio = JSON.stringify(f) !== JSON.stringify(inicial);
  const dia = numeroONulo(f.dia);
  const dur = numeroONulo(f.duracion);
  return (
    <>
      <tr className="border-t border-slate-200">
        <td className="p-1">
          <input disabled={!editable} value={f.actividad} onChange={(e) => setF({ ...f, actividad: e.target.value })} className={C} />
        </td>
        <td className="w-28 p-1">
          <input disabled={!editable} value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} inputMode="numeric" placeholder="Día" className={C} />
          {conFechas && <input type="date" disabled={!editable} value={f.fechaInicio} onChange={(e) => setF({ ...f, fechaInicio: e.target.value })} className={`${C} mt-1`} />}
        </td>
        <td className="w-20 p-1">
          <input disabled={!editable} value={f.duracion} onChange={(e) => setF({ ...f, duracion: e.target.value })} inputMode="numeric" className={C} />
        </td>
        <td className="w-28 p-1">
          {conFechas ? (
            <input type="date" disabled={!editable} value={f.fechaFin} onChange={(e) => setF({ ...f, fechaFin: e.target.value })} className={C} />
          ) : (
            <span className="text-slate-600">{dia !== null && dur !== null ? `Día ${dia + dur}` : "—"}</span>
          )}
        </td>
        <td className="p-1">
          <input disabled={!editable} value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} className={C} />
        </td>
        <td className="whitespace-nowrap p-1">
          {editable && cambio && (
            <button
              type="button"
              disabled={pendiente || !f.actividad.trim()}
              onClick={() =>
                guardar({
                  actividad: f.actividad.trim(),
                  dia_inicio: dia,
                  duracion_habiles: dur,
                  responsable: f.responsable.trim() || null,
                  ...(conFechas ? { fecha_inicio: f.fechaInicio || null, fecha_fin: f.fechaFin || null } : {}),
                })
              }
              className={BOTON}
            >
              Guardar
            </button>
          )}
          {editable && !cambio && (
            <button type="button" disabled={pendiente} onClick={() => eliminar(`¿Eliminar la actividad «${a.actividad}»?`)} className={`${BOTON2} text-red-800`}>
              Eliminar
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="p-1 text-xs text-red-800">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

function Agregar({ tabla, fila, texto }: { tabla: string; fila: Record<string, unknown>; texto: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            setError(null);
            const { error: e } = await createClient().from(tabla).insert(fila);
            if (e) return setError(e.message);
            router.refresh();
          })
        }
        className={BOTON2}
      >
        {texto}
      </button>
      {error && <p className="mt-1 text-xs text-red-800">{error}</p>}
    </div>
  );
}

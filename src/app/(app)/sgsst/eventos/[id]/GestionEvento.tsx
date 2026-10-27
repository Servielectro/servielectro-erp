"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { sha256 } from "@/lib/tecnico/captura";
import type { EstadoPlazo } from "@/lib/sst/plazos";

export interface EventoDetalle {
  id: string;
  tipo: "accidente" | "incidente";
  ocurrido_en: string;
  lugar: string | null;
  empleado_id: string | null;
  afectado_nombre: string | null;
  descripcion: string;
  acciones_inmediatas: string | null;
  reportado_arl_en: string | null;
  radicado_arl: string | null;
  reportado_eps_en: string | null;
  radicado_eps: string | null;
  investigacion_formato_id: string | null;
  estado: "abierto" | "investigado" | "cerrado" | "anulado";
  nota_cierre: string | null;
  motivo_anulacion: string | null;
  updated_at: string;
}

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base";

function TextoPlazo({ e, que }: { e: EstadoPlazo | null; que: string }) {
  if (!e) return null;
  if (e.tipo === "sin_configurar") return <p className="text-xs text-slate-500">Plazo para {que}: sin configurar (lo define la responsable SST en Plazos de reporte).</p>;
  if (e.tipo === "cumplido") return <p className={`text-xs ${e.aTiempo ? "text-green-800" : "text-red-800"}`}>{e.aTiempo ? `A tiempo (límite ${e.limite}).` : `Fuera de plazo: el límite era el ${e.limite}.`}</p>;
  return (
    <p className={`text-xs font-semibold ${e.vencido ? "text-red-800" : "text-amber-800"}`}>
      Plazo para {que}: {e.vencido ? `vencido desde el ${e.limite}` : `vence el ${e.limite} (${e.diasRestantes} días)`}. Los festivos no se descuentan.
    </p>
  );
}

export function GestionEvento({
  ev,
  afectado,
  plazos,
  archivos,
  formatos,
  trabaja,
  gestiona,
}: {
  ev: EventoDetalle;
  afectado: string | null;
  plazos: { arl: EstadoPlazo | null; eps: EstadoPlazo | null; investigacion: EstadoPlazo | null };
  archivos: { id: string; descripcion: string; url: string | null; created_at: string }[];
  formatos: { id: string; nombre: string }[];
  trabaja: boolean;
  gestiona: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const [radArl, setRadArl] = useState("");
  const [fechaArl, setFechaArl] = useState("");
  const [radEps, setRadEps] = useState("");
  const [fechaEps, setFechaEps] = useState("");
  const [formato, setFormato] = useState(ev.investigacion_formato_id ?? "");
  const [nota, setNota] = useState("");
  const [motivo, setMotivo] = useState("");
  const [soporte, setSoporte] = useState({ descripcion: "", archivo: null as File | null });
  const editable = trabaja && (ev.estado === "abierto" || ev.estado === "investigado");

  const cambiar = (c: Record<string, unknown>) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("sst_eventos").update(c).eq("id", ev.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó: no tienes permiso.");
      router.refresh();
    });

  const subirSoporte = () =>
    empezar(async () => {
      if (!soporte.archivo) return;
      setError(null);
      const supabase = createClient();
      const nombre = soporte.archivo.name.replace(/[^\w.\-]+/g, "_");
      const path = `eventos/${ev.id}/${Date.now()}-${nombre}`;
      const { error: eS } = await supabase.storage.from("sgsst").upload(path, soporte.archivo, { contentType: soporte.archivo.type || undefined, upsert: false });
      if (eS) return setError(`No se subió el archivo: ${eS.message}`);
      const { error: eR } = await supabase.from("sst_evento_archivos").insert({ evento_id: ev.id, descripcion: soporte.descripcion.trim(), path, sha256: await sha256(soporte.archivo) });
      if (eR) return setError(`El archivo subió pero no se registró: ${eR.message}`);
      setSoporte({ descripcion: "", archivo: null });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-slate-900">
          {ev.tipo === "accidente" ? "Accidente de trabajo" : "Incidente"} · {afectado ?? "sin afectado"}
        </h1>
        <p className="text-sm text-slate-600">
          {new Date(ev.ocurrido_en).toLocaleString("es-CO")} · {ev.lugar ?? "sin lugar"} · {ev.estado}
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <p className="font-semibold">Qué pasó</p>
        <p className="whitespace-pre-line">{ev.descripcion}</p>
        {ev.acciones_inmediatas && (
          <>
            <p className="mt-2 font-semibold">Qué se hizo de inmediato</p>
            <p className="whitespace-pre-line">{ev.acciones_inmediatas}</p>
          </>
        )}
        {ev.nota_cierre && <p className="mt-2 rounded-md bg-green-50 px-2 py-1">Cierre: {ev.nota_cierre}</p>}
        {ev.motivo_anulacion && <p className="mt-2 rounded-md bg-slate-50 px-2 py-1">Anulado: {ev.motivo_anulacion}</p>}
      </section>

      {ev.tipo === "accidente" && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <h2 className="font-bold">Reporte a la ARL y a la EPS</h2>
          {(
            [
              ["ARL", ev.reportado_arl_en, ev.radicado_arl, plazos.arl, fechaArl, setFechaArl, radArl, setRadArl, "reportado_arl_en", "radicado_arl"],
              ["EPS", ev.reportado_eps_en, ev.radicado_eps, plazos.eps, fechaEps, setFechaEps, radEps, setRadEps, "reportado_eps_en", "radicado_eps"],
            ] as const
          ).map(([que, hecho, radicado, plazo, fecha, setFecha, rad, setRad, colFecha, colRad]) => (
            <div key={que} className="rounded-md border border-slate-200 p-2">
              <p className="font-semibold">{que}</p>
              {hecho ? (
                <p>
                  Reportado el {new Date(hecho).toLocaleString("es-CO")}
                  {radicado ? ` · radicado ${radicado}` : ""}. Queda registrado una sola vez.
                </p>
              ) : editable ? (
                <div className="space-y-1">
                  <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} aria-label={`Fecha del reporte a la ${que}`} />
                  <input value={rad} onChange={(e) => setRad(e.target.value)} placeholder="Número de radicado" className={CAMPO} />
                  <button type="button" disabled={pendiente || !fecha} onClick={() => cambiar({ [colFecha]: new Date(fecha).toISOString(), [colRad]: rad.trim() || null })} className="min-h-11 w-full rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
                    Registrar reporte a la {que}
                  </button>
                  {!fecha && <p className="text-xs text-slate-500">Pon la fecha y hora en que se reportó.</p>}
                </div>
              ) : (
                <p className="text-slate-500">Sin reportar.</p>
              )}
              <TextoPlazo e={plazo} que={`reportar a la ${que}`} />
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <h2 className="font-bold">Investigación</h2>
        <p className="text-xs text-slate-500">Es un formato del armador (la plantilla de investigación la carga la responsable SST), firmado y sellado.</p>
        <TextoPlazo e={plazos.investigacion} que="investigar" />
        {ev.investigacion_formato_id && (
          <Link href={`/sgsst/formatos/${ev.investigacion_formato_id}`} className="font-semibold text-[#A82323] underline">
            Ver el formato de investigación
          </Link>
        )}
        {editable && ev.estado === "abierto" && (
          <div className="space-y-1">
            <select value={formato} onChange={(e) => setFormato(e.target.value)} className={CAMPO}>
              <option value="">— Elige el formato de investigación ya firmado —</option>
              {formatos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
            <button type="button" disabled={pendiente || !formato} onClick={() => cambiar({ investigacion_formato_id: formato, estado: "investigado" })} className="min-h-11 w-full rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
              Marcar investigado
            </button>
            {formatos.length === 0 && <p className="text-xs text-slate-500">Todavía no hay formatos firmados para vincular: se llena en sitio y se cierra con sus firmas.</p>}
          </div>
        )}
        {editable && ev.estado === "investigado" && (
          <div className="space-y-1">
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Cómo se cierra: acciones cumplidas" className={CAMPO} />
            <button type="button" disabled={pendiente || !nota.trim()} onClick={() => cambiar({ estado: "cerrado", nota_cierre: nota.trim() })} className="min-h-11 w-full rounded-md bg-green-700 text-sm font-semibold text-white disabled:opacity-40">
              Cerrar el evento
            </button>
            {!nota.trim() && <p className="text-xs text-slate-500">Escribe cómo se cierra.</p>}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <h2 className="font-bold">Soportes</h2>
        {archivos.length === 0 && <p className="text-slate-500">Sin soportes (copia del reporte a la ARL, fotos del lugar…).</p>}
        {archivos.map((a) => (
          <p key={a.id}>
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="font-semibold text-[#A82323] underline">
                📎 {a.descripcion}
              </a>
            ) : (
              a.descripcion
            )}
          </p>
        ))}
        {editable && (
          <div className="space-y-1">
            <input value={soporte.descripcion} onChange={(e) => setSoporte({ ...soporte, descripcion: e.target.value })} placeholder="Qué es (ej. copia del reporte a la ARL)" className={CAMPO} />
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setSoporte({ ...soporte, archivo: e.target.files?.[0] ?? null })} className="block w-full text-sm" />
            <button type="button" disabled={pendiente || !soporte.archivo || !soporte.descripcion.trim()} onClick={subirSoporte} className="min-h-11 w-full rounded-md border border-slate-900 text-sm font-semibold disabled:opacity-40">
              Subir soporte
            </button>
            {(!soporte.archivo || !soporte.descripcion.trim()) && <p className="text-xs text-slate-500">Elige el archivo y escribe qué es.</p>}
          </div>
        )}
      </section>

      {gestiona && (ev.estado === "abierto" || ev.estado === "investigado") && (
        <section className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Por qué se anula (registrado por error, duplicado…)" className={CAMPO} />
          <button type="button" disabled={pendiente || !motivo.trim()} onClick={() => cambiar({ estado: "anulado", motivo_anulacion: motivo.trim() })} className="min-h-11 w-full rounded-md border border-red-300 text-sm text-red-800 disabled:opacity-40">
            Anular (no se borra: queda con el motivo)
          </button>
          {!motivo.trim() && <p className="text-xs text-slate-500">Para anular, escribe el motivo.</p>}
        </section>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </div>
  );
}

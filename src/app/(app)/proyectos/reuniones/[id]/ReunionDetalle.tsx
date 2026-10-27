"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fechaHoraCo } from "@/lib/fecha-hora";
import {
  ESTADO_REUNION,
  CODIGO_ACTA_REUNION,
  respuestasDesdeActa,
  type Acta,
  type Asistente,
  type Parte,
  type Reunion,
} from "@/lib/reuniones/acta";
import { Grabador } from "./Grabador";
import { EditorActa, limpiarActa } from "./EditorActa";
import { CompromisosATareas } from "./CompromisosATareas";

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base";
const TOPE_BYTES = 50 * 1024 * 1024;
const NOMBRE_PARTE: Record<Parte, string> = { servielectro: "Servielectro", cliente: "Cliente", tercero: "Tercero" };

function extension(mime: string): string {
  const m = mime.split(";")[0];
  return m.includes("webm") ? "webm" : m.includes("mp4") || m.includes("m4a") || m.includes("aac") ? "m4a" : m.includes("ogg") ? "ogg" : m.includes("mpeg") || m.includes("mp3") ? "mp3" : m.includes("wav") ? "wav" : "audio";
}

export function ReunionDetalle({
  r,
  obra,
  trabaja,
  gestiona,
  nombres,
  audioUrl,
  tieneTranscripcion,
  transcripcion,
  hechas,
  personas,
  puedeAsignar,
}: {
  r: Reunion;
  obra: string;
  trabaja: boolean;
  gestiona: boolean;
  nombres: Record<string, string>;
  audioUrl: string | null;
  tieneTranscripcion: boolean;
  transcripcion: string | null;
  hechas: Record<number, string>;
  personas: { id: string; nombre: string }[];
  puedeAsignar: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fase, setFase] = useState<string | null>(null);
  // Si la subida falla, el audio sigue en memoria: se reintenta o se guarda en el celular.
  const [sinSubir, setSinSubir] = useState<{ audio: Blob; duracion: number | null } | null>(null);
  const supabase = createClient();

  // Las dos etapas, una llamada cada una (la ruta guarda lo de cada etapa).
  async function procesar(desde: "transcribir" | "redactar") {
    setError(null);
    const etapas = desde === "transcribir" ? (["transcribir", "redactar"] as const) : (["redactar"] as const);
    for (const e of etapas) {
      setFase(e === "transcribir" ? "Transcribiendo la reunión (puede tardar unos minutos)…" : "Redactando el acta…");
      try {
        const resp = await fetch(`/api/reuniones/${r.id}/procesar?etapa=${e}`, { method: "POST" });
        const j = (await resp.json().catch(() => null)) as { ok: boolean; error?: string } | null;
        if (!resp.ok || !j?.ok) {
          setError(j?.error ?? `El servidor respondió ${resp.status}. Vuelve a intentarlo.`);
          break;
        }
      } catch {
        setError("Se cortó la conexión mientras procesaba. Lo hecho quedó guardado: vuelve a intentarlo.");
        break;
      }
    }
    setFase(null);
    router.refresh();
  }

  async function subirAudio(audio: Blob, duracionS: number | null) {
    setError(null);
    if (audio.size > TOPE_BYTES) {
      return setError(
        `El audio pesa ${(audio.size / 1024 / 1024).toFixed(0)} MB y el tope es 50 MB. Grábalo desde aquí (sale más liviano) o pártelo en dos reuniones.`,
      );
    }
    const mime = (audio.type || "audio/webm").split(";")[0];
    const path = `${r.id}/audio-${Date.now()}.${extension(mime)}`;
    setFase("Subiendo el audio…");
    // Directo a Storage: el audio nunca pasa por una llamada al servidor del ERP.
    const { error: e1 } = await supabase.storage.from("reuniones").upload(path, audio, { contentType: mime, upsert: false });
    if (e1) {
      setFase(null);
      setSinSubir({ audio, duracion: duracionS });
      return setError(`No se pudo subir el audio: ${e1.message}. No cierres esta pantalla: vuelve a intentarlo o guárdalo en el celular.`);
    }
    setSinSubir(null);
    const { error: e2 } = await supabase
      .from("reuniones")
      .update({ audio_path: path, audio_mime: mime, audio_bytes: audio.size, duracion_s: duracionS, estado: "audio_subido" })
      .eq("id", r.id);
    if (e2) {
      setFase(null);
      return setError(`El audio subió pero no se pudo registrar: ${e2.message}`);
    }
    await procesar("transcribir");
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">
          {obra} · {r.fecha}
          {r.lugar ? ` · ${r.lugar}` : ""}
        </p>
        <h1 className="text-lg font-bold text-slate-900">{r.titulo}</h1>
        <p className="text-xs font-semibold text-slate-600">{ESTADO_REUNION[r.estado]}</p>
        {r.estado === "anulada" && <p className="mt-1 rounded-md bg-slate-100 px-2 py-1 text-sm">Anulada: {r.motivo_anulacion}</p>}
      </div>

      {r.aviso_grabacion ? (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          🔔 Aviso de grabación dado por {nombres[r.aviso_por ?? ""] ?? "—"} el {fechaHoraCo(r.aviso_en)}. Presentes:{" "}
          {r.asistentes.map((a) => `${a.nombre} (${NOMBRE_PARTE[a.parte] ?? a.parte})`).join(", ")}.
        </p>
      ) : (
        r.estado !== "anulada" && (trabaja ? <AvisoGrabacion reunionId={r.id} /> : <p className="text-sm text-slate-500">Grabar requiere Proyectos en nivel “trabajar”.</p>)
      )}

      {r.aviso_grabacion && !r.audio_path && !tieneTranscripcion && r.estado !== "anulada" && trabaja && !fase && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="text-base font-bold">Grabar la reunión</h2>
          <Grabador onListo={(audio, s) => void subirAudio(audio, s)} />
          <div className="border-t border-slate-100 pt-2">
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-400 px-3 text-sm font-semibold">
              ⤒ O subir un audio ya grabado (hasta 50 MB)
              <input
                type="file"
                accept="audio/*,video/webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void subirAudio(f, null);
                }}
              />
            </label>
          </div>
        </section>
      )}

      {fase && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900" role="status">
          ⏳ {fase} No cierres esta pantalla.
        </p>
      )}

      {r.audio_path && !fase && ["audio_subido", "transcribiendo", "redactando", "error"].includes(r.estado) && (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          {r.estado === "error" && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{r.error}</p>}
          {(r.estado === "transcribiendo" || r.estado === "redactando") && (
            <p className="text-sm text-slate-600">Quedó a medias ({ESTADO_REUNION[r.estado].toLowerCase()}). Si nadie la está procesando ahora, vuelve a intentarlo: lo hecho no se pierde.</p>
          )}
          {trabaja ? (
            <button type="button" onClick={() => void procesar(tieneTranscripcion ? "redactar" : "transcribir")} className="min-h-12 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white">
              {tieneTranscripcion ? "Redactar el acta" : "Transcribir y redactar el acta"}
            </button>
          ) : (
            <p className="text-sm text-slate-500">Procesar requiere Proyectos en nivel “trabajar”.</p>
          )}
        </section>
      )}

      {r.acta_revisada && (r.estado === "lista" || r.estado === "aprobada") && (
        // Si el acta cambia en la base (rehecha o guardada), el borrador arranca de nuevo con ella.
        <Revision key={JSON.stringify(r.acta_revisada)} r={r} acta={r.acta_revisada} trabaja={trabaja} gestiona={gestiona} onRehacer={() => void procesar("redactar")} ocupado={!!fase} />
      )}

      {r.estado === "aprobada" && r.acta_revisada && (
        <>
          <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-base font-bold">Firma y PDF</h2>
            <Firma r={r} acta={r.acta_revisada} avisoNombre={nombres[r.aviso_por ?? ""] ?? "—"} trabaja={trabaja} />
          </section>
          <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-base font-bold">Compromisos → tareas del tablero</h2>
            <CompromisosATareas
              reunionId={r.id}
              proyectoId={r.proyecto_id}
              tituloActa={r.acta_revisada.titulo || r.titulo}
              fecha={r.fecha}
              acta={r.acta_revisada}
              hechas={hechas}
              personas={personas}
              puedeAsignar={puedeAsignar}
            />
          </section>
        </>
      )}

      {(audioUrl || transcripcion) && (
        <details className="rounded-lg border border-slate-200 bg-white p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">Audio y transcripción</summary>
          {audioUrl && <audio controls preload="none" src={audioUrl} className="mt-2 w-full" />}
          {r.audio_bytes ? <p className="mt-1 text-xs text-slate-500">{(r.audio_bytes / 1024 / 1024).toFixed(1)} MB</p> : null}
          {transcripcion && <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{transcripcion}</pre>}
        </details>
      )}

      {r.estado !== "anulada" && ((r.estado === "aprobada" && gestiona) || (r.estado !== "aprobada" && trabaja)) && <Anular reunionId={r.id} />}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {sinSubir && !fase && (
        <div className="flex gap-2">
          <button type="button" onClick={() => void subirAudio(sinSubir.audio, sinSubir.duracion)} className="min-h-12 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white">
            Reintentar la subida
          </button>
          <a
            href={URL.createObjectURL(sinSubir.audio)}
            download={`reunion-${r.fecha}.${extension(sinSubir.audio.type || "audio/webm")}`}
            className="flex min-h-12 flex-1 items-center justify-center rounded-lg border border-slate-400 text-sm font-semibold"
          >
            Guardar el audio en el celular
          </a>
        </div>
      )}
    </div>
  );
}

/** Antes de grabar: avisar y anotar quiénes están. Queda registrado y no se deshace. */
function AvisoGrabacion({ reunionId }: { reunionId: string }) {
  const router = useRouter();
  const [avise, setAvise] = useState(false);
  const [asistentes, setAsistentes] = useState<Asistente[]>([{ nombre: "", parte: "servielectro" }]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const validos = asistentes.filter((a) => a.nombre.trim());
  const falta = !avise ? "Confirma que avisaste a todos que se va a grabar." : validos.length === 0 ? "Anota quiénes están en la reunión." : null;
  return (
    <section className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
      <h2 className="text-base font-bold text-amber-950">Antes de grabar: avisa</h2>
      <p className="text-sm text-amber-950">
        Dile a todos los presentes, en voz alta y antes de empezar, que la reunión se va a grabar para hacer el acta. Es una reunión con personas de fuera de la
        empresa y la grabación tiene sus voces: grabar sin decirlo puede costar la relación y no corresponde con sus datos personales. Si alguien no está de
        acuerdo, no grabes: toma notas.
      </p>
      <div className="space-y-1">
        <p className="text-sm font-semibold">¿Quiénes están?</p>
        {asistentes.map((a, i) => (
          <div key={i} className="flex flex-wrap gap-1 rounded-md bg-white/60 p-1">
            <input value={a.nombre} onChange={(e) => setAsistentes(asistentes.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Nombre" className={`${CAMPO} mt-0 basis-full`} aria-label="Nombre del asistente" />
            <select value={a.parte} onChange={(e) => setAsistentes(asistentes.map((x, j) => (j === i ? { ...x, parte: e.target.value as Parte } : x)))} className={`${CAMPO} mt-0 min-w-0 flex-1`} aria-label="De qué parte">
              <option value="servielectro">Servielectro</option>
              <option value="cliente">Cliente</option>
              <option value="tercero">Tercero</option>
            </select>
            {asistentes.length > 1 && (
              <button type="button" aria-label={`Quitar a ${a.nombre || "este asistente"}`} onClick={() => setAsistentes(asistentes.filter((_, j) => j !== i))} className="min-h-11 min-w-11 rounded-md border border-slate-300 bg-white">
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setAsistentes([...asistentes, { nombre: "", parte: "cliente" }])} className="min-h-11 text-sm font-semibold underline">
          + Otra persona
        </button>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={avise} onChange={(e) => setAvise(e.target.checked)} className="h-5 w-5" />
        Ya avisé a todos que se va a grabar
      </label>
      <button
        type="button"
        disabled={pendiente || !!falta}
        onClick={() =>
          empezar(async () => {
            setError(null);
            const { error: e } = await createClient()
              .from("reuniones")
              .update({ aviso_grabacion: true, asistentes: validos.map((a) => ({ nombre: a.nombre.trim(), parte: a.parte })) })
              .eq("id", reunionId);
            if (e) return setError(e.message);
            router.refresh();
          })
        }
        className="min-h-12 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
      >
        Registrar el aviso y pasar a grabar
      </button>
      {falta && <p className="text-xs text-amber-900">{falta}</p>}
      <p className="text-xs text-amber-900">Queda registrado quién avisó, cuándo y quiénes estaban. No se puede deshacer.</p>
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </section>
  );
}

/** Revisión del acta: corrige, guarda, rehace desde la transcripción, aprueba. Aprobada, solo lectura. */
function Revision({ r, acta, trabaja, gestiona, onRehacer, ocupado }: { r: Reunion; acta: Acta; trabaja: boolean; gestiona: boolean; onRehacer: () => void; ocupado: boolean }) {
  const router = useRouter();
  const [a, setA] = useState(acta);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const aprobada = r.estado === "aprobada";
  const editable = !aprobada && trabaja;
  const cambio = JSON.stringify(a) !== JSON.stringify(acta);
  const inconsistencias = a.inconsistencias.filter((x) => x.trim()).length;

  const guardar = (y: "solo" | "aprobar") =>
    empezar(async () => {
      setError(null);
      setAviso(null);
      const supabase = createClient();
      const limpia = limpiarActa(a);
      const { error: e } = await supabase.from("reuniones").update({ acta_revisada: limpia }).eq("id", r.id);
      if (e) return setError(e.message);
      if (y === "aprobar") {
        const { error: e2 } = await supabase.from("reuniones").update({ estado: "aprobada" }).eq("id", r.id);
        if (e2) return setError(e2.message);
      } else setAviso("Cambios guardados.");
      router.refresh();
    });

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-base font-bold">{aprobada ? "Acta aprobada" : "Revisa el acta"}</h2>
      {aprobada ? (
        <p className="text-xs text-slate-500">Aprobada el {fechaHoraCo(r.aprobada_en)}: ya no se edita.</p>
      ) : (
        <p className="text-xs text-slate-500">La redactó la IA sobre la transcripción. Corrige lo que haga falta: nada sale de aquí sin tu aprobación.</p>
      )}
      <EditorActa acta={a} editable={editable} onCambio={setA} />
      {editable && (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <button type="button" disabled={pendiente || !cambio} onClick={() => guardar("solo")} className="min-h-11 w-full rounded-lg border border-slate-400 text-sm font-semibold disabled:opacity-40">
            Guardar cambios
          </button>
          {!cambio && <p className="text-center text-xs text-slate-500">Sin cambios por guardar.</p>}
          {gestiona ? (
            <>
              <button type="button" disabled={pendiente || ocupado} onClick={() => guardar("aprobar")} className="min-h-12 w-full rounded-lg bg-green-700 text-sm font-semibold text-white disabled:opacity-40">
                Aprobar el acta{cambio ? " (con tus cambios)" : ""}
              </button>
              {inconsistencias > 0 && (
                <p className="text-xs font-semibold text-amber-800">
                  Tiene {inconsistencias === 1 ? "1 inconsistencia" : `${inconsistencias} inconsistencias`}: resuélvelas o quítalas antes de aprobar si ya las validaste.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">Aprobar el acta lo hace el responsable de Proyectos.</p>
          )}
          <button
            type="button"
            disabled={pendiente || ocupado}
            onClick={() => {
              if (window.confirm("¿Redactar el acta otra vez desde la transcripción? Se pierden las correcciones que no hayas aprobado.")) onRehacer();
            }}
            className="min-h-11 w-full text-xs text-slate-600 underline disabled:opacity-40"
          >
            Rehacer el acta desde la transcripción
          </button>
        </div>
      )}
      {aviso && <p className="text-sm text-green-800">{aviso}</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </section>
  );
}

/** El acta aprobada pasa a la plantilla "Acta de reunión" del motor de plantillas, para firmarla. */
function Firma({ r, acta, avisoNombre, trabaja }: { r: Reunion; acta: Acta; avisoNombre: string; trabaja: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (r.formato_id) {
    return (
      <div className="flex flex-wrap gap-2">
        <Link href={`/actas/campo?formato=${r.formato_id}`} className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 text-sm font-semibold text-white">
          ✍ Recoger las firmas (celular)
        </Link>
        <Link href={`/proyectos/actas/${r.formato_id}`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold">
          Ver el acta / PDF
        </Link>
      </div>
    );
  }
  if (!trabaja) return <p className="text-sm text-slate-500">Pasarla a firma requiere Proyectos en nivel “trabajar”.</p>;
  const avisoTexto = `Antes de grabar, ${avisoNombre} informó a los presentes que la reunión se grabaría (${fechaHoraCo(r.aviso_en)}). Presentes: ${r.asistentes
    .map((x) => `${x.nombre} (${NOMBRE_PARTE[x.parte] ?? x.parte})`)
    .join(", ")}.`;
  return (
    <>
      <p className="text-sm text-slate-600">Pasa el acta aprobada a un documento para firmar: se firma en el celular como cualquier acta, queda sellada y sale en PDF.</p>
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            setError(null);
            const supabase = createClient();
            // La versión publicada vigente de la plantilla (por código, no por id).
            const { data: plantilla, error: e0 } = await supabase
              .from("sst_plantillas")
              .select("id")
              .eq("codigo", CODIGO_ACTA_REUNION)
              .eq("estado", "publicada")
              .order("version", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (e0) return setError(e0.message);
            if (!plantilla) return setError("No hay una plantilla \"Acta de reunión\" publicada: publícala en Actas → Plantillas.");
            const id = crypto.randomUUID();
            const { error: e1 } = await supabase.from("sst_formatos").insert({
              id,
              plantilla_id: plantilla.id,
              proyecto_id: r.proyecto_id,
              fecha: r.fecha,
              lugar: r.lugar,
              respuestas: respuestasDesdeActa(acta, avisoTexto),
            });
            if (e1) return setError(e1.message);
            const { error: e2 } = await supabase.from("reuniones").update({ formato_id: id }).eq("id", r.id);
            if (e2) return setError(e2.message);
            router.refresh();
          })
        }
        className="min-h-12 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pendiente ? "Preparando…" : "Pasar a firma"}
      </button>
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </>
  );
}

function Anular({ reunionId }: { reunionId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 w-full rounded-md border border-red-300 text-sm text-red-800">
        Anular la reunión (no se borra: queda con el motivo)
      </button>
    );
  return (
    <div className="space-y-1">
      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Por qué se anula" className="w-full rounded-md border border-slate-300 px-2 py-1 text-base" />
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente || !motivo.trim()}
          onClick={() =>
            empezar(async () => {
              const { error: e } = await createClient().from("reuniones").update({ estado: "anulada", motivo_anulacion: motivo.trim() }).eq("id", reunionId);
              if (e) return setError(e.message);
              router.refresh();
            })
          }
          className="min-h-11 flex-1 rounded-md bg-red-700 text-sm font-semibold text-white disabled:opacity-40"
        >
          Anular
        </button>
      </div>
      {!motivo.trim() && <p className="text-xs text-slate-500">Escribe por qué se anula.</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">{error}</p>}
    </div>
  );
}

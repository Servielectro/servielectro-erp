"use client";
/* eslint-disable @next/next/no-img-element -- enlaces firmados y temporales del bucket privado */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  CAMINO,
  COLOR_ESTADO,
  ETIQUETA_CANAL,
  ETIQUETA_ESTADO,
  TIPOS_IDEA,
  advertenciaDe,
  estadoPublicable,
  fechaCorta,
  guionParaGuardar,
  hoyBogota,
  leerGuion,
  serieDe,
  type Autorizacion,
  type EstadoIdea,
} from "@/lib/marketing";
import { SelectorCanales } from "../NuevaIdea";
import { GeneradorPrompts } from "./GeneradorPrompts";
import { GuionPorBloques } from "./GuionPorBloques";
import { Mediciones, type Medicion } from "../../Mediciones";

export interface Pieza {
  id: string;
  orden: number;
  tipo: "imagen" | "video" | "texto";
  texto: string | null;
  path: string | null;
  biblioteca_id: string | null;
  prompt: string | null;
  modelo: string | null;
  generada_por: string | null;
}
export interface Publicacion {
  id: string;
  cuenta_id: string;
  publicado_en: string;
  url: string | null;
  via: string;
  mediciones: Medicion[];
}
export interface IdeaCompleta {
  id: string;
  titulo: string;
  tipo: string;
  canales: string[];
  campana_id: string | null;
  estado: EstadoIdea;
  fecha_programada: string | null;
  gancho: string | null;
  guion: unknown;
  llamado_accion: string | null;
  notas: string | null;
  motivo_descarte: string | null;
  aprobada_en: string | null;
  origen_proyecto_id: string | null;
  origen_visita_id: string | null;
  origen_formato_id: string | null;
  proyectos: { codigo: string; nombre: string } | null;
  visitas: { titulo: string | null; cliente_nombre: string | null } | null;
}
export interface MaterialBiblioteca {
  id: string;
  tipo: string;
  titulo: string;
  path: string | null;
  identificable: boolean;
  autorizacion: Autorizacion;
  archivada: boolean;
  cliente: string | null;
  url: string | null;
}

const APROBADAS: EstadoIdea[] = ["aprobada", "programada", "publicada"];

const campo = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal disabled:bg-slate-50";

export function IdeaDetalle({
  escribe,
  idea,
  piezas,
  biblioteca,
  campanas,
  cuentas,
  publicaciones,
}: {
  escribe: boolean;
  idea: IdeaCompleta;
  piezas: Pieza[];
  biblioteca: MaterialBiblioteca[];
  campanas: { id: string; nombre: string }[];
  cuentas: { id: string; canal: string; nombre: string }[];
  publicaciones: Publicacion[];
}) {
  const router = useRouter();
  const [f, setF] = useState({
    titulo: idea.titulo,
    tipo: idea.tipo,
    canales: idea.canales,
    campana_id: idea.campana_id ?? "",
    fecha_programada: idea.fecha_programada ?? "",
    gancho: idea.gancho ?? "",
    guion: leerGuion(idea.guion),
    llamado_accion: idea.llamado_accion ?? "",
    notas: idea.notas ?? "",
  });
  const [sucia, setSucia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cambiar = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setSucia(true);
  };

  const porId = new Map(biblioteca.map((b) => [b.id, b]));
  // Lo que no se pudo leer también bloquea: sin saber qué es, no se da por autorizado.
  const bloqueantes = piezas.flatMap((p) => {
    if (!p.biblioteca_id) return [];
    const b = porId.get(p.biblioteca_id);
    if (!b) return ["material que no se pudo leer"];
    return estadoPublicable(b.identificable, b.autorizacion).publicable ? [] : [b.titulo];
  });
  const aprobada = APROBADAS.includes(idea.estado);

  const datosFormulario = () => ({
    titulo: f.titulo.trim(),
    tipo: f.tipo,
    canales: f.canales,
    campana_id: f.campana_id || null,
    fecha_programada: f.fecha_programada || null,
    gancho: f.gancho.trim() || null,
    guion: guionParaGuardar(f.guion),
    llamado_accion: f.llamado_accion.trim() || null,
    notas: f.notas.trim() || null,
  });

  /** Guarda lo escrito y, si se pide, el cambio de estado, en un solo update. */
  const guardar = (extra: Record<string, unknown> = {}, ok = "Guardado.") =>
    empezar(async () => {
      setError(null);
      setAviso(null);
      const { data, error: e } = await createClient().from("marketing_ideas").update({ ...datosFormulario(), ...extra }).eq("id", idea.id).select("id");
      if (e) return setError(e.message);
      if (!data?.length) return setError("No se guardó (sin permiso para cambiar esta idea).");
      setSucia(false);
      setAviso(ok);
      router.refresh();
    });

  const idx = CAMINO.findIndex((c) => c.key === idea.estado);
  const siguiente = idx >= 0 && idx < CAMINO.length - 1 ? CAMINO[idx + 1] : null;
  const anterior = idx > 0 ? CAMINO[idx - 1] : null;

  const avanzar = () => {
    if (!siguiente) return;
    if (APROBADAS.includes(siguiente.key) && bloqueantes.length) return setError("No se puede avanzar: quita o autoriza primero el material marcado en rojo.");
    if (siguiente.key === "programada" && !f.fecha_programada) return setError("Para programarla, ponle fecha de publicación (más abajo, en «Cuándo sale»).");
    if (siguiente.key === "publicada") return setError("Se marca publicada al registrar dónde salió (abajo, «Dónde se publicó»).");
    guardar({ estado: siguiente.key }, `Pasó a ${siguiente.label.toLowerCase()}.`);
  };
  // Al devolverla antes de "aprobada", la aprobación anterior deja de valer.
  const devolver = () =>
    anterior && guardar({ estado: anterior.key, ...(APROBADAS.includes(anterior.key) ? {} : { aprobada_por: null, aprobada_en: null }) }, `Volvió a ${anterior.label.toLowerCase()}.`);

  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const ed = escribe && idea.estado !== "publicada";
  const serie = serieDe(idea.notas);
  const advertencia = advertenciaDe(idea.notas);

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[idea.estado]}`}>{ETIQUETA_ESTADO[idea.estado]}</span>
        <h1 className="text-lg font-bold text-slate-900">{idea.titulo}</h1>
        {serie && <p className="text-sm font-semibold text-slate-700">{serie}</p>}
        {(idea.proyectos || idea.visitas || idea.origen_formato_id) && (
          <p className="text-xs text-slate-600">
            Sale de:{" "}
            {idea.proyectos && (
              <Link href={`/proyectos/${idea.origen_proyecto_id}`} className="underline">
                obra {idea.proyectos.codigo} · {idea.proyectos.nombre}
              </Link>
            )}
            {idea.visitas && <span>visita {idea.visitas.titulo ?? idea.visitas.cliente_nombre ?? ""}</span>}
            {idea.origen_formato_id && (
              <Link href={`/sgsst/formatos/${idea.origen_formato_id}`} className="underline">
                un formato firmado
              </Link>
            )}
          </p>
        )}
        {/* El camino, con el paso actual marcado. */}
        <ol className="flex flex-wrap gap-1 text-[11px]">
          {CAMINO.map((c, i) => (
            <li key={c.key} className={`rounded px-1.5 py-0.5 ${i === idx ? "bg-slate-900 font-semibold text-white" : i < idx ? "bg-slate-200 text-slate-700" : "bg-slate-50 text-slate-400"}`}>
              {c.label}
            </li>
          ))}
        </ol>
        {idea.estado === "descartada" && <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">Descartada: {idea.motivo_descarte}</p>}
      </header>

      {advertencia && (
        <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-amber-950">
          <p className="text-sm font-bold">⚠ Antes de grabar</p>
          <p className="mt-1 whitespace-pre-wrap text-base">{advertencia}</p>
        </div>
      )}

      {bloqueantes.length > 0 && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <b>No se puede aprobar.</b> Usa material en el que se reconoce al cliente y el cliente no ha autorizado: {bloqueantes.join(", ")}. Pide la autorización (y regístrala en la{" "}
          <Link href="/marketing/biblioteca" className="underline">
            biblioteca
          </Link>
          ) o quita ese material.
        </p>
      )}

      {escribe && idea.estado !== "descartada" && idea.estado !== "publicada" && (
        <section className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
          <div className="flex flex-wrap gap-2">
            {anterior && (
              <button type="button" disabled={pendiente} onClick={devolver} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-40">
                ← Volver a {anterior.label.toLowerCase()}
              </button>
            )}
            {siguiente && siguiente.key !== "publicada" && (
              <button
                type="button"
                disabled={pendiente || (APROBADAS.includes(siguiente.key) && bloqueantes.length > 0)}
                onClick={avanzar}
                className="min-h-11 flex-1 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Pasar a {siguiente.label.toLowerCase()} →
              </button>
            )}
            <button type="button" onClick={() => setDescartando((v) => !v)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm text-slate-600">
              Descartar
            </button>
          </div>
          {descartando && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-800">
                Por qué se descarta (obligatorio)
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${campo} min-h-11`} />
              </label>
              <button
                type="button"
                disabled={pendiente || !motivo.trim()}
                onClick={() => guardar({ estado: "descartada", motivo_descarte: motivo.trim() }, "Descartada.")}
                className="min-h-11 w-full rounded-lg border border-slate-900 text-sm font-semibold disabled:opacity-40"
              >
                Descartar idea
              </button>
            </div>
          )}
        </section>
      )}
      {escribe && idea.estado === "descartada" && (
        <button type="button" disabled={pendiente} onClick={() => guardar({ estado: "idea", motivo_descarte: null }, "Recuperada como idea.")} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
          Recuperar como idea
        </button>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {aviso && <p className="text-sm text-green-800">{aviso}</p>}

      <GuionPorBloques bloques={f.guion} editable={ed} sucia={sucia} pendiente={pendiente} onCambio={(b) => cambiar("guion", b)} onGuardar={() => guardar()} />

      <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-3">
        <label className="block text-sm font-semibold text-slate-800">
          De qué se trata
          <input disabled={!ed} value={f.titulo} onChange={(e) => cambiar("titulo", e.target.value)} className={`${campo} min-h-11`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-semibold text-slate-800">
            Tipo
            <select disabled={!ed} value={f.tipo} onChange={(e) => cambiar("tipo", e.target.value)} className={`${campo} min-h-11 px-2`}>
              {TIPOS_IDEA.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Campaña
            <select disabled={!ed} value={f.campana_id} onChange={(e) => cambiar("campana_id", e.target.value)} className={`${campo} min-h-11 px-2`}>
              <option value="">Sin campaña</option>
              {campanas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Cuándo sale
            <input
              type="date"
              disabled={!ed}
              min={idea.estado === "programada" ? undefined : hoyBogota()}
              value={f.fecha_programada}
              onChange={(e) => cambiar("fecha_programada", e.target.value)}
              className={`${campo} min-h-11`}
            />
          </label>
        </div>
        {ed ? (
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-800">Dónde sale</p>
            <SelectorCanales valor={f.canales} onCambio={(v) => cambiar("canales", v)} />
          </div>
        ) : (
          <p className="text-sm text-slate-700">Canales: {f.canales.map((c) => ETIQUETA_CANAL[c] ?? c).join(", ") || "—"}</p>
        )}
        <label className="block text-sm font-semibold text-slate-800">
          Gancho (la primera línea, la que hace parar el dedo)
          <input disabled={!ed} value={f.gancho} onChange={(e) => cambiar("gancho", e.target.value)} className={`${campo} min-h-11`} />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Llamado a la acción
          <input disabled={!ed} value={f.llamado_accion} onChange={(e) => cambiar("llamado_accion", e.target.value)} placeholder="Ej.: Escríbenos para una visita de diagnóstico" className={`${campo} min-h-11`} />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Notas
          <textarea disabled={!ed} rows={3} value={f.notas} onChange={(e) => cambiar("notas", e.target.value)} className={`${campo} py-2`} />
        </label>
        {ed && (
          <button type="button" disabled={pendiente || !sucia || !f.titulo.trim()} onClick={() => guardar()} className="min-h-11 w-full rounded-lg bg-brand-red text-sm font-semibold text-white disabled:opacity-40">
            {pendiente ? "Guardando…" : sucia ? "Guardar cambios" : "Sin cambios"}
          </button>
        )}
      </section>

      {(idea.estado !== "descartada" || piezas.some((p) => p.prompt)) && (
        <GeneradorPrompts
          escribe={ed && !aprobada && idea.estado !== "descartada"}
          ideaId={idea.id}
          textoIdea={[f.gancho, ...f.guion.map((b) => b.texto)].join(" ")}
          sucia={sucia}
          bloqueantes={bloqueantes}
          piezas={piezas.filter((p) => p.prompt)}
          biblioteca={biblioteca}
        />
      )}

      <Piezas escribe={ed} ideaId={idea.id} piezas={piezas} biblioteca={biblioteca} />

      {(idea.estado === "programada" || idea.estado === "publicada") && (
        <Publicaciones escribe={escribe} bloqueada={bloqueantes.length > 0} idea={idea} cuentas={cuentas} publicaciones={publicaciones} />
      )}
    </div>
  );
}

function Piezas({ escribe, ideaId, piezas, biblioteca }: { escribe: boolean; ideaId: string; piezas: Pieza[]; biblioteca: MaterialBiblioteca[] }) {
  const router = useRouter();
  const [eligiendo, setEligiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const porId = new Map(biblioteca.map((b) => [b.id, b]));
  const siguienteOrden = piezas.reduce((m, p) => Math.max(m, p.orden), 0) + 1;

  const agregar = (b: MaterialBiblioteca) =>
    empezar(async () => {
      setError(null);
      // Bloqueo, no aviso: una pieza no se arma sobre material sin autorización.
      if (!estadoPublicable(b.identificable, b.autorizacion).publicable) return setError(`«${b.titulo}»: se reconoce al cliente y no hay autorización registrada. No se puede usar hasta registrarla en la biblioteca.`);
      const supabase = createClient();
      const { error: e } = await supabase
        .from("marketing_piezas")
        .insert({ idea_id: ideaId, orden: siguienteOrden, tipo: b.tipo === "video" ? "video" : "imagen", biblioteca_id: b.id, path: b.path, generada_por: "manual" });
      if (e) return setError(e.message);
      setEligiendo(false);
      router.refresh();
    });
  const quitar = (p: Pieza) =>
    empezar(async () => {
      setError(null);
      const { data, error: e } = await createClient().from("marketing_piezas").delete().eq("id", p.id).select("id");
      if (e || !data?.length) return setError(e?.message ?? "No se quitó (sin permiso).");
      router.refresh();
    });

  const usadas = new Set(piezas.map((p) => p.biblioteca_id));
  // Las piezas con prompt se muestran en «Imágenes con IA».
  const deBiblioteca = piezas.filter((p) => !p.prompt);
  return (
    <section className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-900">Arte: fotos y videos</h2>
      {deBiblioteca.length === 0 && <p className="text-sm text-slate-500">Todavía no tiene material.</p>}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {deBiblioteca.map((p) => {
          const b = p.biblioteca_id ? porId.get(p.biblioteca_id) : undefined;
          const e = b ? estadoPublicable(b.identificable, b.autorizacion) : null;
          return (
            <li key={p.id} className="overflow-hidden rounded-lg border border-slate-200">
              {b?.url ? <img src={b.url} alt={b.titulo} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-slate-100 text-xs text-slate-500">{b?.tipo ?? p.tipo}</div>}
              <div className="space-y-1 p-1.5">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {p.orden}. {b?.titulo ?? p.texto ?? "Pieza"}
                </p>
                {e && <p className={`rounded border px-1 py-0.5 text-[11px] font-semibold ${e.clase}`}>{e.texto}</p>}
                {escribe && (
                  <button type="button" disabled={pendiente} onClick={() => quitar(p)} className="min-h-11 w-full rounded border border-slate-300 text-xs text-slate-600">
                    Quitar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {escribe && (
        <button type="button" onClick={() => setEligiendo((v) => !v)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold">
          {eligiendo ? "Cerrar la biblioteca" : "+ Agregar de la biblioteca"}
        </button>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {eligiendo && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2">
          {biblioteca.length === 0 ? (
            <p className="text-sm text-slate-600">
              La biblioteca está vacía.{" "}
              <Link href="/marketing/biblioteca" className="underline">
                Sube material
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Las fotos sin autorización del cliente no se pueden usar: regístrala en la{" "}
              <Link href="/marketing/biblioteca" className="underline">
                biblioteca
              </Link>
              .
            </p>
          )}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {biblioteca
              .filter((b) => !usadas.has(b.id) && !b.archivada)
              .map((b) => {
                const e = estadoPublicable(b.identificable, b.autorizacion);
                return (
                  <li key={b.id}>
                    <button type="button" disabled={pendiente || !e.publicable} onClick={() => agregar(b)} className="block w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left disabled:cursor-not-allowed disabled:opacity-60">
                      {b.url ? <img src={b.url} alt="" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-slate-100 text-xs text-slate-500">{b.tipo}</div>}
                      <span className="block truncate px-1.5 pt-1 text-xs font-semibold text-slate-800">{b.titulo}</span>
                      <span className={`m-1.5 block rounded border px-1 py-0.5 text-[11px] font-semibold ${e.clase}`}>{e.texto}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Publicaciones({ escribe, bloqueada, idea, cuentas, publicaciones }: { escribe: boolean; bloqueada: boolean; idea: IdeaCompleta; cuentas: { id: string; canal: string; nombre: string }[]; publicaciones: Publicacion[] }) {
  const router = useRouter();
  const yaEn = new Set(publicaciones.map((p) => p.cuenta_id));
  const libres = cuentas.filter((c) => !yaEn.has(c.id));
  const [elegida, setCuenta] = useState("");
  // Por defecto, una cuenta de los canales de la idea; la elegida deja de valer al registrarla.
  const cuenta = libres.some((c) => c.id === elegida) ? elegida : (libres.find((c) => idea.canales.includes(c.canal)) ?? libres[0])?.id ?? "";
  const canalesSinCuenta = idea.canales.filter((c) => !cuentas.some((x) => x.canal === c));
  const [url, setUrl] = useState("");
  const [fecha, setFecha] = useState(hoyBogota());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const nombre = (id: string) => {
    const c = cuentas.find((x) => x.id === id);
    return c ? `${ETIQUETA_CANAL[c.canal] ?? c.canal} · ${c.nombre}` : "Cuenta";
  };
  const registrar = () =>
    empezar(async () => {
      setError(null);
      if (url.trim() && !/^https?:\/\/\S+$/i.test(url.trim())) return setError("Pega el enlace completo de la publicación (empieza por https://).");
      const supabase = createClient();
      // Al mediodía de Bogotá: es el día lo que importa para contar los 7 y los 30.
      const { error: e } = await supabase.from("marketing_publicaciones").insert({ idea_id: idea.id, cuenta_id: cuenta, url: url.trim() || null, via: "manual", publicado_en: `${fecha}T12:00:00-05:00` });
      if (e) return setError(e.message);
      if (idea.estado !== "publicada") {
        const r = await supabase.from("marketing_ideas").update({ estado: "publicada" }).eq("id", idea.id).select("id");
        if (r.error || !r.data?.length) return setError(`Se registró la publicación, pero la idea no pasó a publicada: ${r.error?.message ?? "sin permiso"}`);
      }
      setUrl("");
      router.refresh();
    });
  return (
    <section className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-900">Dónde se publicó</h2>
      {publicaciones.length === 0 ? (
        <p className="text-sm text-slate-500">Programada para {fechaCorta(idea.fecha_programada)}. Cuando salga, regístrala aquí con su enlace.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {publicaciones.map((p) => (
            <li key={p.id} className="space-y-2 rounded-lg border border-slate-200 p-2">
              <p>
                {nombre(p.cuenta_id)} · {fechaCorta(p.publicado_en)}{" "}
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="underline">
                    ver publicación
                  </a>
                )}
              </p>
              <Mediciones publicacionId={p.id} publicadoEn={p.publicado_en} mediciones={p.mediciones} escribe={escribe} />
            </li>
          ))}
        </ul>
      )}
      {canalesSinCuenta.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {canalesSinCuenta.map((c) => ETIQUETA_CANAL[c] ?? c).join(", ")} no tiene cuenta creada en Marketing: lo publicado ahí todavía no se puede registrar.
        </p>
      )}
      {bloqueada && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">No se puede registrar: quita o autoriza primero el material marcado en rojo.</p>}
      {escribe && !bloqueada && libres.length > 0 && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <input type="date" aria-label="Fecha de publicación" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base" />
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-base">
              {libres.map((c) => (
                <option key={c.id} value={c.id}>
                  {nombre(c.id)}
                </option>
              ))}
            </select>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enlace de la publicación" className="min-h-11 rounded-lg border border-slate-300 px-3 text-base" />
          </div>
          <button type="button" disabled={pendiente || !cuenta || !fecha} onClick={registrar} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40">
            Registrar que salió
          </button>
        </div>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AbrirArchivo } from "@/components/documentos/AbrirArchivo";
import { CATEGORIAS_PORTAL, ETIQUETA_CATEGORIA, categoriaDeTipo, tipoDeCategoria, type CategoriaPortal } from "@/lib/cliente-portal";
import { LIMITE_BYTES, MIME, NOMBRE_TIPO, TIPOS_OBRA, extension, nombreLimpio, sha256Archivo } from "@/lib/documentos/catalogo";
import { publicarAlPortal, retirarDelPortal } from "./portal-actions";

const CAMPO = "mt-0.5 w-full min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm";

export interface Publicacion {
  id: string;
  categoria: string;
  titulo: string;
  descripcion: string | null;
  proyecto_documento_id: string | null;
  formato_id: string | null;
  path: string | null;
  bucket: string | null;
  publicado_en: string;
  retirado_en: string | null;
  motivo_retiro: string | null;
}
export interface DocumentoObra {
  id: string;
  tipo: string;
  nombre: string;
  path: string;
  reservado: boolean;
}
export interface FormatoCerrado {
  id: string;
  nombre: string;
  fecha: string;
  ambito: string;
}

type Origen = "documento" | "formato" | "archivo";

const fecha = (iso: string) => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));

/**
 * "Publicar al portal del cliente": lo ÚNICO que el cliente alcanza a ver es lo que se publica aquí.
 * Se escoge un documento de la obra, un formato ya firmado, o se sube un archivo (que queda además
 * como documento de la obra: una fuente, muchas vistas). Retirar no borra: deja el motivo.
 */
export function PortalProyecto({
  proyectoId,
  tieneCliente,
  puedePublicar,
  publicaciones,
  documentos,
  formatos,
}: {
  proyectoId: string;
  tieneCliente: boolean;
  puedePublicar: boolean;
  publicaciones: Publicacion[];
  documentos: DocumentoObra[];
  formatos: FormatoCerrado[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [origen, setOrigen] = useState<Origen>("documento");
  const [fuenteId, setFuenteId] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipoArchivo, setTipoArchivo] = useState("otro");
  const [categoria, setCategoria] = useState<CategoriaPortal | "">("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [verRetirados, setVerRetirados] = useState(false);

  const activas = publicaciones.filter((p) => !p.retirado_en);
  const retiradas = publicaciones.filter((p) => p.retirado_en);
  const publicadoDoc = new Set(activas.map((p) => p.proyecto_documento_id).filter(Boolean));
  const publicadoFmt = new Set(activas.map((p) => p.formato_id).filter(Boolean));
  const docPorId = new Map(documentos.map((d) => [d.id, d]));
  const fmtPorId = new Map(formatos.map((f) => [f.id, f]));

  function limpiar() {
    setFuenteId("");
    setArchivo(null);
    setTipoArchivo("otro");
    setCategoria("");
    setTitulo("");
    setDescripcion("");
  }

  function escogerFuente(id: string) {
    setFuenteId(id);
    if (origen === "documento") {
      const d = docPorId.get(id);
      if (d) {
        setCategoria(categoriaDeTipo(d.tipo));
        if (!titulo.trim()) setTitulo(d.nombre);
      }
    } else if (origen === "formato") {
      const f = fmtPorId.get(id);
      if (f) {
        setCategoria("acta");
        if (!titulo.trim()) setTitulo(`${f.nombre} · ${f.fecha}`);
      }
    }
  }

  async function publicar() {
    setError(null);
    setAviso(null);
    if (!categoria) return setError("Escoge una categoría.");
    if (!titulo.trim()) return setError("Ponle un título: es lo que lee el cliente.");
    let fuente: { tipo: "documento" | "formato"; id: string };
    if (origen === "archivo") {
      if (!archivo) return setError("Escoge el archivo.");
      const mime = MIME[extension(archivo.name)];
      if (!mime) return setError("Ese tipo de archivo no se acepta (PDF, imagen, Word, Excel o texto).");
      if (archivo.size > LIMITE_BYTES) return setError("El archivo pesa más de 15 MB.");
      if (!TIPOS_OBRA.some((t) => t.id === tipoArchivo)) return setError("Escoge qué es el documento.");
      setSubiendo(true);
      try {
        // El id lo pone el navegador y el insert va SIN .select(): pedir la fila de vuelta es un
        // INSERT … RETURNING, que pasa por la política de SELECT (fn_proyecto_documento_visible, STABLE,
        // busca la fila por id y no ve la que se está insertando) y rebota con "new row violates
        // row-level security policy" aunque quien sube tenga todos los permisos.
        const docId = crypto.randomUUID();
        // La ruta tiene que empezar por el proyecto (check proyecto_documentos_path y política del bucket).
        const path = `${proyectoId}/${crypto.randomUUID()}-${nombreLimpio(archivo.name)}`;
        const sha = await sha256Archivo(archivo);
        // Orden: registrar primero, subir después. El bucket no deja borrar desde la app: si se subiera
        // primero y fallara el registro, el archivo quedaría huérfano sin forma de limpiarlo. Al revés,
        // si falla la subida, la fila se archiva con motivo (eso sí lo permite la base).
        const r = await supabase
          .from("proyecto_documentos")
          .insert({ id: docId, proyecto_id: proyectoId, tipo: tipoArchivo, nombre: titulo.trim(), nombre_archivo: archivo.name, path, mime, bytes: archivo.size, sha256: sha, origen: "original", reservado: false });
        if (r.error) throw new Error(`No se pudo registrar el documento de la obra (no se subió nada): ${r.error.message}`);
        const s = await supabase.storage.from("documentos-proyectos").upload(path, archivo, { contentType: mime, upsert: false });
        if (s.error) {
          const a = await supabase
            .from("proyecto_documentos")
            .update({ archivado: true, motivo_archivo: `No se pudo subir el archivo al publicar al portal: ${s.error.message}` })
            .eq("id", docId);
          throw new Error(
            a.error
              ? `No se pudo subir el archivo (${s.error.message}) y tampoco archivar su registro (${a.error.message}). Avísale a Jhojan: quedó «${titulo.trim()}» en los documentos de la obra sin archivo.`
              : `No se pudo subir el archivo (${s.error.message}). Su registro quedó archivado con el motivo; vuelve a intentar.`,
          );
        }
        fuente = { tipo: "documento", id: docId };
      } catch (e) {
        setSubiendo(false);
        return setError(e instanceof Error ? e.message : String(e));
      }
      setSubiendo(false);
    } else {
      if (!fuenteId) return setError(origen === "documento" ? "Escoge el documento." : "Escoge el formato.");
      fuente = { tipo: origen, id: fuenteId };
    }
    iniciar(async () => {
      const res = await publicarAlPortal({ proyectoId, fuente, categoria, titulo, descripcion });
      if (!res.ok) {
        setError(origen === "archivo" ? `${res.error} (El archivo ya quedó en los documentos de la obra: publícalo desde «Documento de la obra».)` : res.error);
        router.refresh();
        return;
      }
      setAviso(`Publicado: «${titulo.trim()}». El cliente ya lo ve en su portal.`);
      limpiar();
      setAbierto(false);
      router.refresh();
    });
  }

  function retirar(id: string) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const res = await retirarDelPortal(id, proyectoId, motivo);
      if (!res.ok) return setError(res.error);
      setRetirando(null);
      setMotivo("");
      setAviso("Retirado. El cliente ya no lo ve; el registro queda con el motivo.");
      router.refresh();
    });
  }

  const docsDisponibles = documentos.filter((d) => !publicadoDoc.has(d.id));
  const fmtsDisponibles = formatos.filter((f) => !publicadoFmt.has(f.id));
  const ocupado = pendiente || subiendo;

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Portal del cliente</h2>
        {puedePublicar && tieneCliente && !abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">
            + Publicar al portal
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-slate-500">El cliente solo ve lo que se publica aquí. Nada de la obra se le muestra por defecto.</p>
      {!tieneCliente && <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Este proyecto no tiene cliente asignado: no hay a quién publicarle.</p>}
      {aviso && <p className="mb-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800">{aviso}</p>}
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}

      {abierto && (
        <div className="mb-3 space-y-3 rounded-lg border-2 border-slate-900 bg-white p-3 text-sm">
          <div>
            <p className="text-xs text-slate-600">¿Qué vas a publicar?</p>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {(
                [
                  ["documento", "Documento de la obra"],
                  ["formato", "Formato firmado"],
                  ["archivo", "Subir archivo"],
                ] as const
              ).map(([id, txt]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setOrigen(id);
                    setFuenteId("");
                    setArchivo(null);
                  }}
                  className={`min-h-11 rounded-md border px-1 text-xs font-semibold ${origen === id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
                >
                  {txt}
                </button>
              ))}
            </div>
          </div>

          {origen === "documento" && (
            <label className="block">
              <span className="text-xs text-slate-600">Documento</span>
              <select value={fuenteId} onChange={(e) => escogerFuente(e.target.value)} className={CAMPO}>
                <option value="">— Escoge —</option>
                {docsDisponibles.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre} ({NOMBRE_TIPO[d.tipo] ?? d.tipo}){d.reservado ? " · RESERVADO" : ""}
                  </option>
                ))}
              </select>
              {docsDisponibles.length === 0 && <span className="text-xs text-slate-500">No hay documentos de la obra sin publicar (o no tienes permiso de verlos).</span>}
              {docPorId.get(fuenteId)?.reservado && (
                <span className="mt-1 block rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Ojo: este documento está marcado como reservado. Publícalo solo si el cliente debe verlo.</span>
              )}
            </label>
          )}
          {origen === "formato" && (
            <label className="block">
              <span className="text-xs text-slate-600">Formato firmado de esta obra</span>
              <select value={fuenteId} onChange={(e) => escogerFuente(e.target.value)} className={CAMPO}>
                <option value="">— Escoge —</option>
                {fmtsDisponibles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre} · {f.fecha}
                    {f.ambito === "sgsst" ? " (SG-SST)" : ""}
                  </option>
                ))}
              </select>
              {fmtsDisponibles.length === 0 && <span className="text-xs text-slate-500">No hay formatos firmados sin publicar. Solo se publican los ya cerrados.</span>}
            </label>
          )}
          {origen === "archivo" && (
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs text-slate-600">Archivo (PDF, imagen, Word, Excel; hasta 15 MB)</span>
                <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">Qué es (queda también en los documentos de la obra)</span>
                <select value={tipoArchivo} onChange={(e) => setTipoArchivo(e.target.value)} className={CAMPO}>
                  {TIPOS_OBRA.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-xs text-slate-600">Categoría en el portal</span>
            <select
              value={categoria}
              onChange={(e) => {
                const c = e.target.value as CategoriaPortal | "";
                setCategoria(c);
                if (c && origen === "archivo") setTipoArchivo(tipoDeCategoria(c));
              }}
              className={CAMPO}
            >
              <option value="">— Escoge —</option>
              {CATEGORIAS_PORTAL.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-600">Título (lo que lee el cliente)</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={CAMPO} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-600">Descripción (opcional)</span>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                limpiar();
                setAbierto(false);
                setError(null);
              }}
              className="min-h-11 rounded-md border border-slate-300 text-sm font-semibold text-slate-700"
            >
              Cancelar
            </button>
            <button type="button" disabled={ocupado} onClick={() => void publicar()} className="min-h-11 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:bg-slate-400">
              {subiendo ? "Subiendo…" : pendiente ? "Publicando…" : "Publicar"}
            </button>
          </div>
        </div>
      )}

      {activas.length === 0 ? (
        <p className="text-xs text-slate-500">Nada publicado todavía.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {activas.map((p) => {
            const doc = p.proyecto_documento_id ? docPorId.get(p.proyecto_documento_id) : undefined;
            return (
              <li key={p.id} className="space-y-2 p-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ETIQUETA_CATEGORIA[p.categoria] ?? p.categoria}</p>
                  <p className="font-semibold text-slate-900">{p.titulo}</p>
                  {p.descripcion && <p className="text-xs text-slate-600">{p.descripcion}</p>}
                  <p className="text-xs text-slate-500">Publicado {fecha(p.publicado_en)}</p>
                </div>
                {p.formato_id ? (
                  <Link href={`/${fmtPorId.get(p.formato_id)?.ambito === "sgsst" ? "sgsst/formatos" : "proyectos/actas"}/${p.formato_id}`} className="inline-flex min-h-11 items-center text-xs font-semibold underline">
                    Ver el formato
                  </Link>
                ) : doc ? (
                  <AbrirArchivo bucket="documentos-proyectos" path={doc.path} titulo={p.titulo} />
                ) : p.bucket && p.path ? (
                  <AbrirArchivo bucket={p.bucket} path={p.path} titulo={p.titulo} />
                ) : (
                  <p className="text-xs text-slate-500">(sin permiso para ver el archivo)</p>
                )}
                {puedePublicar &&
                  (retirando === p.id ? (
                    <div className="space-y-2 rounded-md bg-slate-50 p-2">
                      <label className="block">
                        <span className="text-xs text-slate-600">Motivo del retiro (queda en el registro)</span>
                        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CAMPO} autoFocus />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setRetirando(null)} className="min-h-11 rounded-md border border-slate-300 text-xs font-semibold">
                          Cancelar
                        </button>
                        <button type="button" disabled={pendiente || motivo.trim().length < 4} onClick={() => retirar(p.id)} className="min-h-11 rounded-md bg-red-700 text-xs font-semibold text-white disabled:bg-slate-300">
                          Retirar del portal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRetirando(p.id);
                        setMotivo("");
                      }}
                      className="min-h-11 text-xs font-semibold text-red-700 underline"
                    >
                      Retirar del portal
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {retiradas.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setVerRetirados((v) => !v)} className="min-h-11 text-xs text-slate-600 underline">
            {verRetirados ? "Ocultar retirados" : `Ver retirados (${retiradas.length})`}
          </button>
          {verRetirados && (
            <ul className="mt-1 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
              {retiradas.map((p) => (
                <li key={p.id} className="p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800 line-through">{p.titulo}</p>
                  <p>
                    Publicado {fecha(p.publicado_en)} · retirado {fecha(p.retirado_en!)}
                  </p>
                  <p>Motivo: {p.motivo_retiro}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!puedePublicar && <p className="mt-1 text-xs text-slate-500">Publicar al portal requiere Proyectos en nivel “trabajar”.</p>}
    </section>
  );
}

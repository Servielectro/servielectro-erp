"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  codigoEnNombre,
  extension,
  LIMITE_BYTES,
  MIME,
  MIME_RUT,
  nombreLimpio,
  proponer,
  sha256Archivo,
  TIPOS_CLIENTE,
  TIPOS_OBRA,
  type Destino,
} from "@/lib/documentos/catalogo";

const CAMPO = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";

interface Fila {
  clave: string;
  archivo: File;
  ruta: string;
  mime: string | null;
  sha256: string;
  /** "obra:<proyecto_id>" | "cliente" | "rut" */
  destino: string;
  tipo: string;
  nombre: string;
  fecha: string;
  reservado: boolean;
  origen: "original" | "escaneado" | "fotos";
  incluir: boolean;
  revisar: string | null;
  revisado: boolean;
  /** Por qué no se puede subir (tipo de archivo, tamaño, ya está). */
  bloqueo: string | null;
  estado: "pendiente" | "subiendo" | "listo" | "error";
  mensaje: string | null;
}

const nombreSinExtension = (n: string) => n.replace(/\.[^.]+$/, "");

/**
 * Subir documentos desde el navegador, con la sesión de quien sube (las políticas de las
 * migraciones 90 y 101: sin claves ni terminal). Se eligen archivos sueltos o una CARPETA entera
 * de OneDrive; para cada archivo se PROPONE destino (una obra del cliente, el cliente, o su RUT) y
 * tipo según la subcarpeta y el nombre. Nada se sube hasta que una persona revisa la lista y
 * confirma; los contratos y lo que no se reconoce piden marcar "revisado" uno por uno.
 */
export function SubirDocumentos({
  clienteId,
  obras,
  shasExistentes,
  veSensibles,
}: {
  clienteId: string;
  obras: { id: string; codigo: string | null; nombre: string }[];
  /** "obra:<id>:<sha>" y "cliente:<sha>" de lo que ya está (sin archivar). */
  shasExistentes: string[];
  veSensibles: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const obraDefecto = obras.length === 1 ? `obra:${obras[0].id}` : "";
  const existentes = new Set(shasExistentes);

  const destinoClave = (f: Pick<Fila, "destino" | "sha256">) =>
    f.destino.startsWith("obra:") ? `${f.destino}:${f.sha256}` : f.destino === "cliente" ? `cliente:${f.sha256}` : null;

  /** Por qué esta fila no se puede subir tal como está (null = se puede). */
  function bloqueoDe(f: Fila, todas: Fila[]): string | null {
    if (!f.mime) return `Tipo de archivo .${extension(f.archivo.name)} no admitido.`;
    if (f.archivo.size > LIMITE_BYTES) return "Pasa de 15 MB.";
    if (f.destino === "rut" && !MIME_RUT.has(f.mime)) return "El RUT va en PDF o foto.";
    const clave = destinoClave(f);
    if (clave && existentes.has(clave)) return "Ya está cargado.";
    if (clave && todas.some((o) => o.clave !== f.clave && o.incluir && destinoClave(o) === clave && o.clave < f.clave)) return "Repetido en esta lista.";
    return null;
  }
  function falta(f: Fila): string | null {
    if (!f.destino) return "Elige la obra.";
    if (!f.nombre.trim()) return "Escribe el nombre.";
    if (f.revisar && !f.revisado) return "Marca que lo revisaste.";
    if (f.reservado && !veSensibles) return "Es reservado: lo sube quien ve datos sensibles.";
    return null;
  }

  async function elegir(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setLeyendo(true);
    setAviso(null);
    const nuevas: Fila[] = [];
    for (const archivo of Array.from(lista)) {
      if (archivo.name.startsWith("~$") || archivo.name.startsWith(".") || archivo.name.toLowerCase() === "desktop.ini") continue;
      const ruta = (archivo as File & { webkitRelativePath?: string }).webkitRelativePath || archivo.name;
      const p = proponer(ruta);
      const destino: Destino = p.destino;
      // Si el nombre trae un código (CSE-26-157), va a la obra con ese código; si ninguna lo tiene,
      // no se manda a la obra por defecto: en Tintalá la CSE-26-157 es otra cotización, no la 151.
      let destinoObra = obraDefecto;
      let revisar = p.revisar;
      let incluir = p.incluir;
      const codigo = destino === "obra" ? codigoEnNombre(archivo.name) : null;
      if (codigo) {
        const obra = obras.find((o) => o.codigo === codigo);
        if (obra) destinoObra = `obra:${obra.id}`;
        else {
          destinoObra = "";
          incluir = false;
          revisar = `Dice ${codigo} y ninguna obra de este cliente tiene ese código (¿cotización sin obra todavía?).`;
        }
      }
      nuevas.push({
        clave: `${ruta}#${archivo.size}#${archivo.lastModified}`,
        archivo,
        ruta,
        mime: MIME[extension(archivo.name)] ?? null,
        sha256: await sha256Archivo(archivo),
        destino: destino === "obra" ? destinoObra : destino,
        tipo: p.tipo,
        nombre: nombreSinExtension(archivo.name),
        fecha: "",
        reservado: p.reservado,
        origen: p.origen,
        incluir,
        revisar,
        revisado: false,
        bloqueo: null,
        estado: "pendiente",
        mensaje: null,
      });
    }
    nuevas.sort((a, b) => a.ruta.localeCompare(b.ruta));
    setFilas((prev) => {
      const ya = new Set(prev.map((f) => f.clave));
      return [...prev, ...nuevas.filter((f) => !ya.has(f.clave))];
    });
    setLeyendo(false);
  }

  const cambiar = (clave: string, cambio: Partial<Fila>) =>
    setFilas((prev) =>
      prev.map((f) => {
        if (f.clave !== clave) return f;
        const n = { ...f, ...cambio };
        // Al cambiar de destino, el tipo tiene que ser del catálogo del destino.
        if (cambio.destino !== undefined) {
          if (n.destino === "rut") n.tipo = "rut";
          else if (n.destino === "cliente" && !TIPOS_CLIENTE.some((t) => t.id === n.tipo)) n.tipo = "otro";
          else if (n.destino.startsWith("obra:") && !TIPOS_OBRA.some((t) => t.id === n.tipo)) n.tipo = "otro";
        }
        return n;
      }),
    );

  const conEstado = filas.map((f) => ({ ...f, bloqueo: bloqueoDe(f, filas) }));
  const aSubir = conEstado.filter((f) => f.incluir && !f.bloqueo && f.estado !== "listo");
  const sinListo = aSubir.filter((f) => falta(f));

  async function subir() {
    setSubiendo(true);
    setAviso(null);
    const supabase = createClient();
    const yo = (await supabase.auth.getUser()).data.user?.id ?? null;
    let ok = 0;
    for (const f of aSubir) {
      cambiar(f.clave, { estado: "subiendo", mensaje: null });
      const unico = `${crypto.randomUUID()}-${nombreLimpio(f.archivo.name)}`;
      let error: string | null = null;
      if (f.destino.startsWith("obra:")) {
        const proyectoId = f.destino.slice(5);
        const path = `${proyectoId}/${unico}`;
        const s = await supabase.storage.from("documentos-proyectos").upload(path, f.archivo, { contentType: f.mime!, upsert: false });
        if (s.error) error = `No se pudo subir: ${s.error.message}`;
        else {
          const r = await supabase.from("proyecto_documentos").insert({
            proyecto_id: proyectoId, tipo: f.tipo, nombre: f.nombre.trim(), nombre_archivo: f.archivo.name, path, mime: f.mime,
            bytes: f.archivo.size, sha256: f.sha256, fecha_documento: f.fecha || null, origen: f.origen, reservado: f.reservado,
          });
          if (r.error) error = `Se subió el archivo pero no se pudo registrar: ${r.error.message}`;
        }
      } else if (f.destino === "cliente") {
        const path = `clientes/${clienteId}/docs/${unico}`;
        const s = await supabase.storage.from("documentos-clientes").upload(path, f.archivo, { contentType: f.mime!, upsert: false });
        if (s.error) error = `No se pudo subir: ${s.error.message}`;
        else {
          const r = await supabase.from("cliente_documentos").insert({
            cliente_id: clienteId, tipo: f.tipo, nombre: f.nombre.trim(), nombre_archivo: f.archivo.name, path, mime: f.mime,
            bytes: f.archivo.size, sha256: f.sha256, fecha_documento: f.fecha || null, origen: f.origen,
          });
          if (r.error) error = `Se subió el archivo pero no se pudo registrar: ${r.error.message}`;
        }
      } else {
        // El RUT por su flujo (migraciones 14 y 71): queda PENDIENTE de confirmar contra la ficha.
        const path = `clientes/${clienteId}/rut/${unico}`;
        const s = await supabase.storage.from("documentos-clientes").upload(path, f.archivo, { contentType: f.mime!, upsert: false });
        if (s.error) error = `No se pudo subir: ${s.error.message}`;
        else {
          const r = await supabase.from("documentos").insert({
            tipo_documento: "RUT", cliente_id: clienteId, storage_path: path, nombre_archivo: f.archivo.name,
            subido_por: yo, estado: "PENDIENTE_CONFIRMACION",
          });
          if (r.error) error = `Se subió el archivo pero no se pudo registrar: ${r.error.message}`;
        }
      }
      if (error) cambiar(f.clave, { estado: "error", mensaje: error });
      else {
        ok += 1;
        cambiar(f.clave, { estado: "listo", mensaje: null });
      }
    }
    setSubiendo(false);
    setAviso(ok === aSubir.length ? `Listo: ${ok} documento${ok === 1 ? "" : "s"} cargado${ok === 1 ? "" : "s"}.` : `Se cargaron ${ok} de ${aSubir.length}. Revisa los que quedaron en rojo.`);
    router.refresh();
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 w-full rounded-md bg-brand-red px-4 text-sm font-semibold text-white">
        Subir documentos
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-300 bg-slate-50 p-3">
      <div className="flex flex-wrap gap-2">
        <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-semibold text-white">
          Elegir archivos
          <input type="file" multiple className="sr-only" disabled={leyendo || subiendo} onChange={(e) => { void elegir(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md border border-slate-900 px-3 text-sm font-semibold text-slate-900">
          Elegir una carpeta
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={leyendo || subiendo}
            ref={(el) => { if (el) el.setAttribute("webkitdirectory", ""); }}
            onChange={(e) => { void elegir(e.target.files); e.target.value = ""; }}
          />
        </label>
        <button type="button" disabled={subiendo} onClick={() => { setAbierto(false); setFilas([]); setAviso(null); }} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm">
          Cerrar
        </button>
      </div>
      <p className="text-xs text-slate-600">
        La carpeta puede ser la del cliente en OneDrive (por ejemplo TINTALA FASE VI): el tipo se propone por la subcarpeta y el nombre. Revisa la lista; nada se sube hasta que confirmes.
      </p>
      {leyendo && <p className="text-sm text-slate-700">Leyendo los archivos…</p>}

      {conEstado.length > 0 && (
        <ul className="space-y-2">
          {conEstado.map((f) => {
            const motivo = f.bloqueo ?? (f.incluir ? falta(f) : null);
            const borde = f.estado === "listo" ? "border-green-300 bg-green-50" : f.estado === "error" ? "border-red-300 bg-red-50" : f.revisar && !f.revisado && f.incluir ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white";
            const tipos = f.destino === "cliente" ? TIPOS_CLIENTE : TIPOS_OBRA;
            const quieto = subiendo || f.estado === "listo";
            return (
              <li key={f.clave} className={`space-y-2 rounded-md border p-2 text-sm ${borde}`}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1 h-5 w-5" checked={f.incluir && !f.bloqueo} disabled={!!f.bloqueo || quieto} onChange={(e) => cambiar(f.clave, { incluir: e.target.checked })} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium">{f.ruta}</span>
                    <span className="text-xs text-slate-500">{(f.archivo.size / 1024).toFixed(0)} KB · {f.sha256.slice(0, 12)}</span>
                  </span>
                </label>
                {!f.bloqueo && f.incluir && f.estado !== "listo" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs">
                      Va a
                      <select disabled={quieto} value={f.destino} onChange={(e) => cambiar(f.clave, { destino: e.target.value })} className={CAMPO}>
                        <option value="">Elige la obra…</option>
                        {obras.map((o) => (
                          <option key={o.id} value={`obra:${o.id}`}>
                            Obra {o.codigo ?? ""} {o.nombre}
                          </option>
                        ))}
                        <option value="cliente">El cliente (no es de una obra)</option>
                        <option value="rut">RUT del cliente</option>
                      </select>
                    </label>
                    {f.destino !== "rut" && (
                      <label className="text-xs">
                        Tipo
                        <select disabled={quieto} value={f.tipo} onChange={(e) => cambiar(f.clave, { tipo: e.target.value, revisado: true })} className={CAMPO}>
                          {tipos.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.etiqueta}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {f.destino !== "rut" && (
                      <label className="text-xs sm:col-span-2">
                        Nombre
                        <input disabled={quieto} value={f.nombre} onChange={(e) => cambiar(f.clave, { nombre: e.target.value })} className={CAMPO} />
                      </label>
                    )}
                    {f.destino !== "rut" && (
                      <label className="text-xs">
                        Fecha del documento
                        <input disabled={quieto} type="date" value={f.fecha} onChange={(e) => cambiar(f.clave, { fecha: e.target.value })} className={CAMPO} />
                      </label>
                    )}
                    {f.destino !== "rut" && (
                      <label className="text-xs">
                        Origen
                        <select disabled={quieto} value={f.origen} onChange={(e) => cambiar(f.clave, { origen: e.target.value as Fila["origen"] })} className={CAMPO}>
                          <option value="original">Original</option>
                          <option value="escaneado">Escaneado</option>
                          <option value="fotos">Fotos</option>
                        </select>
                      </label>
                    )}
                    {f.destino.startsWith("obra:") && (
                      <label className="flex items-center gap-2 text-xs sm:col-span-2">
                        <input type="checkbox" className="h-5 w-5" disabled={quieto || !veSensibles} checked={f.reservado} onChange={(e) => cambiar(f.clave, { reservado: e.target.checked })} />
                        Reservado (trae costos o utilidades: solo lo ve quien ve datos sensibles)
                      </label>
                    )}
                    {f.revisar && (
                      <label className="flex items-start gap-2 rounded-md bg-amber-100 p-2 text-xs text-amber-900 sm:col-span-2">
                        <input type="checkbox" className="mt-0.5 h-5 w-5" disabled={quieto} checked={f.revisado} onChange={(e) => cambiar(f.clave, { revisado: e.target.checked })} />
                        <span>
                          {f.revisar} <b>Revisado.</b>
                        </span>
                      </label>
                    )}
                  </div>
                )}
                {f.estado === "listo" && <p className="text-xs font-semibold text-green-800">Cargado.</p>}
                {f.estado === "subiendo" && <p className="text-xs text-slate-700">Subiendo…</p>}
                {f.mensaje && <p className="text-xs text-red-800">{f.mensaje}</p>}
                {motivo && f.estado !== "listo" && <p className="text-xs text-slate-600">{motivo}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {conEstado.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            disabled={subiendo || aSubir.length === 0 || sinListo.length > 0}
            onClick={() => void subir()}
            className="min-h-11 w-full rounded-md bg-brand-red px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {subiendo ? "Subiendo…" : `Confirmo: subir ${aSubir.length} documento${aSubir.length === 1 ? "" : "s"}`}
          </button>
          {sinListo.length > 0 && !subiendo && <p className="text-xs text-amber-900">Faltan {sinListo.length} por completar (lo que dice debajo de cada uno).</p>}
        </div>
      )}
      {aviso && <p className="rounded-md bg-white px-2 py-1 text-sm font-medium text-slate-900">{aviso}</p>}
    </div>
  );
}

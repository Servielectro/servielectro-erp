"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET_RRHH,
  MAX_BYTES_PLANTILLA,
  MIME_DOCX,
  TIPOS_PLANTILLA,
  nombreSeguro,
} from "@/lib/rrhh";
import { crearPlantilla, enlaceDescarga, publicarVersion } from "./actions";

export interface PlantillaUI {
  id: string;
  nombre: string;
  tipo: string;
  versiones: {
    id: string;
    version: number;
    nombreArchivo: string;
    tamanoBytes: number | null;
    vigente: boolean;
    notas: string | null;
    subidaEn: string;
  }[];
}

const etiquetaTipo = (t: string) => TIPOS_PLANTILLA.find((x) => x.id === t)?.label ?? t;

function validarArchivo(f: File | null): string | null {
  if (!f) return "Elige el archivo .docx";
  if (!f.name.toLowerCase().endsWith(".docx")) return "La plantilla tiene que ser un archivo Word (.docx)";
  if (f.size > MAX_BYTES_PLANTILLA) return "El archivo pasa de 10 MB";
  return null;
}

/**
 * Sube el .docx directo a Storage con la sesión del usuario (la RLS del bucket exige
 * nivel "trabajar" en RRHH) y lo registra como versión nueva vigente.
 */
async function subirVersion(plantillaId: string, archivo: File, notas: string) {
  const ruta = `plantillas/${plantillaId}/${Date.now()}-${nombreSeguro(archivo.name)}`;
  const { error } = await createClient()
    .storage.from(BUCKET_RRHH)
    .upload(ruta, archivo, { contentType: MIME_DOCX, upsert: false });
  if (error) return { ok: false as const, error: `No se pudo subir el archivo: ${error.message}` };
  return publicarVersion({
    plantillaId,
    storagePath: ruta,
    nombreArchivo: archivo.name,
    tamanoBytes: archivo.size,
    notas,
  });
}

export function PlantillasAdmin({ plantillas, puedeSubir }: { plantillas: PlantillaUI[]; puedeSubir: boolean }) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function descargar(versionId: string) {
    setMensaje(null);
    const res = await enlaceDescarga(versionId);
    if (!res.ok) return setMensaje({ tipo: "error", texto: res.error });
    window.location.assign(res.url);
  }

  return (
    <div className="space-y-4">
      {mensaje && (
        <p className={`rounded-md px-3 py-2 text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {mensaje.texto}
        </p>
      )}

      {plantillas.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
          Todavía no hay plantillas.
        </p>
      )}

      {plantillas.map((p) => {
        const vigente = p.versiones.find((v) => v.vigente);
        const anteriores = p.versiones.filter((v) => !v.vigente);
        return (
          <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{p.nombre}</p>
                <p className="text-xs text-slate-500">{etiquetaTipo(p.tipo)}</p>
              </div>
              {vigente ? (
                <button
                  type="button"
                  onClick={() => descargar(vigente.id)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800"
                >
                  ⬇ Descargar vigente (v{vigente.version})
                </button>
              ) : (
                <span className="text-xs text-amber-700">Sin versión subida</span>
              )}
            </div>
            {vigente && (
              <p className="mt-1 text-xs text-slate-600">
                Vigente: v{vigente.version} · {vigente.nombreArchivo} · subida el{" "}
                {new Date(vigente.subidaEn).toLocaleString("es-CO")}
                {vigente.notas && ` · ${vigente.notas}`}
              </p>
            )}

            {anteriores.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-600">
                  Historial ({anteriores.length} {anteriores.length === 1 ? "versión anterior" : "versiones anteriores"})
                </summary>
                <ul className="mt-1 space-y-1">
                  {anteriores.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span>
                        v{v.version} · {v.nombreArchivo} · {new Date(v.subidaEn).toLocaleString("es-CO")}
                        {v.notas && ` · ${v.notas}`}
                      </span>
                      <button type="button" onClick={() => descargar(v.id)} className="underline">
                        descargar
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {puedeSubir && (
              <NuevaVersion
                ocupado={ocupado}
                etiqueta={vigente ? "Reemplazar por una versión nueva" : "Subir el archivo"}
                onSubir={async (archivo, notas) => {
                  setOcupado(true);
                  setMensaje(null);
                  const res = await subirVersion(p.id, archivo, notas);
                  setOcupado(false);
                  if (!res.ok) return setMensaje({ tipo: "error", texto: res.error });
                  setMensaje({ tipo: "ok", texto: `Versión nueva de "${p.nombre}" subida y vigente. La anterior quedó en el historial.` });
                  router.refresh();
                }}
              />
            )}
          </div>
        );
      })}

      {puedeSubir ? (
        <NuevaPlantilla
          ocupado={ocupado}
          onCrear={async (nombre, tipo, archivo, notas) => {
            setOcupado(true);
            setMensaje(null);
            const creada = await crearPlantilla(nombre, tipo);
            if (!creada.ok) {
              setOcupado(false);
              return setMensaje({ tipo: "error", texto: creada.error });
            }
            const res = await subirVersion(creada.id, archivo, notas);
            setOcupado(false);
            router.refresh();
            if (!res.ok) {
              return setMensaje({
                tipo: "error",
                texto: `La plantilla quedó creada, pero el archivo no: ${res.error}. Súbelo desde la plantilla.`,
              });
            }
            setMensaje({ tipo: "ok", texto: `Plantilla "${nombre.trim()}" guardada (v1 vigente).` });
          }}
        />
      ) : (
        <p className="text-xs text-slate-500">Tu rol puede ver y descargar plantillas, no subirlas.</p>
      )}
    </div>
  );
}

function NuevaVersion({
  ocupado,
  etiqueta,
  onSubir,
}: {
  ocupado: boolean;
  etiqueta: string;
  onSubir: (archivo: File, notas: string) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="mt-2 rounded-md bg-slate-50 p-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-700">{etiqueta}</summary>
      <div className="mt-2 space-y-2">
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Qué cambió (ej. versión revisada por el abogado)"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        {error && <p className="text-xs text-red-700">{error}</p>}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            const e = validarArchivo(archivo);
            setError(e);
            if (!e && archivo) onSubir(archivo, notas);
          }}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {ocupado ? "Subiendo…" : "Subir versión"}
        </button>
      </div>
    </details>
  );
}

function NuevaPlantilla({
  ocupado,
  onCrear,
}: {
  ocupado: boolean;
  onCrear: (nombre: string, tipo: string, archivo: File, notas: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<string>(TIPOS_PLANTILLA[0].id);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">+ Nueva plantilla</p>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre (ej. Contrato técnico de instalación)"
        className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
      />
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
      >
        {TIPOS_PLANTILLA.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <input
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        className="block w-full text-sm"
      />
      <input
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas (opcional)"
        className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => {
          const e = !nombre.trim() ? "Falta el nombre" : validarArchivo(archivo);
          setError(e);
          if (!e && archivo) onCrear(nombre, tipo, archivo, notas);
        }}
        className="rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {ocupado ? "Guardando…" : "Guardar plantilla"}
      </button>
    </div>
  );
}

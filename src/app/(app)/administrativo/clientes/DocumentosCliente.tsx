"use client";

import { AbrirArchivo } from "@/components/rrhh/archivos";
import { SubirDocumentos } from "@/components/documentos/SubirDocumentos";
import { NOMBRE_TIPO } from "@/lib/documentos/catalogo";
import { fechaCorta } from "@/lib/rrhh-registros";

export interface DocCargado {
  id: string;
  tipo: string;
  nombre: string;
  nombre_archivo: string;
  path: string;
  bytes: number;
  sha256: string;
  fecha_documento: string | null;
  origen: string;
  reservado?: boolean;
  subido_en: string;
}
export interface ObraConDocs {
  id: string;
  codigo: string | null;
  nombre: string;
  documentos: DocCargado[];
}

function Lista({ docs, bucket }: { docs: DocCargado[]; bucket: string }) {
  if (docs.length === 0) return <p className="text-sm text-slate-500">Nada cargado todavía.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {docs.map((d) => (
        <li key={d.id} className="flex items-start gap-2 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {NOMBRE_TIPO[d.tipo] ?? d.tipo}
              {d.reservado ? " · reservado" : ""}
              {d.origen !== "original" ? ` · ${d.origen}` : ""}
            </p>
            <p className="break-words font-medium text-slate-900">{d.nombre}</p>
            <p className="text-xs text-slate-500">
              {d.fecha_documento ? `${fechaCorta(d.fecha_documento)} · ` : ""}
              {(d.bytes / 1024).toFixed(0)} KB · cargado {fechaCorta(d.subido_en)}
            </p>
          </div>
          <AbrirArchivo bucket={bucket} path={d.path} className="min-h-11 shrink-0 rounded-md border border-slate-300 px-3 text-sm">
            Abrir
          </AbrirArchivo>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Documentos cargados" del cliente (pedido de Jhojan): los suyos (migración 101) y los de todas
 * sus obras (migración 90), leídos de donde viven; no es una copia. El RUT tiene su recuadro.
 */
export function DocumentosCliente({
  clienteId,
  propios,
  obras,
  sube,
  veSensibles,
  sinTabla,
}: {
  clienteId: string;
  propios: DocCargado[];
  obras: ObraConDocs[];
  sube: boolean;
  veSensibles: boolean;
  /** La migración 101 no está corrida: no hay dónde guardar los documentos del cliente. */
  sinTabla: boolean;
}) {
  const shas = [
    ...propios.map((d) => `cliente:${d.sha256}`),
    ...obras.flatMap((o) => o.documentos.map((d) => `obra:${o.id}:${d.sha256}`)),
  ];
  const total = propios.length + obras.reduce((a, o) => a + o.documentos.length, 0);
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="flex-1 text-sm font-bold text-slate-900">Documentos cargados</h2>
        <span className="text-xs text-slate-500">{total}</span>
      </div>
      {sube && !sinTabla && (
        <SubirDocumentos
          clienteId={clienteId}
          obras={obras.map((o) => ({ id: o.id, codigo: o.codigo, nombre: o.nombre }))}
          shasExistentes={shas}
          veSensibles={veSensibles}
        />
      )}
      {sinTabla && <p className="text-xs text-amber-900">Para subir documentos falta correr la migración 101.</p>}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Del cliente</h3>
        <Lista docs={propios} bucket="documentos-clientes" />
      </div>
      {obras.map((o) => (
        <details key={o.id} open={o.documentos.length > 0 && obras.length <= 3}>
          <summary className="min-h-11 cursor-pointer py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            Obra {o.codigo ?? ""} · {o.nombre} ({o.documentos.length})
          </summary>
          <Lista docs={o.documentos} bucket="documentos-proyectos" />
        </details>
      ))}
    </section>
  );
}

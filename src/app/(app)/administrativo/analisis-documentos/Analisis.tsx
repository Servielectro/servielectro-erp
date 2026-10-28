"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NOMBRE_TIPO } from "@/lib/documentos/catalogo";
import type { FilaComparacion, LecturaContrato } from "@/lib/documentos/lectura-contrato";
import { leerDocumento } from "./acciones";

export interface DocOpcion {
  id: string;
  proyecto_id: string;
  tipo: string;
  nombre: string;
  nombre_archivo: string;
  mime: string;
  fecha_documento: string | null;
  obra: string;
}
export interface LadoAnalisis {
  doc: DocOpcion;
  lectura: LecturaContrato | null;
  fuente: string | null;
  sinMigracion: boolean;
}

const CAMPO = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";

function Lado({ titulo, lado, puedeLeer }: { titulo: string; lado: LadoAnalisis | null; puedeLeer: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!lado) return null;
  return (
    <div className="space-y-1 rounded-md border border-slate-200 bg-white p-2 text-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="font-medium">{lado.doc.nombre}</p>
      <p className="text-xs text-slate-500">
        {NOMBRE_TIPO[lado.doc.tipo] ?? lado.doc.tipo} · {lado.doc.obra}
      </p>
      {lado.fuente && <p className="text-xs text-slate-600">{lado.fuente}</p>}
      {lado.sinMigracion && <p className="text-xs text-amber-900">Para leer documentos falta correr la migración 102.</p>}
      {(lado.lectura?.advertencias ?? []).map((x) => (
        <p key={x} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
          ⚠ {x}
        </p>
      ))}
      {puedeLeer && !lado.sinMigracion && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const r = await leerDocumento(lado.doc.id);
              if (!r.ok) setError(r.error);
              else router.refresh();
            })
          }
          className="min-h-11 w-full rounded-md border border-slate-400 px-3 text-sm font-semibold disabled:opacity-40"
        >
          {pendiente ? "Leyendo… (un escaneado largo tarda uno o dos minutos)" : lado.lectura ? "Leer otra vez con IA" : "Leer con IA"}
        </button>
      )}
      {error && <p className="text-xs text-red-800">{error}</p>}
    </div>
  );
}

export function Analisis({
  docs,
  parejas,
  a,
  b,
  filas,
  todos,
  puedeLeer,
}: {
  docs: DocOpcion[];
  parejas: { obra: string; a: string; b: string }[];
  a: LadoAnalisis | null;
  b: LadoAnalisis | null;
  filas: FilaComparacion[] | null;
  todos: boolean;
  puedeLeer: boolean;
}) {
  const router = useRouter();
  const ir = (x: string | undefined, y: string | undefined, t = todos) => {
    const q = new URLSearchParams();
    if (x) q.set("a", x);
    if (y) q.set("b", y);
    if (t) q.set("todos", "1");
    router.push(`/administrativo/analisis-documentos?${q.toString()}`);
  };
  const opciones = (
    <>
      <option value="">Elige un documento…</option>
      {docs.map((d) => (
        <option key={d.id} value={d.id}>
          {d.obra} · {NOMBRE_TIPO[d.tipo] ?? d.tipo} · {d.nombre}
        </option>
      ))}
    </>
  );
  const cambios = filas?.filter((f) => f.distinto).length ?? 0;

  return (
    <div className="space-y-4">
      {parejas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {parejas.map((p) => (
            <Link
              key={p.a}
              href={`/administrativo/analisis-documentos?a=${p.a}&b=${p.b}`}
              className="flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-3 text-sm font-medium"
            >
              Enviado vs firmado · {p.obra}
            </Link>
          ))}
        </div>
      )}
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Lo que se envió
            <select value={a?.doc.id ?? ""} onChange={(e) => ir(e.target.value || undefined, b?.doc.id)} className={CAMPO}>
              {opciones}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Lo que se firmó (o la versión nueva)
            <select value={b?.doc.id ?? ""} onChange={(e) => ir(a?.doc.id, e.target.value || undefined)} className={CAMPO}>
              {opciones}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={todos} onChange={(e) => ir(a?.doc.id, b?.doc.id, e.target.checked)} />
          Mostrar todos los documentos de obra (no solo contratos)
        </label>
        {docs.length === 0 && <p className="text-sm text-slate-500">No hay documentos cargados que puedas ver. Se cargan desde la ficha del cliente → Documentos cargados.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Lado titulo="Enviado" lado={a} puedeLeer={puedeLeer} />
          <Lado titulo="Firmado" lado={b} puedeLeer={puedeLeer} />
        </div>
      </section>

      {a && b && !filas && <p className="text-sm text-slate-600">Para comparar, los dos documentos tienen que estar leídos (botón “Leer con IA” en cada uno).</p>}

      {filas && (
        <section className="space-y-2">
          <p className={`rounded-md px-3 py-2 text-sm font-semibold ${cambios ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
            {cambios ? `${cambios} diferencia${cambios === 1 ? "" : "s"} entre lo enviado y lo firmado.` : "No encontré diferencias en estos campos."}
          </p>
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {filas.map((f) => (
              <div key={f.campo} className={`grid gap-2 p-3 text-sm sm:grid-cols-[12rem_1fr_1fr] ${f.distinto ? "bg-red-50" : ""}`}>
                <p className={`font-semibold ${f.distinto ? "text-red-800" : "text-slate-800"}`}>
                  {f.distinto ? "⚠ " : ""}
                  {f.campo}
                </p>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 sm:hidden">Enviado</p>
                  {f.a.map((x, i) => (
                    <p key={i}>{x}</p>
                  ))}
                  {f.citaA && <p className="mt-1 text-xs text-slate-500">{f.citaA}</p>}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 sm:hidden">Firmado</p>
                  {f.b.map((x, i) => (
                    <p key={i} className={f.distinto ? "font-medium text-red-900" : ""}>
                      {x}
                    </p>
                  ))}
                  {f.citaB && <p className="mt-1 text-xs text-slate-500">{f.citaB}</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Lo leído por la IA es una ayuda: antes de actuar, mira la cita en el documento. Las actas salen solo del contrato confirmado.
          </p>
        </section>
      )}
    </div>
  );
}

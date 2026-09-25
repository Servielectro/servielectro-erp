"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  exportarBaseDatos,
  importarBaseDatos,
} from "@/app/cotizaciones/backup-actions";

export function MenuPrincipal({ onCerrar }: { onCerrar: () => void }) {
  const [seccionAbierta, setSeccionAbierta] = useState<"basedatos" | null>(
    null,
  );
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  async function exportar() {
    setExportando(true);
    setMensaje(null);
    const res = await exportarBaseDatos();
    setExportando(false);

    if (!res.ok || !res.tablas) {
      setMensaje(`No se pudo exportar: ${res.error}`);
      return;
    }

    const blob = new Blob(
      [
        JSON.stringify(
          { generadoEn: res.generadoEn, tablas: res.tablas },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fecha = (res.generadoEn ?? new Date().toISOString()).slice(0, 10);
    a.href = url;
    a.download = `servielectro-erp-backup-${fecha}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMensaje("Copia descargada. Guardala en un lugar seguro (Drive, correo, etc.).");
  }

  async function importar(archivo: File) {
    setImportando(true);
    setMensaje(null);
    const contenido = await archivo.text();
    const res = await importarBaseDatos(contenido);
    setImportando(false);

    if (!res.ok) {
      setMensaje(`No se pudo importar: ${res.error}`);
      return;
    }

    const total = Object.values(res.insertados ?? {}).reduce(
      (a, b) => a + b,
      0,
    );
    setMensaje(
      total > 0
        ? `Se agregaron ${total} registro(s) que no existían. Nada de lo que ya tenías se tocó.`
        : "No había nada nuevo para agregar — todo lo del archivo ya estaba en la base.",
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-slate-900/40"
        onClick={onCerrar}
        aria-hidden="true"
      />
      <div className="flex h-full w-full max-w-xs flex-col overflow-y-auto bg-white p-4 shadow-xl sm:max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Menú</h2>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md p-1 text-slate-600"
          >
            ✕
          </button>
        </div>

        <nav className="space-y-1 text-sm">
          <Link
            href="/"
            className="block rounded-md px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Inicio
          </Link>
          <Link
            href="/cotizaciones"
            className="block rounded-md px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Cotizaciones
          </Link>
          <Link
            href="/catalogo"
            className="block rounded-md px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Catálogo
          </Link>
        </nav>

        <button
          type="button"
          onClick={() =>
            setSeccionAbierta((v) => (v === "basedatos" ? null : "basedatos"))
          }
          className="mt-4 flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Base de datos
          <span>{seccionAbierta === "basedatos" ? "▾" : "▸"}</span>
        </button>

        {seccionAbierta === "basedatos" && (
          <div className="space-y-3 rounded-md bg-slate-50 p-3 text-sm">
            <div>
              <button
                type="button"
                onClick={exportar}
                disabled={exportando}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60"
              >
                {exportando ? "Generando…" : "⬇ Exportar copia"}
              </button>
              <p className="mt-1 text-xs text-slate-600">
                Descarga un archivo con todo lo cargado hoy (clientes,
                cotizaciones, catálogo). Guardalo aparte.
              </p>
            </div>

            <div>
              <button
                type="button"
                onClick={() => inputArchivoRef.current?.click()}
                disabled={importando}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60"
              >
                {importando ? "Importando…" : "⬆ Importar copia"}
              </button>
              <input
                ref={inputArchivoRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  if (archivo) importar(archivo);
                  e.target.value = "";
                }}
              />
              <p className="mt-1 text-xs text-slate-600">
                Solo agrega lo que falte de un archivo exportado antes —
                nunca borra ni pisa lo que ya está cargado.
              </p>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-xs font-medium text-amber-900">
                No hay &quot;restaurar a una fecha&quot;
              </p>
              <p className="mt-1 text-xs text-amber-800">
                El plan actual de Supabase (gratuito) no guarda copias
                automáticas del pasado — eso recién existe desde el plan Pro
                en adelante, y con precisión de segundos (PITR) es un
                adicional pago aparte, no algo incluido. Por ahora la única
                red de seguridad real es exportar seguido y guardar los
                archivos. Si en algún momento se necesita de verdad volver a
                un día anterior, hay que evaluar subir de plan.
              </p>
            </div>

            {mensaje && (
              <p className="rounded-md bg-white px-2.5 py-2 text-xs text-slate-700">
                {mensaje}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

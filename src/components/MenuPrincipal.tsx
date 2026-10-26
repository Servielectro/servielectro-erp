"use client";

import { Fragment, useRef, useState } from "react";
import { seccionesMenu } from "@/lib/menu";
import { VentanaBuscador } from "@/components/BuscadorSecciones";
import Link from "next/link";
import {
  aplicarContenido,
  exportarBaseDatos,
  listarRespaldos,
  obtenerContenidoRespaldo,
  previsualizarContenido,
  type PrevisualizacionTabla,
  type RespaldoListado,
} from "@/app/(app)/comercial/cotizaciones/backup-actions";

type VistaBaseDatos = "inicio" | "lista" | "previsualizacion";

export interface AccesosMenu {
  // Ids de módulo con algún permiso (de fn_mis_permisos). Ocultar es comodidad: las
  // rutas igual se protegen en el servidor.
  modulos: string[];
  baseDatos: boolean;
  /** tecnico/trabajar o más: lo que exige /tecnico. */
  campoTecnico: boolean;
  /** planificacion/trabajar: lo que exige /planificacion (Administrador, Coordinador; no el técnico). */
  planificacion: boolean;
  /** configuracion/responsable: grupos y transferir tareas. */
  configResponsable: boolean;
  /** administrativo/trabajar: importar clientes de SIIGO (lo que exige esa pantalla). */
  administrativoTrabajar: boolean;
}

export function MenuPrincipal({
  onCerrar,
  accesos,
  abrirEn,
}: {
  onCerrar: () => void;
  accesos: AccesosMenu;
  /** En pantalla ancha (sin hamburguesa) se abre directo en "Base de datos". */
  abrirEn?: "basedatos";
}) {
  const [seccionAbierta, setSeccionAbierta] = useState<"basedatos" | null>(abrirEn ?? null);
  const [buscando, setBuscando] = useState(false);
  const [vista, setVista] = useState<VistaBaseDatos>("inicio");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [respaldos, setRespaldos] = useState<RespaldoListado[] | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<{
    origenNombre: string;
    contenido: string;
    tablas: PrevisualizacionTabla[];
  } | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  function reset() {
    setVista("inicio");
    setPrevisualizacion(null);
    setError(null);
  }

  async function exportar() {
    setCargando(true);
    setError(null);
    setMensaje(null);
    const res = await exportarBaseDatos();
    setCargando(false);

    if (!res.ok || !res.tablas) {
      setError(`No se pudo exportar: ${res.error}`);
      return;
    }

    const blob = new Blob(
      [JSON.stringify({ generadoEn: res.generadoEn, tablas: res.tablas }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.nombreArchivo ?? "servielectro-erp-backup.json";
    a.click();
    URL.revokeObjectURL(url);

    setMensaje(
      res.error
        ? res.error
        : `Descargado y guardado en el servidor como "${res.nombreArchivo}". Ya aparece en "Restaurar".`,
    );
  }

  async function elegirArchivo(archivo: File) {
    setCargando(true);
    setError(null);
    setMensaje(null);
    const contenido = await archivo.text();
    const res = await previsualizarContenido(contenido);
    setCargando(false);

    if (!res.ok || !res.tablas) {
      setError(`No se pudo leer el archivo: ${res.error}`);
      return;
    }

    setPrevisualizacion({
      origenNombre: archivo.name,
      contenido,
      tablas: res.tablas,
    });
    setVista("previsualizacion");
  }

  async function abrirListaRespaldos() {
    setCargando(true);
    setError(null);
    setMensaje(null);
    const res = await listarRespaldos();
    setCargando(false);

    if (!res.ok) {
      setError(`No se pudo listar los respaldos: ${res.error}`);
      return;
    }
    setRespaldos(res.respaldos ?? []);
    setVista("lista");
  }

  async function elegirRespaldo(nombre: string) {
    setCargando(true);
    setError(null);
    const contenido = await obtenerContenidoRespaldo(nombre);
    if (!contenido.ok || !contenido.contenido) {
      setCargando(false);
      setError(`No se pudo leer ese respaldo: ${contenido.error}`);
      return;
    }
    const res = await previsualizarContenido(contenido.contenido);
    setCargando(false);

    if (!res.ok || !res.tablas) {
      setError(`No se pudo leer ese respaldo: ${res.error}`);
      return;
    }

    setPrevisualizacion({
      origenNombre: nombre,
      contenido: contenido.contenido,
      tablas: res.tablas,
    });
    setVista("previsualizacion");
  }

  async function confirmarAplicar() {
    if (!previsualizacion) return;
    setCargando(true);
    setError(null);
    const res = await aplicarContenido(previsualizacion.contenido);
    setCargando(false);

    if (!res.ok) {
      setError(`No se pudo aplicar: ${res.error}`);
      return;
    }

    const total = Object.values(res.resultados ?? {}).reduce((a, b) => a + b, 0);
    setMensaje(`Listo — ${total} fila(s) actualizadas o agregadas desde "${previsualizacion.origenNombre}".`);
    reset();
  }

  const totalExistentes =
    previsualizacion?.tablas.reduce((a, t) => a + t.existentes, 0) ?? 0;
  const totalNuevos =
    previsualizacion?.tablas.reduce((a, t) => a + t.nuevos, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onCerrar} aria-hidden="true" />
      <div className="flex h-full w-full max-w-xs flex-col overflow-y-auto bg-white p-4 shadow-xl sm:max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Menú</h2>
          <button type="button" onClick={onCerrar} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-1 text-slate-600">
            ✕
          </button>
        </div>
        {/* El mismo buscador de la barra, para no tener que recorrer la lista con el dedo. */}
        <button
          type="button"
          onClick={() => setBuscando(true)}
          className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-lg border border-slate-300 px-3 text-left text-sm text-slate-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-3.5-3.5" />
          </svg>
          Buscar una sección…
        </button>
        {buscando && (
          <VentanaBuscador
            secciones={seccionesMenu(accesos)}
            onCerrar={() => setBuscando(false)}
            alElegir={onCerrar}
          />
        )}

        {/* Cualquier opción elegida cierra el menú (el nav solo contiene enlaces). */}
        <nav className="space-y-1 text-sm" onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) onCerrar();
        }}>
          <Link href="/" className="flex min-h-11 items-center rounded-md px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">
            Inicio (módulos)
          </Link>
          {/* La misma lista que la barra de pantalla ancha (src/lib/menu.ts). */}
          {seccionesMenu(accesos).map((sec) => (
            <Fragment key={sec.id}>
              <Link href={sec.href} className="flex min-h-11 items-center rounded-md px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">
                {sec.nombreLargo ?? sec.nombre}
                {sec.nota && <span className="ml-1 text-xs font-normal text-amber-700">({sec.nota})</span>}
              </Link>
              {sec.hijos.map((h) => (
                <Link
                  key={h.href}
                  href={h.href}
                  className={
                    h.nivel === 2
                      ? "flex min-h-11 items-center rounded-md py-1.5 pl-10 text-xs text-slate-500 hover:bg-slate-50"
                      : "flex min-h-11 items-center rounded-md py-2 pl-6 text-sm text-slate-600 hover:bg-slate-50"
                  }
                >
                  {h.nombre}
                </Link>
              ))}
            </Fragment>
          ))}
        </nav>

        {accesos.baseDatos && (
        <button
          type="button"
          onClick={() => {
            setSeccionAbierta((v) => (v === "basedatos" ? null : "basedatos"));
            reset();
            setMensaje(null);
          }}
          className="min-h-11 mt-4 flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Base de datos
          <span>{seccionAbierta === "basedatos" ? "▾" : "▸"}</span>
        </button>
        )}

        {seccionAbierta === "basedatos" && (
          <div className="space-y-3 rounded-md bg-slate-50 p-3 text-sm">
            {vista === "inicio" && (
              <>
                <div>
                  <button
                    type="button"
                    onClick={exportar}
                    disabled={cargando}
                    className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60"
                  >
                    {cargando ? "Generando…" : "⬇ Exportar copia"}
                  </button>
                  <p className="mt-1 text-xs text-slate-600">
                    Descarga un archivo con fecha y hora, y guarda la misma
                    copia en el servidor para poder restaurarla después.
                  </p>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => inputArchivoRef.current?.click()}
                    disabled={cargando}
                    className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60"
                  >
                    ⬆ Importar archivo
                  </button>
                  <input
                    ref={inputArchivoRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const archivo = e.target.files?.[0];
                      if (archivo) elegirArchivo(archivo);
                      e.target.value = "";
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-600">
                    Cargar un archivo exportado antes. Te muestra qué va a
                    cambiar antes de tocar nada.
                  </p>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={abrirListaRespaldos}
                    disabled={cargando}
                    className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60"
                  >
                    {cargando ? "Buscando…" : "↺ Restaurar"}
                  </button>
                  <p className="mt-1 text-xs text-slate-600">
                    Elegir uno de los puntos que ya exportaste. No hay
                    calendario: solo se puede volver a un punto real.
                  </p>
                </div>

                <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-xs font-medium text-amber-900">
                    Estos son los respaldos que vos generaste
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Supabase no guarda copias automáticas en el plan actual
                    (Free) — eso recién existe desde el plan Pro en adelante.
                    Si nunca tocás &quot;Exportar copia&quot;, no hay a dónde
                    volver: esta lista está vacía hasta que generés al menos
                    un respaldo.
                  </p>
                </div>
              </>
            )}

            {vista === "lista" && (
              <>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex min-h-11 items-center text-xs font-medium text-slate-600"
                >
                  ← Volver
                </button>
                {respaldos && respaldos.length === 0 && (
                  <p className="text-xs text-slate-600">
                    Todavía no generaste ningún respaldo. Tocá &quot;Exportar
                    copia&quot; primero.
                  </p>
                )}
                <div className="space-y-1.5">
                  {respaldos?.map((r) => (
                    <button
                      key={r.nombre}
                      type="button"
                      onClick={() => elegirRespaldo(r.nombre)}
                      disabled={cargando}
                      className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs disabled:opacity-60"
                    >
                      <span className="block font-medium text-slate-800">
                        {r.creadoEn
                          ? new Date(r.creadoEn).toLocaleString("es-CO")
                          : r.nombre}
                      </span>
                      <span className="text-slate-500">{r.nombre}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {vista === "previsualizacion" && previsualizacion && (
              <>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex min-h-11 items-center text-xs font-medium text-slate-600"
                >
                  ← Cancelar
                </button>

                <p className="text-xs text-slate-700">
                  Contenido de{" "}
                  <span className="font-medium">
                    {previsualizacion.origenNombre}
                  </span>
                  :
                </p>

                <div className="space-y-1 rounded-md border border-slate-200 bg-white p-2">
                  {previsualizacion.tablas.map((t) => (
                    <div
                      key={t.tabla}
                      className="flex justify-between text-xs text-slate-700"
                    >
                      <span>{t.tabla}</span>
                      <span>
                        {t.nuevos > 0 && (
                          <span className="text-green-700">
                            +{t.nuevos} nuevos
                          </span>
                        )}
                        {t.nuevos > 0 && t.existentes > 0 && " · "}
                        {t.existentes > 0 && (
                          <span className="text-amber-700">
                            {t.existentes} se reemplazan
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  {previsualizacion.tablas.length === 0 && (
                    <p className="text-xs text-slate-500">
                      El archivo no trae datos en ninguna tabla conocida.
                    </p>
                  )}
                </div>

                {totalExistentes > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-2.5">
                    <p className="text-xs font-medium text-red-900">
                      Esto va a reemplazar {totalExistentes} registro(s) que
                      ya existen (quedan como están en el archivo, se pierde
                      lo que tengan hoy) y agregar {totalNuevos} nuevo(s).
                    </p>
                  </div>
                )}

                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <p className="text-xs text-slate-700">
                    ¿Ya tenés un respaldo de ahora mismo, por si necesitás
                    volver? Si no, exportá antes de continuar.
                  </p>
                  <button
                    type="button"
                    onClick={exportar}
                    disabled={cargando}
                    className="inline-flex min-h-11 items-center mt-1.5 text-xs font-medium text-slate-900 underline disabled:opacity-60"
                  >
                    Exportar copia de ahora
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={cargando}
                    className="min-h-11 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmarAplicar}
                    disabled={cargando}
                    className="min-h-11 flex-1 rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {cargando ? "Aplicando…" : "Confirmar y aplicar"}
                  </button>
                </div>
              </>
            )}

            {error && (
              <p className="rounded-md bg-red-50 px-2.5 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
            {mensaje && (
              <p className="rounded-md bg-green-50 px-2.5 py-2 text-xs text-green-700">
                {mensaje}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Cola de envío del técnico: sube lo guardado en el celular cuando hay señal.
//
// Reglas (las que deciden si sirve en un sótano):
//   - Nada local se borra hasta que el servidor confirmó. Si se corta a la mitad, la
//     próxima vuelta sigue donde quedó.
//   - Los ids los generó el celular: reintentar no duplica (insert … on conflict).
//   - Orden por visita: estado → jornadas → sugerencias → fotos → firma del técnico →
//     firma del cliente. La del cliente va ÚLTIMA y solo cuando no queda nada más de esa
//     visita: al llegar, la base cierra la visita y ya no acepta nada.
//   - Sin red: se corta la vuelta y se reintenta después (al volver la señal, al abrir
//     la app o con el botón).
//   - Error PERMANENTE (visita ya firmada, sin permiso, dato inválido): reintentar no lo
//     arregla. Se marca, deja de reintentarse solo, NO se borra del celular y el técnico
//     ve en palabras qué pasó. Se reintenta a mano cuando la oficina lo resuelve.
//   - Cualquier otro error del servidor (caído, sesión vencida): se anota y se reintenta.

import type { SstArchivoLocal, SstFirmaLocal, SstFormatoLocal, SstReporteFotoLocal, SstReporteLocal } from "@/lib/sst/local";
import {
  borrar,
  deVisita,
  guardar,
  leer,
  todos,
  type EnvioPendiente,
  type FirmaLocal,
  type FotoLocal,
  type JornadaLocal,
  type SugerenciaLocal,
  type TareaLocal,
  type VisitaLocal,
} from "./db";

/** Lo que la cola necesita del servidor. En producción es Supabase; en la prueba sin red, un falso. */
export interface Servidor {
  actualizarEstadoVisita(id: string, estado: string): Promise<void>;
  /** Mis tareas: el técnico solo cambia el estado (la base exige dependencias y permisos). */
  actualizarEstadoTarea(id: string, estado: string): Promise<void>;
  guardarJornada(j: JornadaLocal): Promise<void>;
  guardarSugerencia(s: SugerenciaLocal): Promise<void>;
  /** Sube el archivo; si ya estaba (reintento), no es error. */
  subirArchivo(ruta: string, blob: Blob, tipo: string): Promise<void>;
  registrarFoto(f: FotoLocal, ruta: string): Promise<void>;
  registrarFirma(f: FirmaLocal, ruta: string): Promise<void>;
  // SG-SST: todo a la carpeta del bucket sgsst; la base sella y valida.
  subirArchivoSst(ruta: string, blob: Blob, tipo: string): Promise<void>;
  guardarFormatoSst(f: SstFormatoLocal): Promise<void>;
  registrarArchivoSst(a: SstArchivoLocal, ruta: string): Promise<void>;
  registrarFirmaSst(f: SstFirmaLocal, ruta: string): Promise<void>;
  cerrarFormatoSst(formatoId: string): Promise<void>;
  guardarReporteSst(r: SstReporteLocal): Promise<void>;
  registrarFotoReporteSst(f: SstReporteFotoLocal, ruta: string): Promise<void>;
}

/** Error de red (sin señal): corta la vuelta entera. */
export class SinConexionError extends Error {}

/** El servidor rechazó el dato y reintentar no lo arregla. El mensaje es para el técnico. */
export class ErrorPermanente extends Error {}

export function esErrorDeRed(e: unknown): boolean {
  if (e instanceof SinConexionError) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|timeout|abort/i.test(msg);
}

export const rutaFoto = (f: { visitaId: string; id: string }) => `${f.visitaId}/${f.id}.jpg`;
export const rutaFirma = (f: { visitaId: string; tipo: string }) => `${f.visitaId}/firma-${f.tipo}.png`;
export const rutaArchivoSst = (a: { formatoId: string; campoId: string; id: string; mime: string }) =>
  `formatos/${a.formatoId}/${a.campoId}-${a.id}.${a.mime === "image/png" ? "png" : "jpg"}`;
export const rutaFirmaSst = (f: { formatoId: string; id: string }) => `formatos/${f.formatoId}/firma-${f.id}.png`;
export const rutaFotoReporte = (f: { reporteId: string; id: string }) => `reportes/${f.reporteId}/${f.id}.jpg`;

const PRIORIDAD: Record<EnvioPendiente["tipo"], number> = {
  estado_visita: 0,
  estado_tarea: 0,
  jornada: 1,
  sugerencia: 2,
  foto: 3,
  firma: 4,
  sst_formato: 1,
  sst_reporte: 1,
  sst_archivo: 3,
  sst_reporte_foto: 3,
  sst_firma: 4,
  sst_cerrar: 5,
};

/**
 * SG-SST: la primera firma SELLA el formato en la base. Por eso una firma no sube mientras falte
 * el contenido o una foto de ese formato, y el cierre va solo cuando ya no queda nada de él. La
 * foto de un reporte espera a que suba el reporte.
 */
const ESPERA_A: Partial<Record<EnvioPendiente["tipo"], EnvioPendiente["tipo"][] | "todo">> = {
  sst_firma: ["sst_formato", "sst_archivo"],
  sst_cerrar: "todo",
  sst_reporte_foto: ["sst_reporte"],
};

export interface ResultadoSync {
  subidos: number;
  /** Lo que falta subir y se va a reintentar solo (sin contar los rechazados). */
  pendientes: number;
  /** Errores que se reintentan (servidor caído, sesión vencida). */
  conErrores: number;
  /** Rechazados de forma permanente: esperan a la oficina. */
  rechazados: number;
  sinConexion: boolean;
}

let enCurso: Promise<ResultadoSync> | null = null;

/** Una vuelta de la cola. Si ya hay una corriendo, devuelve esa (no se pisan). */
export function sincronizar(servidor: Servidor): Promise<ResultadoSync> {
  if (!enCurso) {
    enCurso = vuelta(servidor).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function vuelta(servidor: Servidor): Promise<ResultadoSync> {
  let subidos = 0;
  let sinConexion = false;
  const cola = await todos<EnvioPendiente>("cola");

  // Firma del cliente al final y técnico antes que cliente.
  const firmas = new Map<string, FirmaLocal>();
  for (const e of cola.filter((c) => c.tipo === "firma")) {
    const f = await leer<FirmaLocal>("firmas", e.id);
    if (f) firmas.set(e.id, f);
  }
  const orden = (e: EnvioPendiente) =>
    PRIORIDAD[e.tipo] * 10 + (e.tipo === "firma" && firmas.get(e.id)?.tipo === "cliente" ? 1 : 0);
  cola.sort((a, b) => orden(a) - orden(b) || a.creadoEn.localeCompare(b.creadoEn));

  for (const envio of cola) {
    // Rechazado de forma permanente: no se reintenta solo (ver reintentarRechazados).
    if (envio.permanente) continue;
    try {
      const espera = ESPERA_A[envio.tipo];
      if (espera) {
        const resto = (await todos<EnvioPendiente>("cola")).filter(
          (c) => c.visitaId === envio.visitaId && c.id !== envio.id && (espera === "todo" || espera.includes(c.tipo)),
        );
        if (resto.length > 0) continue;
      }
      if (envio.tipo === "firma" && firmas.get(envio.id)?.tipo === "cliente") {
        // Solo cuando no queda nada más de esa visita en la cola.
        const resto = (await todos<EnvioPendiente>("cola")).filter(
          (c) => c.visitaId === envio.visitaId && c.id !== envio.id,
        );
        if (resto.length > 0) continue;
      }
      await enviarUno(servidor, envio);
      await borrar("cola", envio.id);
      subidos++;
    } catch (e) {
      if (esErrorDeRed(e)) {
        sinConexion = true;
        break;
      }
      await guardar("cola", {
        ...envio,
        intentos: envio.intentos + 1,
        ultimoError: e instanceof Error ? e.message : String(e),
        permanente: e instanceof ErrorPermanente,
      } satisfies EnvioPendiente);
    }
  }

  const restantes = await todos<EnvioPendiente>("cola");
  return {
    subidos,
    pendientes: restantes.filter((r) => !r.permanente).length,
    conErrores: restantes.filter((r) => r.ultimoError && !r.permanente).length,
    rechazados: restantes.filter((r) => r.permanente).length,
    sinConexion,
  };
}

/**
 * Vuelve a intentar los rechazados (cuando la oficina ya resolvió lo que los frenaba,
 * p. ej. reasignó la visita). Solo les saca la marca: los sube la próxima vuelta.
 */
export async function reintentarRechazados(): Promise<number> {
  const rechazados = (await todos<EnvioPendiente>("cola")).filter((c) => c.permanente);
  for (const c of rechazados) {
    await guardar("cola", { ...c, permanente: false, intentos: 0, ultimoError: null } satisfies EnvioPendiente);
  }
  return rechazados.length;
}

async function enviarUno(servidor: Servidor, envio: EnvioPendiente) {
  switch (envio.tipo) {
    case "estado_visita": {
      const v = await leer<VisitaLocal>("visitas", envio.visitaId);
      if (!v) return;
      await servidor.actualizarEstadoVisita(v.id, v.estado);
      await guardar("visitas", { ...v, estadoPendiente: false });
      return;
    }
    case "estado_tarea": {
      const t = await leer<TareaLocal>("tareas", envio.id);
      if (!t) return;
      await servidor.actualizarEstadoTarea(t.id, t.estado);
      await guardar("tareas", { ...t, estadoPendiente: false });
      return;
    }
    case "jornada": {
      const j = await leer<JornadaLocal>("jornadas", envio.id);
      if (j) await servidor.guardarJornada(j);
      return;
    }
    case "sugerencia": {
      const s = await leer<SugerenciaLocal>("sugerencias", envio.id);
      if (s) await servidor.guardarSugerencia(s);
      return;
    }
    case "foto": {
      const f = await leer<FotoLocal>("fotos", envio.id);
      if (!f || !f.blob) return;
      const ruta = rutaFoto(f);
      await servidor.subirArchivo(ruta, f.blob, "image/jpeg");
      await servidor.registrarFoto(f, ruta);
      // Confirmada: se libera el espacio del celular (queda el registro, sin la imagen).
      await guardar("fotos", { ...f, blob: null, subida: true });
      return;
    }
    case "firma": {
      const f = await leer<FirmaLocal>("firmas", envio.id);
      if (!f || !f.blob) return;
      const ruta = rutaFirma(f);
      await servidor.subirArchivo(ruta, f.blob, "image/png");
      await servidor.registrarFirma(f, ruta);
      await guardar("firmas", { ...f, blob: null, subida: true });
      return;
    }
    case "sst_formato": {
      const f = await leer<SstFormatoLocal>("sst_formatos", envio.id);
      if (f) await servidor.guardarFormatoSst(f);
      return;
    }
    case "sst_archivo": {
      const a = await leer<SstArchivoLocal>("sst_archivos", envio.id);
      if (!a || !a.blob) return;
      const ruta = rutaArchivoSst(a);
      await servidor.subirArchivoSst(ruta, a.blob, a.mime);
      await servidor.registrarArchivoSst(a, ruta);
      await guardar("sst_archivos", { ...a, blob: null, subida: true });
      return;
    }
    case "sst_firma": {
      const f = await leer<SstFirmaLocal>("sst_firmas", envio.id);
      if (!f || !f.blob) return;
      const ruta = rutaFirmaSst(f);
      await servidor.subirArchivoSst(ruta, f.blob, "image/png");
      await servidor.registrarFirmaSst(f, ruta);
      await guardar("sst_firmas", { ...f, blob: null, subida: true });
      return;
    }
    case "sst_cerrar": {
      await servidor.cerrarFormatoSst(envio.visitaId);
      return;
    }
    case "sst_reporte": {
      const r = await leer<SstReporteLocal>("sst_reportes", envio.id);
      if (!r) return;
      await servidor.guardarReporteSst(r);
      await guardar("sst_reportes", { ...r, subido: true });
      return;
    }
    case "sst_reporte_foto": {
      const f = await leer<SstReporteFotoLocal>("sst_reporte_fotos", envio.id);
      if (!f || !f.blob) return;
      const ruta = rutaFotoReporte(f);
      await servidor.subirArchivoSst(ruta, f.blob, "image/jpeg");
      await servidor.registrarFotoReporteSst(f, ruta);
      await guardar("sst_reporte_fotos", { ...f, blob: null, subida: true });
      return;
    }
  }
}

export async function pendientesDeVisita(visitaId: string): Promise<number> {
  return (await deVisita<EnvioPendiente>("cola", visitaId)).length;
}

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
//     la app o con el botón). Error del servidor (permiso, dato inválido): se anota en
//     esa entrada y se sigue con las demás.

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
  type VisitaLocal,
} from "./db";

/** Lo que la cola necesita del servidor. En producción es Supabase; en la prueba sin red, un falso. */
export interface Servidor {
  actualizarEstadoVisita(id: string, estado: string): Promise<void>;
  guardarJornada(j: JornadaLocal): Promise<void>;
  guardarSugerencia(s: SugerenciaLocal): Promise<void>;
  /** Sube el archivo; si ya estaba (reintento), no es error. */
  subirArchivo(ruta: string, blob: Blob, tipo: string): Promise<void>;
  registrarFoto(f: FotoLocal, ruta: string): Promise<void>;
  registrarFirma(f: FirmaLocal, ruta: string): Promise<void>;
}

/** Error de red (sin señal): corta la vuelta entera. Cualquier otro error es del dato. */
export class SinConexionError extends Error {}

export function esErrorDeRed(e: unknown): boolean {
  if (e instanceof SinConexionError) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|timeout|abort/i.test(msg);
}

export const rutaFoto = (f: { visitaId: string; id: string }) => `${f.visitaId}/${f.id}.jpg`;
export const rutaFirma = (f: { visitaId: string; tipo: string }) => `${f.visitaId}/firma-${f.tipo}.png`;

const PRIORIDAD: Record<EnvioPendiente["tipo"], number> = {
  estado_visita: 0,
  jornada: 1,
  sugerencia: 2,
  foto: 3,
  firma: 4,
};

export interface ResultadoSync {
  subidos: number;
  pendientes: number;
  conErrores: number;
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
    try {
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
      } satisfies EnvioPendiente);
    }
  }

  const restantes = await todos<EnvioPendiente>("cola");
  return {
    subidos,
    pendientes: restantes.length,
    conErrores: restantes.filter((r) => r.ultimoError).length,
    sinConexion,
  };
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
  }
}

export async function pendientesDeVisita(visitaId: string): Promise<number> {
  return (await deVisita<EnvioPendiente>("cola", visitaId)).length;
}

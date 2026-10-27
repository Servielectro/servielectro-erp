// Base local del celular del técnico (IndexedDB). Todo lo que el técnico registra se
// guarda PRIMERO acá y después sube por la cola (sync.ts). Sin señal, nada se pierde:
// lo que está acá solo se borra cuando el servidor confirmó que lo tiene.
//
// Sin librerías: IndexedDB envuelto en promesas, lo justo para este módulo.

export type GpsEstado = "concedido" | "denegado" | "sin_senal" | "no_disponible";

export interface VisitaLocal {
  id: string;
  titulo: string;
  descripcionTrabajo: string | null;
  direccion: string | null;
  clienteNombre: string | null;
  contactoSitio: string | null;
  telefonoSitio: string | null;
  tipo: "visita" | "obra";
  estado: string;
  fechaProgramada: string | null;
  fechaFinEstimada: string | null;
  /** Mínimo de fotos por día que fijó quien asignó la visita (null = sin mínimo). */
  fotosMinimasDia?: number | null;
  /** true si el técnico la marcó en curso y todavía no subió el cambio */
  estadoPendiente?: boolean;
}

export interface Ubicacion {
  estado: GpsEstado;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
}

export interface JornadaLocal {
  id: string;
  visitaId: string;
  fecha: string; // YYYY-MM-DD de Bogotá
  checkInEn: string | null;
  checkIn: Ubicacion | null;
  checkOutEn: string | null;
  checkOut: Ubicacion | null;
  laborEjecutada: string;
  noEjecutado: string;
  pendiente: string;
  observaciones: string;
  /** Al salir: "4 de 10 · 2 antes, 2 durante, 0 después". */
  fotosAlSalir?: string | null;
  /** Si salió con la evidencia incompleta, por qué (null = completa). */
  motivoFotosIncompletas?: string | null;
}

export interface FotoLocal {
  id: string;
  visitaId: string;
  jornadaId: string | null;
  momento?: "antes" | "durante" | "despues" | null;
  /** YA comprimida (~200 KB): el original nunca se guarda. null cuando ya subió. */
  blob: Blob | null;
  subida?: boolean;
  tomadaEn: string;
  bytes: number;
  sha256: string;
}

export interface SugerenciaLocal {
  id: string;
  visitaId: string;
  jornadaId: string | null;
  descripcion: string;
  cantidad: number | null;
  unidad: string;
  motivo: string;
  /** Para cuándo hace falta (YYYY-MM-DD). Se pide en obras; null en visitas de un día. */
  requeridoPara?: string | null;
  sugeridaEn: string;
}

export interface FirmaLocal {
  id: string;
  visitaId: string;
  tipo: "tecnico" | "cliente";
  nombre: string;
  cedula: string;
  cargo: string;
  /** PNG de la firma. null cuando ya subió. */
  blob: Blob | null;
  subida?: boolean;
  firmadaEn: string;
  ubicacion: Ubicacion;
  hashContenido: string;
}

/**
 * Tarea de obra asignada al técnico (la crea Operativo; el técnico NO tiene agenda propia:
 * su agendamiento es esto y sus visitas). En campo solo la mueve de estado.
 */
export interface TareaLocal {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: "por_hacer" | "en_progreso" | "hecho";
  prioridad: "baja" | "media" | "alta" | "urgente";
  fechaLimite: string | null;
  fechaProgramada: string | null;
  visitaId: string | null;
  /** true si el técnico la movió sin señal y todavía no subió el cambio */
  estadoPendiente?: boolean;
}

/** Una entrada de la cola: qué falta subir. El dato en sí vive en su almacén. */
export interface EnvioPendiente {
  id: string; // = id del registro (jornada, foto, …): un registro, una entrada
  tipo:
    | "estado_visita"
    | "estado_tarea"
    | "jornada"
    | "foto"
    | "sugerencia"
    | "firma"
    // SG-SST (migraciones 75 y 77): misma cola, mismo orden de seguridad.
    | "sst_formato"
    | "sst_archivo"
    | "sst_firma"
    | "sst_cerrar"
    | "sst_reporte"
    | "sst_reporte_foto";
  /** El "padre" que agrupa: la visita, o en SG-SST el formato o el reporte. */
  visitaId: string;
  creadoEn: string;
  intentos: number;
  ultimoError: string | null;
  /**
   * El servidor lo rechazó por algo que reintentar no arregla (visita ya firmada, sin
   * permiso, dato inválido). No se reintenta solo y NO se borra del celular: queda para
   * que la oficina lo resuelva y el técnico lo reintente a mano.
   */
  permanente?: boolean;
}

const NOMBRE = "se-erp-tecnico";
// v2 (2026-10-22): almacén "tareas" (Mis tareas). Subir la versión crea solo lo que falta:
// lo que ya estaba guardado en el celular no se toca.
// v3 (2026-10-27): almacenes de SG-SST (formatos llenados en sitio y reportes de condición insegura).
const VERSION = 3;
export const ALMACENES = [
  "visitas",
  "jornadas",
  "fotos",
  "sugerencias",
  "firmas",
  "cola",
  "meta",
  "tareas",
  "sst_formatos",
  "sst_archivos",
  "sst_firmas",
  "sst_reportes",
  "sst_reporte_fotos",
] as const;
/** El índice de cada almacén (por su padre). Los de la v1 conservan "visitaId". */
const INDICE: Partial<Record<(typeof ALMACENES)[number], string>> = {
  jornadas: "visitaId",
  fotos: "visitaId",
  sugerencias: "visitaId",
  firmas: "visitaId",
  cola: "visitaId",
  sst_archivos: "formatoId",
  sst_firmas: "formatoId",
  sst_reporte_fotos: "reporteId",
};
export type Almacen = (typeof ALMACENES)[number];

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (abierta) return abierta;
  abierta = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const nombre of ALMACENES) {
        if (db.objectStoreNames.contains(nombre)) continue;
        const almacen = db.createObjectStore(nombre, { keyPath: nombre === "meta" ? "clave" : "id" });
        const indice = INDICE[nombre];
        if (indice) almacen.createIndex(indice, indice, { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      abierta = null;
      reject(req.error);
    };
  });
  return abierta;
}

function enTransaccion<T>(
  almacen: Almacen,
  modo: IDBTransactionMode,
  accion: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(almacen, modo);
        const req = accion(tx.objectStore(almacen));
        let resultado: T;
        if (req) req.onsuccess = () => (resultado = req.result);
        // Se resuelve al COMPLETAR la transacción: recién ahí el dato está en disco.
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Transacción abortada"));
      }),
  );
}

export function guardar<T>(almacen: Almacen, valor: T): Promise<void> {
  return enTransaccion(almacen, "readwrite", (s) => {
    s.put(valor);
  }).then(() => undefined);
}

export function leer<T>(almacen: Almacen, id: string): Promise<T | undefined> {
  return enTransaccion<T | undefined>(almacen, "readonly", (s) => s.get(id) as IDBRequest<T | undefined>);
}

export function todos<T>(almacen: Almacen): Promise<T[]> {
  return enTransaccion<T[]>(almacen, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
}

export function deVisita<T>(almacen: "jornadas" | "fotos" | "sugerencias" | "firmas" | "cola", visitaId: string): Promise<T[]> {
  return enTransaccion<T[]>(almacen, "readonly", (s) => s.index("visitaId").getAll(visitaId) as IDBRequest<T[]>);
}

/** Los hijos de un formato o un reporte de SG-SST (fotos, firmas). */
export function dePadre<T>(almacen: "sst_archivos" | "sst_firmas" | "sst_reporte_fotos", padreId: string): Promise<T[]> {
  const indice = INDICE[almacen] as string;
  return enTransaccion<T[]>(almacen, "readonly", (s) => s.index(indice).getAll(padreId) as IDBRequest<T[]>);
}

export function borrar(almacen: Almacen, id: string): Promise<void> {
  return enTransaccion(almacen, "readwrite", (s) => {
    s.delete(id);
  }).then(() => undefined);
}

/** Guarda el registro y su entrada en la cola en UNA transacción: o quedan los dos, o ninguno. */
export function guardarYEncolar<T>(
  almacen: Exclude<Almacen, "cola" | "meta">,
  valor: T,
  envio: Omit<EnvioPendiente, "creadoEn" | "intentos" | "ultimoError">,
): Promise<void> {
  return abrir().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction([almacen, "cola"], "readwrite");
        tx.objectStore(almacen).put(valor);
        const cola = tx.objectStore("cola");
        const previa = cola.get(envio.id);
        previa.onsuccess = () => {
          const anterior = previa.result as EnvioPendiente | undefined;
          cola.put({
            ...envio,
            creadoEn: anterior?.creadoEn ?? new Date().toISOString(),
            intentos: 0,
            ultimoError: null,
          } satisfies EnvioPendiente);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("No se pudo guardar en el celular"));
      }),
  );
}

export async function leerMeta<T>(clave: string): Promise<T | undefined> {
  const fila = await leer<{ clave: string; valor: T }>("meta", clave);
  return fila?.valor;
}

export function guardarMeta<T>(clave: string, valor: T): Promise<void> {
  return guardar("meta", { clave, valor });
}

/** Pide al navegador que NO borre estos datos aunque falte espacio (clave en Android). */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

const BYTES_FOTO = 220 * 1024;

/** Cuántas fotos más caben, según lo que el navegador dice que queda libre. */
export async function espacioDisponible(): Promise<{ fotosQueCaben: number | null; usadoMb: number | null }> {
  try {
    if (!navigator.storage?.estimate) return { fotosQueCaben: null, usadoMb: null };
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    // Margen del 10 %: el navegador falla antes de llegar al 100 %.
    const libre = Math.max(0, quota * 0.9 - usage);
    return { fotosQueCaben: Math.floor(libre / BYTES_FOTO), usadoMb: Math.round(usage / 1024 / 1024) };
  } catch {
    return { fotosQueCaben: null, usadoMb: null };
  }
}

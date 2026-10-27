// SG-SST en el celular (sin señal): lo que se guarda en la base local del técnico (misma base,
// misma cola de subida: src/lib/tecnico). Se borra la imagen solo cuando el servidor la confirmó.

import type { Ubicacion } from "@/lib/tecnico/db";
import type { Campo, FirmaPedida, RolFirma, TecnicoEnObra } from "./plantillas";

/** La plantilla tal como se usó (versión exacta), para llenar sin señal. */
export interface PlantillaLocal {
  id: string;
  codigo: string;
  nombre: string;
  version: number;
  descripcion: string | null;
  campos: Campo[];
  firmas: FirmaPedida[];
}

export interface SstFormatoLocal {
  id: string;
  plantilla: PlantillaLocal;
  proyectoId: string | null;
  proyectoNombre: string | null;
  lugar: string;
  fecha: string;
  respuestas: Record<string, unknown>;
  /** Los técnicos que estuvieron en la obra (firman todos). Falta en borradores de antes de la 83. */
  tecnicosEnObra?: TecnicoEnObra[];
  creadoEn: string;
  actualizadoEn: string;
  /** Cerrado en el celular (con todas las firmas): sube como "firmado". */
  cerrado: boolean;
}

export interface SstArchivoLocal {
  id: string;
  formatoId: string;
  campoId: string;
  blob: Blob | null;
  mime: string;
  sha256: string;
  tomadaEn: string;
  ubicacion: Ubicacion;
  subida?: boolean;
}

export interface SstFirmaLocal {
  id: string;
  formatoId: string;
  rol: RolFirma;
  nombre: string;
  documento: string;
  cargo: string;
  empresa: string;
  blob: Blob | null;
  sha256: string;
  firmadaEn: string;
  ubicacion: Ubicacion;
  dispositivo: string;
  subida?: boolean;
}

export interface SstReporteLocal {
  id: string;
  tipo: "acto" | "condicion";
  descripcion: string;
  lugar: string;
  proyectoId: string | null;
  ubicacion: Ubicacion;
  observadoEn: string;
  subido?: boolean;
}

export interface SstReporteFotoLocal {
  id: string;
  reporteId: string;
  blob: Blob | null;
  sha256: string;
  subida?: boolean;
}

/** El navegador y el equipo, para el registro de la firma (sin datos personales). */
export function dispositivoActual(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 300);
}

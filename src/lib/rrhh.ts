// RRHH — constantes compartidas entre servidor y navegador.
export const BUCKET_RRHH = "documentos-rrhh";

export const TIPOS_PLANTILLA = [{ id: "CONTRATO_LABORAL", label: "Contrato laboral" }] as const;
export type TipoPlantilla = (typeof TIPOS_PLANTILLA)[number]["id"];

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_BYTES_PLANTILLA = 10 * 1024 * 1024;

/** Nombre de archivo seguro para la ruta en Storage (sin espacios ni tildes). */
export function nombreSeguro(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 120);
}

// RRHH → Contratos laborales (migración 67; docs/nexgo-contratos-laborales.md). Se replica la
// estructura de NEXGO; el TEXTO de las cláusulas lo transcribe Jhojan (no sale de acá).

export { TIPO_CONTRATO } from "./personal";

export const ESTADO_CONTRATO: Record<string, string> = {
  borrador: "Borrador",
  vigente: "Vigente",
  terminado: "Terminado",
  anulado: "Anulado",
};
export const CLASE_CONTRATO: Record<string, string> = { original: "Original", renovacion: "Renovación", otro_si: "Otro sí" };

/**
 * Formas de pago de Servielectro (NEXGO: "Al elegir una cotización aprobada se cargan…").
 * Los hitos de 50-30-20 son los que dice el video; los demás se describen en el contrato.
 */
export const FORMAS_PAGO: { id: string; nombre: string; hitos: string | null }[] = [
  { id: "50-50", nombre: "50-50", hitos: null },
  { id: "60-40", nombre: "60-40", hitos: null },
  {
    id: "50-30-20",
    nombre: "50-30-20",
    hitos: "El 30 % se libera con acta de entrega parcial (equipos, materiales e infraestructura) y el 20 % con montaje, configuración y puesta en marcha.",
  },
  { id: "otra", nombre: "Otra", hitos: null },
];

export interface Clausula {
  id: string;
  orden: number;
  titulo: string;
  texto: string;
}
export interface Poliza {
  id: string;
  orden: number;
  activo: boolean;
  poliza: string;
  porcentaje: number | null;
  durante_anios: number | null;
  meses_extra: number | null;
  complemento: string | null;
}
export interface Actividad {
  id: string;
  orden: number;
  actividad: string;
  dia_inicio: number | null;
  fecha_inicio?: string | null;
  duracion_habiles: number | null;
  fecha_fin?: string | null;
  responsable: string | null;
}

/** Tablas de una plantilla o de un contrato: mismas columnas, distinta tabla y llave. */
export const TABLAS = {
  plantilla: {
    clausulas: "contrato_plantilla_clausulas",
    polizas: "contrato_plantilla_polizas",
    cronograma: "contrato_plantilla_cronograma",
    llave: "plantilla_id",
  },
  contrato: {
    clausulas: "contrato_clausulas",
    polizas: "contrato_polizas",
    cronograma: "contrato_cronograma",
    llave: "contrato_id",
  },
} as const;

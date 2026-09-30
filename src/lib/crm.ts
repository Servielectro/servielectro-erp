// CRM — tipos, etiquetas y reglas de alerta compartidas entre servidor y cliente.
// Las etapas y sus umbrales viven en la base (etapas_config); acá solo lo que la base
// guarda como enum y necesita texto para mostrar.

export type TipoPipeline = "proyecto_nuevo" | "renovacion";
export type EstadoOportunidad = "activa" | "aplazada" | "cerrada";
export type ViaAprobacion = "administrador" | "consejo" | "asamblea";
export type TipoContacto = "llamada" | "whatsapp" | "correo" | "visita" | "reunion";
export type MotivoPerdida =
  | "precio_oferta_mas_economica"
  | "precio_sin_presupuesto"
  | "competidor_alcance_tecnico"
  | "competidor_relacion_previa"
  | "sin_decision_organo"
  | "aplazado_cancelado_cliente"
  | "expensa_no_aprobada"
  | "fuera_de_capacidad"
  | "no_go_decision_propia"
  | "cliente_no_responde"
  | "otro";

export const PIPELINE_LABEL: Record<TipoPipeline, string> = {
  proyecto_nuevo: "Proyectos nuevos",
  renovacion: "Renovaciones",
};

export const VIA_LABEL: Record<ViaAprobacion, string> = {
  administrador: "Administrador",
  consejo: "Consejo de administración",
  asamblea: "Asamblea",
};

export const CONTACTO_LABEL: Record<TipoContacto, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  correo: "Correo",
  visita: "Visita",
  reunion: "Reunión",
};

// Los 11 motivos aprobados por Jhojan, en su orden y con su redacción.
export const MOTIVOS_PERDIDA: { id: MotivoPerdida; label: string }[] = [
  { id: "precio_oferta_mas_economica", label: "Precio — perdimos contra oferta más económica" },
  { id: "precio_sin_presupuesto", label: "Precio — el cliente no tenía presupuesto" },
  { id: "competidor_alcance_tecnico", label: "Competidor ganó por alcance o especificación técnica" },
  { id: "competidor_relacion_previa", label: "Competidor ganó por relación previa o recomendación interna" },
  { id: "sin_decision_organo", label: "No hubo decisión — el órgano nunca se reunió o no llegó a acuerdo" },
  { id: "aplazado_cancelado_cliente", label: "Proyecto aplazado o cancelado por el cliente" },
  { id: "expensa_no_aprobada", label: "No se aprobó la expensa extraordinaria" },
  { id: "fuera_de_capacidad", label: "Alcance fuera de nuestra capacidad o especialidad" },
  { id: "no_go_decision_propia", label: "No cotizamos — decisión propia (No-Go)" },
  { id: "cliente_no_responde", label: "Cliente dejó de responder" },
  { id: "otro", label: "Otro" },
];

export const MOTIVO_LABEL = Object.fromEntries(
  MOTIVOS_PERDIDA.map((m) => [m.id, m.label]),
) as Record<MotivoPerdida, string>;

// Motivos en los que tiene sentido preguntar quién ganó.
export const MOTIVOS_CON_COMPETIDOR: MotivoPerdida[] = [
  "precio_oferta_mas_economica",
  "competidor_alcance_tecnico",
  "competidor_relacion_previa",
];

export interface EtapaConfig {
  id: string;
  tipoPipeline: TipoPipeline;
  nombre: string;
  orden: number;
  diasAlerta: number | null;
  diasEstancada: number | null;
  resultado: "ganada" | "perdida" | null;
}

export type Semaforo = "verde" | "amarillo" | "rojo";

export const MS_DIA = 86_400_000;

export function diasDesde(fechaIso: string, ahora = Date.now()): number {
  return Math.max(0, Math.floor((ahora - new Date(fechaIso).getTime()) / MS_DIA));
}

/** Verde / amarillo (pasó dias_alerta) / rojo (pasó dias_estancada). */
export function semaforo(dias: number, etapa: EtapaConfig | undefined): Semaforo {
  if (!etapa) return "verde";
  if (etapa.diasEstancada && dias >= etapa.diasEstancada) return "rojo";
  if (etapa.diasAlerta && dias >= etapa.diasAlerta) return "amarillo";
  return "verde";
}

/** Fecha de hoy en Colombia (YYYY-MM-DD), para comparar con columnas `date`. */
export function hoyColombia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

// Etapas donde todavía no hay cotización y el valor solo puede ser un estimado. De
// "Cotización en elaboración" en adelante manda el total de la cotización asociada.
export const ETAPAS_CON_ESTIMADO = ["solicitud", "visita_tecnica", "go_no_go", "renovacion_proxima"];

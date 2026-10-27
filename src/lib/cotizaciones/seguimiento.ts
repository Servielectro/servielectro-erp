// Seguimiento de cotizaciones (migraciones 98 y 99): estados, tipos de próximo paso y alertas.
// Las reglas (qué transición vale, un paso abierto a la vez, cerrado no se edita) las exige la
// base; esto es lo que la pantalla necesita para mostrar.

export type EstadoCotizacion = "BORRADOR" | "ENVIADA" | "EN_EVALUACION" | "APROBADA" | "RECHAZADA";

export const ESTADO_COTIZACION: Record<string, { etiqueta: string; clase: string }> = {
  BORRADOR: { etiqueta: "Borrador", clase: "bg-slate-100 text-slate-700" },
  ENVIADA: { etiqueta: "Enviada", clase: "bg-blue-100 text-blue-700" },
  EN_EVALUACION: { etiqueta: "En evaluación", clase: "bg-amber-100 text-amber-800" },
  APROBADA: { etiqueta: "Aprobada", clase: "bg-green-100 text-green-700" },
  RECHAZADA: { etiqueta: "Rechazada", clase: "bg-red-100 text-red-700" },
};

/** A dónde puede pasar desde cada estado (lo mismo que fn_cotizacion_estado_reglas). */
export const SIGUIENTES: Record<string, { estado: EstadoCotizacion; boton: string }[]> = {
  BORRADOR: [{ estado: "ENVIADA", boton: "Marcar como enviada" }],
  ENVIADA: [
    { estado: "EN_EVALUACION", boton: "El cliente la está evaluando" },
    { estado: "APROBADA", boton: "Aprobada" },
    { estado: "RECHAZADA", boton: "Rechazada" },
  ],
  EN_EVALUACION: [
    { estado: "ENVIADA", boton: "Se envió una versión nueva" },
    { estado: "APROBADA", boton: "Aprobada" },
    { estado: "RECHAZADA", boton: "Rechazada" },
  ],
  APROBADA: [],
  RECHAZADA: [],
};

export const TIPOS_PASO: { id: string; etiqueta: string }[] = [
  { id: "llamada", etiqueta: "Llamada" },
  { id: "correo", etiqueta: "Correo" },
  { id: "visita_tecnica", etiqueta: "Visita técnica (medir o levantar información)" },
  { id: "reunion", etiqueta: "Reunión" },
  { id: "ajustar_propuesta", etiqueta: "Ajustar la propuesta (sale versión nueva)" },
  { id: "enviar_documentacion", etiqueta: "Enviar documentación (pólizas, cámara de comercio, RUT…)" },
  { id: "presentar_a_consejo", etiqueta: "Presentar ante el consejo de administración" },
  { id: "espera_consejo_o_asamblea", etiqueta: "Esperar al consejo o la asamblea (la fecha es la de su reunión)" },
  { id: "otro", etiqueta: "Otro" },
];
export const NOMBRE_PASO = Object.fromEntries(TIPOS_PASO.map((t) => [t.id, t.etiqueta])) as Record<string, string>;

export interface Paso {
  id: string;
  tipo: string | null;
  detalle_otro: string | null;
  fecha_programada: string | null;
  responsable_id: string | null;
  notas: string | null;
  creado_en: string;
  realizado_en: string | null;
  resultado: string | null;
  cerrado_por: string | null;
}

export interface AlertaCotizacion {
  cotizacion_id: string;
  paso_tipo: string | null;
  paso_fecha: string | null;
  validez_vence: string;
  sin_paso: boolean;
  paso_por_definir: boolean;
  paso_vencido: boolean;
  validez_vencida: boolean;
}

/** Los avisos de una cotización, en texto corto. */
export function avisos(a: AlertaCotizacion | undefined): { texto: string; grave: boolean }[] {
  if (!a) return [];
  const r: { texto: string; grave: boolean }[] = [];
  if (a.validez_vencida) r.push({ texto: `Validez vencida (${a.validez_vence}): los precios ya no son los ofrecidos`, grave: true });
  if (a.paso_vencido) r.push({ texto: `Próximo paso vencido (${a.paso_fecha})`, grave: true });
  if (a.sin_paso) r.push({ texto: "Sin próximo paso", grave: false });
  else if (a.paso_por_definir) r.push({ texto: "Próximo paso por definir", grave: false });
  return r;
}

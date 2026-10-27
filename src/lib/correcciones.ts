// Correcciones de registros cerrados (migración 84). Corregir no es editar: el valor anterior
// queda a la vista, con el motivo y quién lo hizo. Hoy solo abonos; la tabla sirve igual para
// liquidaciones, desprendibles y caja menor cuando lleguen.

import { fechaCorta, pesos } from "./rrhh-registros";

export interface Correccion {
  id: string;
  registro_id: string;
  campo: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  motivo: string;
  corregido_por_nombre: string;
  corregido_en: string;
}
export const COLUMNAS_CORRECCION = "id, registro_id, campo, valor_anterior, valor_nuevo, motivo, corregido_por_nombre, corregido_en";

/** Lo que se corrige de un abono desembolsado (lo mismo que acepta fn_corregir_abono). */
export const CAMPOS_ABONO = {
  monto_aprobado: "Lo aprobado (lo que se descuenta)",
  fecha_desembolso: "La fecha del desembolso (decide la quincena)",
} as const;
export type CampoAbono = keyof typeof CAMPOS_ABONO;

const DIA = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota" });

function valor(campo: string, v: unknown): string {
  if (v === null || v === undefined) return "vacío";
  if (campo === "monto_aprobado") return pesos(Number(v));
  if (campo === "fecha_desembolso") return fechaCorta(String(v));
  return String(v);
}

/** "Corregido el 27/10/2026 por Jhojan: antes $350.000, ahora $200.000. Motivo: …" */
export function textoCorreccion(c: Correccion): string {
  const que = c.campo === "fecha_desembolso" ? "fecha del desembolso " : "";
  return `Corregido el ${DIA.format(new Date(c.corregido_en))} por ${c.corregido_por_nombre}: ${que}antes ${valor(c.campo, c.valor_anterior)}, ahora ${valor(c.campo, c.valor_nuevo)}. Motivo: ${c.motivo}`;
}

/** Agrupa por registro, en orden de cuándo se corrigió. */
export function correccionesPorRegistro(lista: Correccion[]): Record<string, Correccion[]> {
  const m: Record<string, Correccion[]> = {};
  for (const c of [...lista].sort((a, b) => a.corregido_en.localeCompare(b.corregido_en))) (m[c.registro_id] ??= []).push(c);
  return m;
}

import "server-only";
import { ErrorIA, explicar } from "./errores";
import { generarConOpenAI } from "./openai";
import { generarConGemini } from "./gemini";

/**
 * Punto único de IA del ERP (lectura del RUT y descripción de equipos).
 *
 * Orden (Jhojan, 2026-10-22): PRIMERO OpenAI ("todavía tengo saldo"), y si falla por cualquier
 * causa, Gemini de inmediato, sin que el usuario haga nada. Dos proveedores porque lo usa parado
 * frente a un cliente: uno solo es un punto único de falla.
 *
 * Si falta la clave de uno, se usa el otro. Si fallan los dos, el mensaje dice la causa REAL de
 * cada uno (sin saldo, saturado, límite por minuto…), nunca un "mucho tráfico" genérico, y
 * siempre que se puede seguir a mano.
 *
 * NUNCA se llama desde el navegador.
 */

export type ParteIA = { texto: string } | { archivo: { mime: string; base64: string; nombre: string } };

export interface PeticionIA {
  /** Para qué ("leer el RUT", "buscar la descripción"): va en el mensaje de error. */
  para: string;
  instrucciones: string;
  partes: ParteIA[];
  /** Si se pasa, la respuesta es un JSON con esta forma (JSON Schema). */
  esquemaJson?: Record<string, unknown>;
  nombreEsquema?: string;
  /** Buscar en la web (descripción de equipos: no inventar de memoria). */
  busquedaWeb?: boolean;
  temperatura?: number;
}

export interface RespuestaIA {
  texto: string;
  fuentesWeb: string[];
  tokensEntrada: number;
  tokensSalida: number;
  proveedor: "OpenAI" | "Gemini";
  modelo: string;
}

/**
 * @param timeoutMs tope por proveedor. Peor caso total: OpenAI (timeoutMs) + Gemini (timeoutMs
 *                  y hasta ~6 s de reintentos solo si está saturado de verdad).
 */
export async function generarConIA(p: PeticionIA, timeoutMs: number): Promise<RespuestaIA> {
  const fallos: ErrorIA[] = [];
  for (const proveedor of [generarConOpenAI, generarConGemini]) {
    try {
      return await proveedor(p, timeoutMs);
    } catch (e) {
      if (!(e instanceof ErrorIA)) throw e;
      fallos.push(e);
    }
  }
  // Los dos fallaron: decir qué pasó con cada uno (los que no tienen clave no cuentan como
  // explicación si el otro sí dijo algo).
  const conCausa = fallos.filter((f) => !(f.causa === "config" && /falta la clave/.test(f.message)));
  const motivos = (conCausa.length ? conCausa : fallos).map(explicar).join("; ");
  throw new Error(`No se pudo ${p.para} con IA (${motivos}). Llena los datos a mano.`);
}

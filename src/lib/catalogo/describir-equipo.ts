import "server-only";
import { generarConGemini } from "@/lib/ia/gemini";

/**
 * Descripción automática de EQUIPOS para la cotización.
 *
 * Jhojan hoy hace esto a mano con ChatGPT: escribe la referencia, pide un
 * resumen de características y lo pega en la cotización. Esto lo automatiza.
 *
 * Usa Google Gemini con *grounding* de búsqueda de Google, porque:
 *   1. Necesita buscar la referencia en la web, no inventarla de memoria.
 *   2. Jhojan tiene licencia de Google AI Studio (1050 créditos/mes por 18 meses),
 *      así que este camino no agrega costo.
 *
 * SOLO para categoría EQUIPO. Para MATERIAL y MANO_DE_OBRA no aplica: no son
 * productos con ficha técnica y la IA terminaría inventando.
 *
 * NUNCA se llama desde el navegador — la API key vive solo acá.
 */

const INSTRUCCIONES = `Eres el ingeniero de preventa de Servielectro SAS, empresa de seguridad electrónica en Bogotá, Colombia.

Te dan el NOMBRE y la REFERENCIA de un equipo. Busca esa referencia en la web y devuelve la descripción que irá en la cotización al cliente.

REGLAS:
- Español de Colombia.
- Entre 25 y 60 palabras. Ni tan corto que no diga nada, ni tan largo que nadie lo lea.
- Solo características técnicas principales: resolución, alcance, alimentación, protección IP, capacidad, conectividad — lo que aplique al tipo de equipo.
- Un solo párrafo corrido, sin viñetas, sin saltos de línea, sin títulos.
- NO incluyas precios, ni plazos de entrega, ni garantías, ni nombres de distribuidores.
- NO uses lenguaje publicitario ("excelente", "líder", "solución integral", "la mejor opción").
- Escribe la marca y la referencia tal como las encuentres.

SI NO ENCUENTRAS LA REFERENCIA en la web, o lo que encuentras no corresponde claramente a ese equipo, responde EXACTAMENTE con esta única palabra:
NO_ENCONTRADO

Es preferible NO_ENCONTRADO a una descripción inventada: esa descripción va en un documento que el cliente firma.

Devuelve únicamente el párrafo. Sin comillas, sin preámbulo, sin explicación.`;

export interface ResultadoDescripcion {
  descripcion: string;
  fuentes: string[];
}

export class EquipoNoEncontradoError extends Error {
  constructor() {
    super(
      "No se encontró información confiable de esa referencia en la web. Escribe la descripción a mano.",
    );
    this.name = "EquipoNoEncontradoError";
  }
}

/**
 * Busca la referencia en la web y devuelve una descripción lista para revisar.
 * El texto NO se guarda solo: Jhojan lo lee y decide si lo aprueba.
 */
export async function describirEquipo(
  nombre: string,
  referencia: string,
): Promise<ResultadoDescripcion> {
  const nombreLimpio = nombre.trim();
  const referenciaLimpia = referencia.trim();

  if (!referenciaLimpia) {
    throw new Error(
      "Escribe la referencia del equipo. Sin referencia no hay qué buscar.",
    );
  }

  const consulta = [
    `NOMBRE: ${nombreLimpio || "(no especificado)"}`,
    `REFERENCIA: ${referenciaLimpia}`,
  ].join("\n");

  const { texto, fuentesWeb } = await generarConGemini({
    para: "buscar la descripción",
    instrucciones: INSTRUCCIONES,
    partes: [{ text: consulta }],
    herramientas: [{ google_search: {} }],
    configuracion: { temperature: 0.2 },
    // Esto corre mientras Jhojan está cotizando frente al cliente: si en 15
    // segundos no hay respuesta, se corta y él escribe la descripción a mano.
    timeoutMs: 15_000,
    // Con reintentos por saturación de Google incluidos.
    presupuestoMs: 25_000,
  });

  if (!texto) {
    throw new Error(
      "El servicio no devolvió ninguna descripción. Escribe la descripción a mano.",
    );
  }

  if (texto.toUpperCase().includes("NO_ENCONTRADO")) {
    throw new EquipoNoEncontradoError();
  }

  // Un párrafo corrido: el formato de la cotización no maneja saltos de línea.
  const descripcion = texto.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ");

  const fuentes = fuentesWeb.slice(0, 5);

  return { descripcion, fuentes };
}

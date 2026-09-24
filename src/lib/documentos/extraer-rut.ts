import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  RutExtraidoSchema,
  INSTRUCCIONES_EXTRACCION_RUT,
  type RutExtraido,
} from "./rut-schema";
import { validarNit } from "@/lib/nit";

// Modelo económico por defecto — ver docs/ERP-Servielectro-Modulo1-Proyectos.md §14
// para el estimado de costo (~$0.001 USD por RUT). gpt-4o-mini soporta PDF nativo
// (input_file) e imágenes (input_image) con salida estructurada (Structured Outputs).
const MODELO = "gpt-4o-mini";

// Precios oficiales de OpenAI por millón de tokens (verificado en developers.openai.com/api/docs/pricing).
const PRECIO_INPUT_POR_MILLON = 0.15;
const PRECIO_OUTPUT_POR_MILLON = 0.6;

export interface ResultadoExtraccionRut {
  extraccion: RutExtraido;
  nitValidado: {
    coincide: boolean | null; // null si no había NIT/DV suficientes para validar
    dvCalculado: number | null;
  };
  costoEstimadoUsd: number;
  tokensEntrada: number;
  tokensSalida: number;
}

function mimeDesdeNombre(nombreArchivo: string): string {
  const ext = nombreArchivo.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

/**
 * Extrae los datos de un RUT (PDF o foto) usando OpenAI, con salida estructurada
 * y verificada. NUNCA se llama desde el navegador — la API key vive solo acá.
 */
export async function extraerRut(
  archivoBuffer: Buffer,
  nombreArchivo: string,
): Promise<ResultadoExtraccionRut> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY no está configurada en el servidor. No se puede leer el RUT automáticamente.",
    );
  }

  const openai = new OpenAI({ apiKey });
  const mime = mimeDesdeNombre(nombreArchivo);
  const base64 = archivoBuffer.toString("base64");
  const esImagen = mime.startsWith("image/");

  const contenidoArchivo = esImagen
    ? {
        type: "input_image" as const,
        image_url: `data:${mime};base64,${base64}`,
        detail: "high" as const,
      }
    : {
        type: "input_file" as const,
        filename: nombreArchivo,
        file_data: `data:${mime};base64,${base64}`,
      };

  const response = await openai.responses.parse({
    model: MODELO,
    input: [
      {
        role: "system",
        content: INSTRUCCIONES_EXTRACCION_RUT,
      },
      {
        role: "user",
        content: [
          contenidoArchivo,
          {
            type: "input_text",
            text: "Extraé los datos de este documento según el esquema.",
          },
        ],
      },
    ],
    text: { format: zodTextFormat(RutExtraidoSchema, "rut_extraido") },
  });

  const extraccion = response.output_parsed;
  if (!extraccion) {
    throw new Error("OpenAI no devolvió una extracción válida para este documento.");
  }

  const tokensEntrada = response.usage?.input_tokens ?? 0;
  const tokensSalida = response.usage?.output_tokens ?? 0;
  const costoEstimadoUsd =
    (tokensEntrada / 1_000_000) * PRECIO_INPUT_POR_MILLON +
    (tokensSalida / 1_000_000) * PRECIO_OUTPUT_POR_MILLON;

  // Validación matemática del NIT — independiente de qué tan "segura" haya dicho
  // estar la IA. Es la red de seguridad barata contra un dígito mal leído.
  let nitValidado: ResultadoExtraccionRut["nitValidado"] = {
    coincide: null,
    dvCalculado: null,
  };
  if (extraccion.nit.valor && extraccion.dv.valor) {
    const validacion = validarNit(extraccion.nit.valor, extraccion.dv.valor);
    nitValidado = {
      coincide: validacion.valido,
      dvCalculado: validacion.dvCalculado,
    };
  }

  return {
    extraccion,
    nitValidado,
    costoEstimadoUsd,
    tokensEntrada,
    tokensSalida,
  };
}

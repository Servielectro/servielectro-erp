import "server-only";
import { z } from "zod";
import {
  RutExtraidoSchema,
  INSTRUCCIONES_EXTRACCION_RUT,
  type RutExtraido,
} from "./rut-schema";
import { validarNit } from "@/lib/nit";
import { generarConGemini } from "@/lib/ia/gemini";

// Lectura del RUT con Google Gemini (antes OpenAI): mismo proveedor y misma clave que
// la descripción de equipos (GEMINI_API_KEY), cubierto por la licencia de Google AI
// Studio de Jhojan. Gemini lee PDF e imagen nativamente y devuelve JSON con el esquema
// que se le pasa; igual se valida con Zod antes de usarlo.
//
// Costo de referencia del modelo flash de Gemini por millón de tokens (precio de pago por uso
// de Google; con la licencia de Jhojan se descuenta de sus créditos): entrada $0.30,
// salida $2.50. Se guarda una estimación en documentos.costo_estimado_usd.
const PRECIO_INPUT_POR_MILLON = 0.3;
const PRECIO_OUTPUT_POR_MILLON = 2.5;

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

// El mismo esquema Zod de siempre, convertido a JSON Schema para pedirle a Gemini la
// respuesta con esa forma exacta ($schema sobra para la API).
const ESQUEMA_JSON = (() => {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(RutExtraidoSchema) as Record<string, unknown>;
  void _omitido;
  return resto;
})();

/**
 * Extrae los datos de un RUT (PDF o foto) con Gemini, con salida estructurada y
 * verificada. NUNCA se llama desde el navegador — la API key vive solo acá. Lo que
 * devuelve se muestra campo por campo para confirmar antes de guardar.
 */
export async function extraerRut(
  archivoBuffer: Buffer,
  nombreArchivo: string,
): Promise<ResultadoExtraccionRut> {
  const mime = mimeDesdeNombre(nombreArchivo);
  if (mime === "application/octet-stream") {
    throw new Error("Formato no soportado: sube el RUT en PDF o como foto (JPG, PNG o WEBP).");
  }

  const archivo = { inline_data: { mime_type: mime, data: archivoBuffer.toString("base64") } };
  const pedir = (conEsquemaEstructurado: boolean) =>
    generarConGemini({
      para: "leer el RUT",
      instrucciones: conEsquemaEstructurado
        ? INSTRUCCIONES_EXTRACCION_RUT
        : `${INSTRUCCIONES_EXTRACCION_RUT}\n\nRespondé SOLO con un objeto JSON que cumpla exactamente este JSON Schema:\n${JSON.stringify(ESQUEMA_JSON)}`,
      partes: [archivo, { text: "Extraé los datos de este documento según el esquema." }],
      configuracion: {
        temperature: 0,
        responseMimeType: "application/json",
        ...(conEsquemaEstructurado ? { responseJsonSchema: ESQUEMA_JSON } : {}),
      },
      // Un PDF escaneado tarda más que una búsqueda corta; igual tiene tope.
      timeoutMs: 60_000,
    });

  // Plan B: si la API rechazara el esquema estructurado, se pide el JSON con el esquema
  // en las instrucciones. En ambos casos lo valida el mismo esquema Zod de abajo.
  let respuesta: Awaited<ReturnType<typeof pedir>>;
  try {
    respuesta = await pedir(true);
  } catch (e) {
    if (e instanceof Error && /schema|json_schema|Invalid JSON payload/i.test(e.message)) {
      console.error("Gemini rechazó el esquema estructurado; reintento con el esquema en el prompt:", e.message);
      respuesta = await pedir(false);
    } else {
      throw e;
    }
  }

  let crudo: unknown;
  try {
    crudo = JSON.parse(respuesta.texto);
  } catch {
    throw new Error("Gemini no devolvió una extracción válida para este documento.");
  }
  const validado = RutExtraidoSchema.safeParse(crudo);
  if (!validado.success) {
    throw new Error("Gemini devolvió datos que no cumplen el formato esperado del RUT.");
  }
  const extraccion = validado.data;

  const { tokensEntrada, tokensSalida } = respuesta;
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

import "server-only";
import { z } from "zod";
import {
  RutExtraidoSchema,
  INSTRUCCIONES_EXTRACCION_RUT,
  type RutExtraido,
} from "./rut-schema";
import { validarNit } from "@/lib/nit";
import { generarConIA } from "@/lib/ia/ia";

// Lectura del RUT con IA: primero OpenAI y, si falla, Gemini (src/lib/ia/ia.ts). Los dos leen
// PDF e imagen y devuelven JSON con el esquema que se les pasa; igual se valida con Zod antes de
// usarlo.
//
// Costo de referencia por millón de tokens (entrada / salida), para la estimación que se guarda
// en documentos.costo_estimado_usd. Con la licencia de Google, lo de Gemini sale de sus créditos.
const PRECIOS_POR_MILLON = {
  OpenAI: { entrada: 0.4, salida: 1.6 },
  Gemini: { entrada: 0.3, salida: 2.5 },
} as const;

export interface ResultadoExtraccionRut {
  extraccion: RutExtraido;
  nitValidado: {
    coincide: boolean | null; // null si no había NIT/DV suficientes para validar
    dvCalculado: number | null;
  };
  costoEstimadoUsd: number;
  tokensEntrada: number;
  tokensSalida: number;
  proveedor: "OpenAI" | "Gemini";
}

function mimeDesdeNombre(nombreArchivo: string): string {
  const ext = nombreArchivo.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

// El mismo esquema Zod de siempre, convertido a JSON Schema para pedirle a la IA la
// respuesta con esa forma exacta ($schema sobra para la API).
const ESQUEMA_JSON = (() => {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(RutExtraidoSchema) as Record<string, unknown>;
  void _omitido;
  return resto;
})();

/**
 * Extrae los datos de un RUT (PDF o foto) con IA, con salida estructurada y
 * verificada. NUNCA se llama desde el navegador — la API key vive solo acá. Lo que
 * devuelve se muestra campo por campo para confirmar antes de guardar.
 */
export async function extraerRut(
  archivoBuffer: Buffer,
  nombreArchivo: string,
  solo?: "OpenAI" | "Gemini",
): Promise<ResultadoExtraccionRut> {
  const mime = mimeDesdeNombre(nombreArchivo);
  if (mime === "application/octet-stream") {
    throw new Error("Formato no soportado: sube el RUT en PDF o como foto (JPG, PNG o WEBP).");
  }

  const respuesta = await generarConIA(
    {
      para: "leer el RUT",
      instrucciones: INSTRUCCIONES_EXTRACCION_RUT,
      partes: [
        { archivo: { mime, base64: archivoBuffer.toString("base64"), nombre: nombreArchivo } },
        { texto: "Extraé los datos de este documento según el esquema." },
      ],
      esquemaJson: ESQUEMA_JSON,
      nombreEsquema: "rut",
      temperatura: 0,
    },
    // Tope por proveedor. Con un cliente al frente: si no respondió en 20 s, se pasa al otro
    // (y la pantalla deja cancelar y llenar a mano en cualquier momento).
    20_000,
    solo,
  );

  let crudo: unknown;
  try {
    crudo = JSON.parse(respuesta.texto);
  } catch {
    throw new Error("La IA no devolvió una extracción válida para este documento. Llena los datos a mano.");
  }
  const validado = RutExtraidoSchema.safeParse(crudo);
  if (!validado.success) {
    throw new Error("La IA devolvió datos que no cumplen el formato del RUT. Llena los datos a mano.");
  }
  const extraccion = validado.data;

  const { tokensEntrada, tokensSalida } = respuesta;
  const precio = PRECIOS_POR_MILLON[respuesta.proveedor];
  const costoEstimadoUsd = (tokensEntrada / 1_000_000) * precio.entrada + (tokensSalida / 1_000_000) * precio.salida;

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
    proveedor: respuesta.proveedor,
  };
}

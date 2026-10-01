import "server-only";

/**
 * Único proveedor de IA del ERP: Google Gemini (licencia de Google AI Studio de Jhojan,
 * 1050 créditos/mes por 18 meses). Una sola clave, GEMINI_API_KEY, solo en el servidor
 * (sin prefijo NEXT_PUBLIC_). Lo usan la descripción de equipos y la lectura del RUT.
 *
 * NUNCA se llama desde el navegador.
 */

export const MODELO_GEMINI = "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Parte de entrada: texto, o un archivo (PDF / imagen) embebido en base64. */
export type ParteGemini = { text: string } | { inline_data: { mime_type: string; data: string } };

export interface RespuestaGemini {
  texto: string;
  fuentesWeb: string[]; // solo con la herramienta de búsqueda de Google
  tokensEntrada: number;
  tokensSalida: number;
}

interface CuerpoGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

/**
 * Llama a Gemini y devuelve el texto de la respuesta. Los mensajes de error están
 * pensados para mostrarse tal cual en pantalla: dicen qué pasó y qué hacer.
 *
 * @param para  para qué se usa ("leer el RUT", "buscar la descripción"), va en los mensajes.
 */
export async function generarConGemini(opciones: {
  para: string;
  instrucciones: string;
  partes: ParteGemini[];
  herramientas?: unknown[];
  configuracion?: Record<string, unknown>;
  timeoutMs: number;
}): Promise<RespuestaGemini> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      `GEMINI_API_KEY no está configurada en el servidor (Vercel → proyecto servielectro-erp → Settings → Environment Variables). No se puede ${opciones.para} automáticamente.`,
    );
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${ENDPOINT}/${MODELO_GEMINI}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opciones.instrucciones }] },
          contents: [{ role: "user", parts: opciones.partes }],
          ...(opciones.herramientas ? { tools: opciones.herramientas } : {}),
          generationConfig: opciones.configuracion ?? {},
        }),
        // Nunca dejar la pantalla colgada: si no responde a tiempo, se corta.
        signal: AbortSignal.timeout(opciones.timeoutMs),
      },
    );
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(`El servicio de IA tardó demasiado. Intenta de nuevo o hazlo a mano.`);
    }
    throw new Error(`No se pudo conectar con el servicio de IA (Gemini). Intenta de nuevo o hazlo a mano.`);
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as CuerpoGemini | null;
  if (!respuesta.ok) {
    throw new Error(`Gemini rechazó la consulta: ${cuerpo?.error?.message ?? `HTTP ${respuesta.status}`}`);
  }

  const candidato = cuerpo?.candidates?.[0];
  const texto = (candidato?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  const fuentesWeb = Array.from(
    new Set(
      (candidato?.groundingMetadata?.groundingChunks ?? [])
        .map((c) => c.web?.uri)
        .filter((u): u is string => Boolean(u)),
    ),
  );

  return {
    texto,
    fuentesWeb,
    tokensEntrada: cuerpo?.usageMetadata?.promptTokenCount ?? 0,
    tokensSalida: cuerpo?.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

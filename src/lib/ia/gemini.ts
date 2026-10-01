import "server-only";

/**
 * Único proveedor de IA del ERP: Google Gemini (licencia de Google AI Studio de Jhojan,
 * 1050 créditos/mes por 18 meses). Una sola clave, GEMINI_API_KEY, solo en el servidor
 * (sin prefijo NEXT_PUBLIC_). Lo usan la descripción de equipos y la lectura del RUT.
 *
 * Resistencia a la saturación de Google (503 "high demand"): Jhojan lo usa parado
 * frente al cliente, así que "intenta más tarde" no sirve:
 *   1. Reintento con espera creciente (≈1 s, 3 s, 6 s) SOLO para saturación
 *      (503 / UNAVAILABLE / RESOURCE_EXHAUSTED). Nunca para clave inválida, modelo
 *      inexistente o petición mal formada.
 *   2. Si sigue saturado, un modelo de respaldo elegido de la lista REAL de modelos
 *      habilitados para la clave (no inventado).
 *   3. Si todo falla, un mensaje en español que dice qué hacer.
 *
 * NUNCA se llama desde el navegador.
 */

// Único lugar donde se nombra el modelo principal (lo usan el RUT y la descripción de
// equipos). Si Google lo retira, el error de abajo lista los modelos habilitados.
export const MODELO_GEMINI = "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Esperas entre intentos ante saturación (después del 1.º, 2.º y 3.º intento).
const ESPERAS_REINTENTO_MS = [1_000, 3_000, 6_000];

export const MENSAJE_SATURADO =
  "El servicio de IA de Google está saturado en este momento. Puedes llenar los datos a mano o intentar de nuevo en un minuto.";

/** Parte de entrada: texto, o un archivo (PDF / imagen) embebido en base64. */
export type ParteGemini = { text: string } | { inline_data: { mime_type: string; data: string } };

export interface RespuestaGemini {
  texto: string;
  fuentesWeb: string[]; // solo con la herramienta de búsqueda de Google
  tokensEntrada: number;
  tokensSalida: number;
  modelo: string; // el que respondió (el principal o el de respaldo)
}

interface CuerpoGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string };
}

class SaturadoError extends Error {}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ modelos habilitados
interface ModeloApi {
  name?: string;
  supportedGenerationMethods?: string[];
}

let cacheModelos: { cuando: number; nombres: string[] } | null = null;

/** Modelos de la cuenta que sirven para generateContent (cache de 10 minutos). */
async function modelosHabilitados(apiKey: string): Promise<string[]> {
  if (cacheModelos && Date.now() - cacheModelos.cuando < 10 * 60_000) return cacheModelos.nombres;
  try {
    const r = await fetch(`${ENDPOINT}?pageSize=200&key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    const j = (await r.json()) as { models?: ModeloApi[] };
    const nombres = (j.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
    cacheModelos = { cuando: Date.now(), nombres };
    return nombres;
  } catch {
    return [];
  }
}

const versionDe = (nombre: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(nombre)?.[1] ?? 0);

/**
 * Modelos "flash" de uso general de la cuenta, del más nuevo al más viejo, sin el
 * principal. Se excluyen variantes especiales (imagen, audio, TTS, live, embeddings)
 * que no leen PDF ni dan salida estructurada.
 */
async function modelosDeRespaldo(apiKey: string): Promise<string[]> {
  const todos = await modelosHabilitados(apiKey);
  return todos
    .filter((n) => n !== MODELO_GEMINI && /^gemini-[\d.]+-flash/.test(n))
    .filter((n) => !/image|audio|tts|live|embedding|thinking-exp/i.test(n))
    .sort((a, b) => {
      // Primero los flash completos: un "lite" lee peor un RUT escaneado, así que solo
      // se usa si no hay otro. Después, del más nuevo al más viejo, y a igual versión
      // el estable antes que "preview"/"exp".
      const lite = Number(/lite/.test(a)) - Number(/lite/.test(b));
      if (lite !== 0) return lite;
      const v = versionDe(b) - versionDe(a);
      if (v !== 0) return v;
      return Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b));
    });
}

// ------------------------------------------------------------------ una llamada
async function llamarUnaVez(
  modelo: string,
  apiKey: string,
  cuerpoPeticion: string,
  timeoutMs: number,
): Promise<CuerpoGemini> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${ENDPOINT}/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpoPeticion,
      // Nunca dejar la pantalla colgada: si no responde a tiempo, se corta.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error("El servicio de IA tardó demasiado. Intenta de nuevo o hazlo a mano.");
    }
    throw new Error("No se pudo conectar con el servicio de IA (Gemini). Intenta de nuevo o hazlo a mano.");
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as CuerpoGemini | null;
  if (respuesta.ok && cuerpo) return cuerpo;

  const detalle = cuerpo?.error?.message ?? `HTTP ${respuesta.status}`;
  const estado = cuerpo?.error?.status ?? "";
  if (
    respuesta.status === 503 ||
    respuesta.status === 429 ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED/.test(estado) ||
    /high demand|overloaded|try again later/i.test(detalle)
  ) {
    throw new SaturadoError(detalle);
  }
  if (respuesta.status === 404 || /not found|no longer available|not supported/i.test(detalle)) {
    const disponibles = (await modelosHabilitados(apiKey)).filter((n) => n.includes("flash")).slice(0, 15);
    throw new Error(
      `Gemini rechazó el modelo "${modelo}": ${detalle}` +
        (disponibles.length ? ` — Modelos flash habilitados para esta clave: ${disponibles.join(", ")}` : ""),
    );
  }
  // Clave inválida, petición mal formada, etc.: no se reintenta.
  throw new Error(`Gemini rechazó la consulta: ${detalle}`);
}

/** Hasta 4 intentos del mismo modelo (esperas ≈1 s, 3 s, 6 s) mientras esté saturado. */
async function llamarConReintentos(
  modelo: string,
  apiKey: string,
  cuerpoPeticion: string,
  timeoutMs: number,
  limite: number,
): Promise<CuerpoGemini> {
  for (let intento = 0; ; intento++) {
    try {
      return await llamarUnaVez(modelo, apiKey, cuerpoPeticion, timeoutMs);
    } catch (e) {
      const espera = ESPERAS_REINTENTO_MS[intento];
      // Solo saturación se reintenta, y sin pasarse del tiempo total disponible.
      if (!(e instanceof SaturadoError) || espera === undefined || Date.now() + espera > limite) throw e;
      console.warn(`Gemini saturado (${modelo}), reintento en ${espera} ms:`, e.message);
      await esperar(espera);
    }
  }
}

// ------------------------------------------------------------------ API pública
/**
 * Llama a Gemini y devuelve el texto de la respuesta. Los mensajes de error están
 * pensados para mostrarse tal cual en pantalla: dicen qué pasó y qué hacer.
 *
 * @param para          para qué se usa ("leer el RUT", "buscar la descripción").
 * @param timeoutMs     tope por cada llamada.
 * @param presupuestoMs tope total, contando reintentos y modelo de respaldo.
 */
export async function generarConGemini(opciones: {
  para: string;
  instrucciones: string;
  partes: ParteGemini[];
  herramientas?: unknown[];
  configuracion?: Record<string, unknown>;
  timeoutMs: number;
  presupuestoMs: number;
}): Promise<RespuestaGemini> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      `GEMINI_API_KEY no está configurada en el servidor (Vercel → proyecto servielectro-erp → Settings → Environment Variables). No se puede ${opciones.para} automáticamente.`,
    );
  }

  const cuerpoPeticion = JSON.stringify({
    systemInstruction: { parts: [{ text: opciones.instrucciones }] },
    contents: [{ role: "user", parts: opciones.partes }],
    ...(opciones.herramientas ? { tools: opciones.herramientas } : {}),
    generationConfig: opciones.configuracion ?? {},
  });
  const limite = Date.now() + opciones.presupuestoMs;

  let cuerpo: CuerpoGemini | null = null;
  let modeloUsado = MODELO_GEMINI;
  try {
    cuerpo = await llamarConReintentos(MODELO_GEMINI, apiKey, cuerpoPeticion, opciones.timeoutMs, limite);
  } catch (e) {
    if (!(e instanceof SaturadoError)) throw e;
    // Sigue saturado: un modelo de respaldo real de la cuenta (uno solo, para no
    // alargar la espera frente al cliente).
    const [respaldo] = await modelosDeRespaldo(apiKey);
    if (!respaldo || Date.now() >= limite) throw new Error(MENSAJE_SATURADO);
    console.warn(`Gemini: ${MODELO_GEMINI} saturado, se usa el respaldo ${respaldo}`);
    try {
      cuerpo = await llamarConReintentos(respaldo, apiKey, cuerpoPeticion, opciones.timeoutMs, limite);
      modeloUsado = respaldo;
    } catch (e2) {
      if (e2 instanceof SaturadoError) throw new Error(MENSAJE_SATURADO);
      throw e2;
    }
  }

  if (!cuerpo) throw new Error(MENSAJE_SATURADO);
  const candidato = cuerpo.candidates?.[0];
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
    tokensEntrada: cuerpo.usageMetadata?.promptTokenCount ?? 0,
    tokensSalida: cuerpo.usageMetadata?.candidatesTokenCount ?? 0,
    modelo: modeloUsado,
  };
}

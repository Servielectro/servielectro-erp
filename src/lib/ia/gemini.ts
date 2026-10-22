import "server-only";
import { ErrorIA } from "./errores";
import type { PeticionIA, RespuestaIA } from "./ia";

/**
 * Google Gemini: SEGUNDO proveedor desde el 2026-10-22 (primero va OpenAI; ver ia.ts). Clave
 * GEMINI_API_KEY solo en el servidor (licencia de Google AI Studio de Jhojan).
 *
 * Cada causa de error se trata distinto, y el mensaje dice la verdad (errores.ts):
 *   - Saturación real (503 / UNAVAILABLE): reintento RÁPIDO (0,4 s y 1,2 s) dentro de un tope,
 *     y si sigue, un modelo de respaldo real de la cuenta. Con un cliente al frente, esperar
 *     1 + 3 + 6 s para fallar igual era lo peor de los dos mundos.
 *   - 429 / RESOURCE_EXHAUSTED: NUNCA se reintenta. Google devuelve lo mismo para el límite por
 *     minuto y para la cuota del día o del nivel gratuito; lo distingue el quotaId del detalle.
 *     Antes se trataba como "saturado" y se reintentaba tres veces para fallar igual.
 *   - Clave inválida, sin permiso, modelo inexistente: error de configuración, sin reintentos.
 *
 * NUNCA se llama desde el navegador.
 */

// Único lugar donde se nombra el modelo principal. Si Google lo retira, el error lista los
// modelos habilitados para la clave.
export const MODELO_GEMINI = "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Reintentos SOLO ante saturación real (503), rápidos y con tope total.
const ESPERAS_REINTENTO_MS = [400, 1_200];
const TOPE_REINTENTOS_MS = 6_000;

interface CuerpoGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: {
    message?: string;
    status?: string;
    details?: Array<{
      "@type"?: string;
      violations?: Array<{ quotaId?: string; quotaMetric?: string }>;
      retryDelay?: string;
    }>;
  };
}

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
      signal: AbortSignal.timeout(5_000),
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

/** Modelos "flash" de uso general de la cuenta, del más nuevo al más viejo, sin el principal. */
async function modelosDeRespaldo(apiKey: string): Promise<string[]> {
  const todos = await modelosHabilitados(apiKey);
  return todos
    .filter((n) => n !== MODELO_GEMINI && /^gemini-[\d.]+-flash/.test(n))
    .filter((n) => !/image|audio|tts|live|embedding|thinking-exp/i.test(n))
    .sort((a, b) => {
      // Primero los flash completos (un "lite" lee peor un RUT escaneado), después del más
      // nuevo al más viejo, y a igual versión el estable antes que "preview"/"exp".
      const lite = Number(/lite/.test(a)) - Number(/lite/.test(b));
      if (lite !== 0) return lite;
      const v = versionDe(b) - versionDe(a);
      if (v !== 0) return v;
      return Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b));
    });
}

// ------------------------------------------------------------------ una llamada
async function llamarUnaVez(modelo: string, apiKey: string, cuerpoPeticion: string, timeoutMs: number): Promise<CuerpoGemini> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${ENDPOINT}/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpoPeticion,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new ErrorIA("Gemini", "tiempo", "no respondió a tiempo");
    throw new ErrorIA("Gemini", "saturado", "no se pudo conectar");
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as CuerpoGemini | null;
  if (respuesta.ok && cuerpo) return cuerpo;

  const detalle = cuerpo?.error?.message ?? `HTTP ${respuesta.status}`;
  const estado = cuerpo?.error?.status ?? "";
  const cuotas = (cuerpo?.error?.details ?? []).flatMap((d) => (d.violations ?? []).map((v) => v.quotaId ?? v.quotaMetric ?? ""));
  // Diagnóstico: qué responde Google de verdad. Sin la clave (va en la URL, que no se
  // registra). quotaId dice QUÉ cuota se agotó (por minuto, por día, nivel gratuito…).
  console.error(
    "[IA] Gemini falló",
    JSON.stringify({
      modelo,
      http: respuesta.status,
      status: estado,
      mensaje: detalle.slice(0, 300),
      cuotas,
      reintentarEn: (cuerpo?.error?.details ?? []).find((d) => d.retryDelay)?.retryDelay ?? null,
    }),
  );

  if (respuesta.status === 429 || estado === "RESOURCE_EXHAUSTED") {
    // Por minuto → límite (pasa al otro proveedor). Por día / nivel gratuito / sin detalle →
    // cuota: no se arregla reintentando.
    const porMinuto = cuotas.length > 0 && cuotas.every((q) => /PerMinute/i.test(q));
    throw new ErrorIA("Gemini", porMinuto ? "limite" : "cuota", porMinuto ? "límite por minuto" : "cuota agotada");
  }
  if (respuesta.status === 503 || estado === "UNAVAILABLE" || /high demand|overloaded/i.test(detalle)) {
    throw new ErrorIA("Gemini", "saturado", "saturado");
  }
  if (/API_KEY_INVALID|API key not valid/i.test(detalle) || estado === "UNAUTHENTICATED") {
    throw new ErrorIA("Gemini", "config", "la clave (GEMINI_API_KEY) no es válida o venció");
  }
  if (respuesta.status === 403 || estado === "PERMISSION_DENIED") {
    throw new ErrorIA("Gemini", "config", "la clave no tiene permiso (cuenta, facturación o API sin habilitar)");
  }
  if (respuesta.status === 404 || /not found|no longer available|not supported/i.test(detalle)) {
    const disponibles = (await modelosHabilitados(apiKey)).filter((n) => n.includes("flash")).slice(0, 10);
    throw new ErrorIA(
      "Gemini",
      "config",
      `el modelo "${modelo}" no está disponible` + (disponibles.length ? ` (habilitados: ${disponibles.join(", ")})` : ""),
    );
  }
  if (respuesta.status >= 500) throw new ErrorIA("Gemini", "saturado", "error del servicio");
  throw new ErrorIA("Gemini", "otro", detalle);
}

/** Reintento rápido SOLO ante saturación real, dentro del tope. */
async function llamarConReintentos(modelo: string, apiKey: string, cuerpo: string, timeoutMs: number, limite: number) {
  for (let intento = 0; ; intento++) {
    try {
      return await llamarUnaVez(modelo, apiKey, cuerpo, Math.min(timeoutMs, Math.max(1_000, limite - Date.now())));
    } catch (e) {
      const espera = ESPERAS_REINTENTO_MS[intento];
      if (!(e instanceof ErrorIA) || e.causa !== "saturado" || espera === undefined || Date.now() + espera > limite) throw e;
      await esperar(espera);
    }
  }
}

// ------------------------------------------------------------------ API
export async function generarConGemini(p: PeticionIA, timeoutMs: number): Promise<RespuestaIA> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ErrorIA("Gemini", "config", "falta la clave (GEMINI_API_KEY) en Vercel");

  const partes = p.partes.map((parte) =>
    "texto" in parte ? { text: parte.texto } : { inline_data: { mime_type: parte.archivo.mime, data: parte.archivo.base64 } },
  );
  const cuerpo = JSON.stringify({
    systemInstruction: { parts: [{ text: p.instrucciones }] },
    contents: [{ role: "user", parts: partes }],
    ...(p.busquedaWeb ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: p.temperatura ?? 0,
      ...(p.esquemaJson ? { responseMimeType: "application/json", responseJsonSchema: p.esquemaJson } : {}),
    },
  });
  const limite = Date.now() + timeoutMs + TOPE_REINTENTOS_MS;

  let respuesta: CuerpoGemini;
  let modelo = MODELO_GEMINI;
  try {
    respuesta = await llamarConReintentos(MODELO_GEMINI, apiKey, cuerpo, timeoutMs, limite);
  } catch (e) {
    // Solo la saturación real justifica probar otro modelo, y solo si queda tiempo.
    if (!(e instanceof ErrorIA) || e.causa !== "saturado" || Date.now() >= limite) throw e;
    const [respaldo] = await modelosDeRespaldo(apiKey);
    if (!respaldo) throw e;
    respuesta = await llamarConReintentos(respaldo, apiKey, cuerpo, timeoutMs, limite);
    modelo = respaldo;
  }

  const candidato = respuesta.candidates?.[0];
  return {
    texto: (candidato?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim(),
    fuentesWeb: Array.from(
      new Set((candidato?.groundingMetadata?.groundingChunks ?? []).map((c) => c.web?.uri).filter((u): u is string => Boolean(u))),
    ),
    tokensEntrada: respuesta.usageMetadata?.promptTokenCount ?? 0,
    tokensSalida: respuesta.usageMetadata?.candidatesTokenCount ?? 0,
    proveedor: "Gemini",
    modelo,
  };
}

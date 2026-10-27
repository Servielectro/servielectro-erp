import "server-only";
import { MODELO_GEMINI } from "@/lib/ia/gemini";
import {
  PROMPT_ACTA,
  PROMPT_TRANSCRIPCION,
  SISTEMA_ACTA,
  SISTEMA_TRANSCRIPCION,
  TEMPERATURA_ACTA,
  TEMPERATURA_TRANSCRIPCION,
} from "./prompts";

// Las dos etapas de la app de Jhojan (actas-servielectro/api/gemini.py), igual: audio en línea
// hasta 18 MB y por encima con la Files API; transcripción a temperatura 0 sin criterio propio;
// acta en JSON a 0,2 sobre lo transcrito y nada más. El modelo es el del ERP (lib/ia/gemini.ts).
// NUNCA se llama desde el navegador.

const BASE = "https://generativelanguage.googleapis.com";
const LIMITE_EN_LINEA = 18 * 1024 * 1024;

export class ErrorReunion extends Error {}

function clave(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new ErrorReunion("Falta configurar GEMINI_API_KEY en Vercel.");
  return k;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** El audio largo va por la Files API (subida reanudable) y se espera a que quede ACTIVO. */
async function subirArchivo(bytes: Uint8Array, mime: string): Promise<string> {
  const inicio = await fetch(`${BASE}/upload/v1beta/files?key=${encodeURIComponent(clave())}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "reunion" } }),
  });
  if (!inicio.ok) throw new ErrorReunion(`Gemini no aceptó el audio (${inicio.status}).`);
  const url = inicio.headers.get("X-Goog-Upload-URL");
  if (!url) throw new ErrorReunion("Gemini no devolvió dónde subir el audio.");
  const subida = await fetch(url, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes as BodyInit,
  });
  if (!subida.ok) throw new ErrorReunion(`No se pudo subir el audio a Gemini (${subida.status}).`);
  let info = ((await subida.json()) as { file?: { name?: string; uri?: string; state?: string } }).file ?? {};
  for (let i = 0; i < 40; i++) {
    if (info.state === "ACTIVE" && info.uri) return info.uri;
    if (info.state === "FAILED") throw new ErrorReunion("Gemini no pudo procesar el audio.");
    await esperar(3_000);
    const r = await fetch(`${BASE}/v1beta/${info.name}?key=${encodeURIComponent(clave())}`);
    if (!r.ok) throw new ErrorReunion(`No se pudo consultar el audio en Gemini (${r.status}).`);
    info = (await r.json()) as typeof info;
  }
  throw new ErrorReunion("El audio quedó en procesamiento demasiado tiempo en Gemini.");
}

type Parte = { text: string } | { inline_data: { mime_type: string; data: string } } | { file_data: { mime_type: string; file_uri: string } };

async function parteAudio(bytes: Uint8Array, mimeOriginal: string | null): Promise<Parte> {
  // Gemini no acepta el sufijo de códecs del navegador ("audio/webm;codecs=opus").
  const mime = (mimeOriginal || "audio/webm").split(";")[0].trim();
  if (bytes.byteLength <= LIMITE_EN_LINEA) {
    return { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } };
  }
  return { file_data: { mime_type: mime, file_uri: await subirArchivo(bytes, mime) } };
}

async function generar(partes: Parte[], sistema: string, json: boolean, temperatura: number): Promise<string> {
  const cuerpo = {
    contents: [{ role: "user", parts: partes }],
    systemInstruction: { parts: [{ text: sistema }] },
    generationConfig: { temperature: temperatura, maxOutputTokens: 65_536, ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  const r = await fetch(`${BASE}/v1beta/models/${MODELO_GEMINI}:generateContent?key=${encodeURIComponent(clave())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) {
    const texto = await r.text();
    if (r.status === 429) throw new ErrorReunion("Gemini no tiene cupo ahora (límite de la cuenta). Inténtalo más tarde.");
    throw new ErrorReunion(`Gemini respondió ${r.status}: ${texto.slice(0, 300)}`);
  }
  const datos = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const salida = (datos.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!salida) throw new ErrorReunion("Gemini no devolvió texto.");
  return salida;
}

/** Etapa 1: transcripción literal. */
export async function transcribir(bytes: Uint8Array, mime: string | null): Promise<string> {
  return generar([await parteAudio(bytes, mime), { text: PROMPT_TRANSCRIPCION }], SISTEMA_TRANSCRIPCION, false, TEMPERATURA_TRANSCRIPCION);
}

/** Etapa 2: el acta en JSON, solo sobre la transcripción (y el contexto que dio el usuario). */
export async function redactar(transcripcion: string, contexto: string): Promise<Record<string, unknown>> {
  const texto = contexto ? `${contexto}\n\n--- TRANSCRIPCIÓN ---\n${transcripcion}` : transcripcion;
  const crudo = await generar([{ text: PROMPT_ACTA }, { text: texto }], SISTEMA_ACTA, true, TEMPERATURA_ACTA);
  return leerJson(crudo);
}

function leerJson(crudo: string): Record<string, unknown> {
  try {
    return JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    const m = crudo.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        // cae al error
      }
    }
  }
  throw new ErrorReunion(`No se pudo interpretar el acta que devolvió Gemini: ${crudo.slice(0, 200)}`);
}

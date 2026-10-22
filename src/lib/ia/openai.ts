import "server-only";
import { ErrorIA } from "./errores";
import type { PeticionIA, RespuestaIA } from "./ia";

// OpenAI (Responses API). Primer proveedor desde el 2026-10-22 (Jhojan: "usemos primero
// OpenAI que todavía tengo saldo, y si falla pasa a Gemini"). Clave OPENAI_API_KEY solo en el
// servidor. Sin reintentos propios: si falla, se pasa a Gemini de inmediato.
//
// Modelo: OPENAI_MODELO en Vercel, o el de abajo. Rápido, lee PDF e imagen, da JSON con
// esquema y tiene búsqueda web.
export const MODELO_OPENAI = process.env.OPENAI_MODELO || "gpt-4.1-mini";
const ENDPOINT = "https://api.openai.com/v1/responses";

interface CuerpoOpenAI {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string }> }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: string; type?: string } | null;
}

export async function generarConOpenAI(p: PeticionIA, timeoutMs: number): Promise<RespuestaIA> {
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) throw new ErrorIA("OpenAI", "config", "falta la clave (OPENAI_API_KEY) en Vercel");

  const contenido = p.partes.map((parte) =>
    "texto" in parte
      ? { type: "input_text", text: parte.texto }
      : parte.archivo.mime === "application/pdf"
        ? {
            type: "input_file",
            filename: parte.archivo.nombre,
            file_data: `data:${parte.archivo.mime};base64,${parte.archivo.base64}`,
          }
        : { type: "input_image", image_url: `data:${parte.archivo.mime};base64,${parte.archivo.base64}` },
  );

  const cuerpoPeticion = JSON.stringify({
    model: MODELO_OPENAI,
    instructions: p.instrucciones,
    input: [{ role: "user", content: contenido }],
    temperature: p.temperatura ?? 0,
    ...(p.esquemaJson
      ? { text: { format: { type: "json_schema", name: p.nombreEsquema ?? "respuesta", schema: p.esquemaJson, strict: false } } }
      : {}),
    ...(p.busquedaWeb ? { tools: [{ type: "web_search" }] } : {}),
  });

  let respuesta: Response;
  try {
    respuesta = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
      body: cuerpoPeticion,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new ErrorIA("OpenAI", "tiempo", "no respondió a tiempo");
    throw new ErrorIA("OpenAI", "saturado", "no se pudo conectar");
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as CuerpoOpenAI | null;
  if (!respuesta.ok || !cuerpo || cuerpo.error) {
    const detalle = cuerpo?.error?.message ?? `HTTP ${respuesta.status}`;
    const codigo = cuerpo?.error?.code ?? cuerpo?.error?.type ?? "";
    // Diagnóstico: qué respondió de verdad. Sin la clave (va en un encabezado que no se registra).
    console.error("[IA] OpenAI falló", JSON.stringify({ modelo: MODELO_OPENAI, http: respuesta.status, codigo, mensaje: detalle.slice(0, 300) }));
    if (respuesta.status === 429 && /insufficient_quota|billing/i.test(`${codigo} ${detalle}`)) {
      throw new ErrorIA("OpenAI", "cuota", "sin saldo");
    }
    if (respuesta.status === 429) throw new ErrorIA("OpenAI", "limite", "límite por minuto");
    if (respuesta.status >= 500) throw new ErrorIA("OpenAI", "saturado", "saturado");
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new ErrorIA("OpenAI", "config", "la clave no es válida o no tiene permiso");
    }
    if (respuesta.status === 404 || /model/i.test(codigo)) {
      throw new ErrorIA("OpenAI", "config", `el modelo "${MODELO_OPENAI}" no está disponible`);
    }
    throw new ErrorIA("OpenAI", "otro", detalle);
  }

  const mensajes = (cuerpo.output ?? []).filter((o) => o.type === "message");
  const piezas = mensajes.flatMap((m) => m.content ?? []).filter((c) => c.type === "output_text");
  const texto = piezas.map((c) => c.text ?? "").join("").trim();
  const fuentesWeb = Array.from(
    new Set(
      piezas
        .flatMap((c) => c.annotations ?? [])
        .filter((a) => a.type === "url_citation" && a.url)
        .map((a) => a.url as string),
    ),
  );
  return {
    texto,
    fuentesWeb,
    tokensEntrada: cuerpo.usage?.input_tokens ?? 0,
    tokensSalida: cuerpo.usage?.output_tokens ?? 0,
    proveedor: "OpenAI",
    modelo: MODELO_OPENAI,
  };
}

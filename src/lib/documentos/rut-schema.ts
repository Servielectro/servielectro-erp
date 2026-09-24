import { z } from "zod";

// Esquema de extracción del RUT (Registro Único Tributario, DIAN).
// Estructura investigada contra fuentes reales antes de definirla (ver
// docs/ERP-Servielectro-Modulo1-Proyectos.md §14): casilla 5 = NIT, casilla 6 = DV,
// casilla 53 = "Responsabilidades, Calidades y Atributos" (código 48 = responsable de
// IVA, 49 = no responsable). La casilla 54 es "Intercambio Automático de Información
// CRS" — no tiene que ver con IVA, aunque a veces se confunde con la 53.
//
// Cada campo de texto trae su propio nivel de confianza: nunca se autocompleta a
// ciegas. Si la IA no está segura o el documento está ilegible, confianza="no_legible"
// y valor=null — el panel de confirmación lo deja vacío en vez de adivinar.

export const ConfianzaSchema = z.enum(["alta", "media", "baja", "no_legible"]);
export type Confianza = z.infer<typeof ConfianzaSchema>;

const campoTexto = () =>
  z.object({
    valor: z.string().nullable(),
    confianza: ConfianzaSchema,
  });

export const RutExtraidoSchema = z.object({
  es_documento_rut: z
    .boolean()
    .describe(
      "true solo si el documento es genuinamente un RUT (Registro Único Tributario) de la DIAN de Colombia",
    ),
  tipo_documento_detectado: z
    .string()
    .nullable()
    .describe(
      "Si es_documento_rut es false, qué tipo de documento parece ser (ej. 'cédula', 'factura', 'cámara de comercio', 'foto ilegible'). null si sí es un RUT.",
    ),
  tipo_contribuyente: z
    .enum(["NATURAL", "JURIDICA"])
    .nullable()
    .describe("Persona Natural o Persona Jurídica, según la casilla de tipo de contribuyente"),
  nit: campoTexto().describe("Casilla 5: NIT sin el dígito de verificación, solo dígitos"),
  dv: campoTexto().describe("Casilla 6: dígito de verificación (DV), un solo dígito"),
  razon_social: campoTexto().describe(
    "Razón social (persona jurídica) o nombres y apellidos completos (persona natural)",
  ),
  nombre_comercial: campoTexto().describe("Nombre comercial, si aparece en el documento"),
  direccion: campoTexto().describe("Dirección de domicilio principal"),
  municipio: campoTexto().describe("Municipio / ciudad de domicilio"),
  departamento: campoTexto().describe("Departamento de domicilio"),
  correo: campoTexto().describe("Correo electrónico"),
  telefono: campoTexto().describe("Teléfono o celular de contacto"),
  responsabilidades: z.object({
    codigos: z
      .array(z.string())
      .describe(
        "Todos los códigos de 2 dígitos que aparezcan en la tabla de la casilla 53 (Responsabilidades, Calidades y Atributos), ej. ['05','48']",
      ),
    responsable_iva: z
      .boolean()
      .nullable()
      .describe(
        "true si el código 48 (Impuesto sobre las ventas - responsable de IVA) aparece en la casilla 53. false si aparece el código 49 (no responsable de IVA) y no el 48. null si no se pudo determinar.",
      ),
    confianza: ConfianzaSchema,
  }),
  observaciones: z
    .string()
    .nullable()
    .describe(
      "Cualquier problema para leer el documento: escaneado torcido, borroso, cortado, es una foto de mala calidad, etc. null si no hay observaciones.",
    ),
});

export type RutExtraido = z.infer<typeof RutExtraidoSchema>;

export const INSTRUCCIONES_EXTRACCION_RUT = `Sos un asistente que lee formularios RUT (Registro Único Tributario) de la DIAN de Colombia, para una empresa de seguridad electrónica que cotiza a sus clientes.

Reglas estrictas:
1. Si el documento NO es un RUT (es una cédula, una factura, una foto de otra cosa, o está tan ilegible que no se puede confirmar), marcá es_documento_rut=false y describí qué parece ser en tipo_documento_detectado. No inventes datos de RUT en ese caso.
2. Para cada campo, evaluá tu propia confianza con honestidad:
   - "alta": el texto es nítido y no hay ambigüedad.
   - "media": se lee pero hay algo de duda (baja resolución, letra pequeña).
   - "baja": es un intento, pero fácilmente podría estar mal.
   - "no_legible": no se puede leer con ninguna confianza razonable. En este caso el valor DEBE ser null — no adivines un valor solo para llenar el campo.
3. El NIT (casilla 5) y el DV (casilla 6) son los campos más críticos — un solo dígito mal leído invalida todo. Si tenés cualquier duda sobre un dígito del NIT o del DV, marcá confianza "media" o "baja", nunca "alta".
4. Para responsabilidades (casilla 53): listá TODOS los códigos de 2 dígitos que veas en esa tabla, no solo el 48/49. responsable_iva es true únicamente si ves el código 48 explícitamente, false si ves 49 y no 48, null si la casilla no es legible.
5. Si el documento está torcido, girado o es una foto de baja calidad, hacé tu mejor esfuerzo pero reflejalo en confianza y en observaciones — no ocultes la dificultad.`;

// Generador de prompts de imagen para Marketing (sobre las migraciones 125 y 126).
//
// El ERP redacta el prompt; la imagen la hace Gemini (Nano Banana). Sin "use client" ni
// "server-only" a propósito: la pantalla usa las líneas y el servidor usa las revisiones.
//
// LO QUE IMPORTA DE ESTE ARCHIVO: una instrucción al modelo es un pedido, no una garantía. Por eso
// lo prohibido se cuida tres veces, y dos de ellas no dependen de la IA:
//   1. Antes de llamar: si el gancho o el guion nombran a un cliente, una dirección o una placa,
//      no se llama. El dato del cliente no sale del ERP hacia OpenAI ni Gemini.
//   2. Al recibir: el texto devuelto se revisa con las mismas reglas, más marcas y planos.
//   3. Las restricciones van pegadas por código al final de cada prompt: el modelo no las puede
//      omitir, y son lo que llega a Gemini.

export const LINEAS_NEGOCIO = [
  {
    key: "cctv",
    label: "Seguridad electrónica · CCTV",
    visual: "Unbranded dome or bullet CCTV camera in close-up, or a technician's gloved hands adjusting one, against an out-of-focus generic background.",
    claves: /\b(cctv|camaras?|videovigilancia|dvr|nvr)\b/,
  },
  {
    key: "control_acceso",
    label: "Seguridad electrónica · Control de acceso",
    visual: "Unbranded card or biometric reader, turnstile or door hardware in close-up, in a generic interior that could be anywhere.",
    claves: /\b(control de acceso|torniquetes?|biometric[oa]s?|lectora?s? de tarjeta)\b/,
  },
  {
    key: "alarmas",
    label: "Seguridad electrónica · Alarmas",
    visual: "Unbranded keypad, motion sensor or door contact in close-up, on a plain wall.",
    claves: /\b(alarmas?|intrusion|sensor(es)? de movimiento)\b/,
  },
  {
    key: "deteccion_incendio",
    label: "Seguridad electrónica · Detección de incendio",
    visual: "Unbranded smoke detector, manual pull station or fire panel with blank indicators, in close-up on a neutral ceiling or wall.",
    claves: /\b(incendios?|humo|deteccion de fuego)\b/,
  },
  {
    key: "lectura_placas",
    label: "Seguridad electrónica · Lectura de placas",
    visual: "Unbranded camera beside a generic vehicle barrier, vehicle out of focus and seen at an angle where its plate area is plain and blank.",
    claves: /\b(lectura de placas|lpr|anpr|reconocimiento de placas)\b/,
  },
  {
    key: "cercas",
    label: "Cercas perimetrales",
    visual: "Close-up of insulators and a short stretch of tensioned wire against a blurred sky. Only a fragment: never the whole fence or where it runs.",
    claves: /\b(cercas?|perimetr\w+|concertina)\b/,
  },
  {
    key: "monitoreo",
    label: "Monitoreo",
    visual: "Control-room mood: operator seen from behind and out of focus, screens showing only abstract shapes and soft light, never real video feeds.",
    claves: /\b(monitoreo|central de monitoreo|sala de control)\b/,
  },
  {
    key: "redes",
    label: "Redes de datos",
    visual: "Unbranded network rack, tidy patch cables or fibre connectors in close-up, with shallow depth of field.",
    claves: /\b(redes? de datos|rack|fibra|cableado estructurado|switch(es)?)\b/,
  },
] as const;

export type LineaNegocio = (typeof LINEAS_NEGOCIO)[number]["key"];

const normalizar = (s: string) =>
  ` ${s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/** La línea que parece por el texto, para dejarla preseleccionada. Quien genera la confirma. */
export function lineaSugerida(texto: string): LineaNegocio | "" {
  const t = normalizar(texto);
  // Las más específicas primero: "lectura de placas" también habla de cámaras.
  const orden: LineaNegocio[] = ["lectura_placas", "deteccion_incendio", "control_acceso", "cercas", "monitoreo", "redes", "alarmas", "cctv"];
  return orden.find((k) => LINEAS_NEGOCIO.find((l) => l.key === k)!.claves.test(t)) ?? "";
}

// ------------------------------------------------------------------ nombres de clientes
// Palabras que por sí solas no identifican a nadie: quitarlas del nombre deja el núcleo, y si el
// núcleo solo tiene estas, no se usa (un cliente "Seguridad Total" no puede vetar la palabra).
const SUFIJOS = /\b(s a s|sas|ltda|limitada|s a|e u|p h|ph|propiedad horizontal|bic)\b/g;
const PREFIJOS = /^ *(conjunto residencial|conjunto cerrado|conjunto|edificio|agrupacion de vivienda|agrupacion|urbanizacion|centro comercial|copropiedad|parque residencial|torres?) +/;
const GENERICAS = new Set(
  "seguridad monitoreo control acceso alarmas alarma redes datos camaras cercas cerca electrica electronica servicios servicio soluciones sistemas ingenieria constructora residencial comercial total integral colombia bogota empresa grupo de del la el los las y sede sedes principal norte sur oriente occidente centro oficina oficinas bodega porteria administracion planta casa torre bloque parqueadero".split(" "),
);

/** Formas de un nombre que se van a buscar en el texto: completo y sin "Conjunto…", "S.A.S.". */
function formasDelNombre(nombre: string): string[] {
  const completo = normalizar(nombre);
  const nucleo = normalizar(completo.replace(SUFIJOS, " ").replace(PREFIJOS, " "));
  return [completo, nucleo].filter((f, i, todas) => {
    const p = f.trim().split(" ").filter(Boolean);
    const util = f.trim().length >= 6 && !p.every((x) => GENERICAS.has(x) || /^\d+$/.test(x));
    return util && todas.indexOf(f) === i;
  });
}

export function construirVetados(nombres: (string | null | undefined)[]): { original: string; formas: string[] }[] {
  return nombres
    .filter((n): n is string => !!n?.trim() && !/servielectro/i.test(n))
    .map((n) => ({ original: n.trim(), formas: formasDelNombre(n) }))
    .filter((v) => v.formas.length > 0);
}

// ------------------------------------------------------------------ las reglas
const DIRECCION: RegExp[] = [
  /\b(?:calle|carrera|cra|kra|avenida|diagonal|transversal|autopista)\.?\s*\d+/i,
  /\b[a-z]{1,10}\.?\s*\d+[a-z]?\s*(?:#|n[o°º]\.?)\s*\d+[a-z]?\s*-\s*\d+/i,
  /\b\d+(?:st|nd|rd|th)?\s+(?:street|avenue)\b|\b(?:street|avenue)\s+\d+/i,
];
// Placa colombiana: ABC123 o ABC12D. Se exceptúan siglas técnicas seguidas de número.
const PLACA = /\b(?!(?:UTP|FTP|NVR|DVR|HDD|SSD|POE|IPC|UHD|LED|RAM|VMS|ISO|RGB|MPX|LPR|ANR|CCT)\b)[A-Z]{3}[- ]?\d{2}(?:\d|[A-Z])\b/;
const COORDENADAS = /-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/;
const CONJUNTO_NOMBRADO = [
  /\b(?:Conjunto|Edificio|Torres?|Urbanizaci[oó]n|Centro Comercial|Agrupaci[oó]n|Copropiedad)(?:\s+Residencial)?\s+(?:(?:del?|la|los|las|el)\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/,
  /\b(?:CONJUNTO|EDIFICIO|TORRES?|URBANIZACI[OÓ]N|CENTRO COMERCIAL|AGRUPACI[OÓ]N|COPROPIEDAD)\s+(?:RESIDENCIAL\s+)?[A-ZÁÉÍÓÚÑ]{3,}/,
];
// Lo eléctrico salió del portafolio. OJO: "cerca eléctrica" SÍ es una línea viva, y no cae aquí; y
// RETIE tampoco, porque también aplica a las cercas (pieza A3 del calendario).
const ELECTRICO =
  /\b(?:retilap|subestaci[oó]n(?:es)?|transformador(?:es)?|acometidas?|tableros?\s+el[eé]ctricos?|instalaci[oó]n(?:es)?\s+el[eé]ctricas?|obras?\s+el[eé]ctricas?|mantenimiento\s+el[eé]ctrico|(?:media|baja)\s+tensi[oó]n)\b/i;

// Solo se revisan en lo que devuelve la IA: en un guion, "elimine los puntos ciegos" es un mensaje
// comercial válido; en un prompt de imagen, pide dibujarlos.
const MAPA_DEL_SITIO =
  /\bpuntos?\s+ciegos?\b|\bblind\s*spots?\b|\bplanos?\s+(?:de|del)\b|\bfloor\s*plans?\b|\bblueprints?\b|\bmapa\s+de\s+cobertura\b|\bcoverage\s+map\b|\bsite\s+map\b|\bvista\s+a[eé]rea\b|\baerial\s+(?:view|shot|photo)\b|\bdrone\s+(?:view|shot)\b/i;
const LOGOS = /\blogo(?:tipo)?s?\b|\btrademarks?\b|\bmarcas?\s+registradas?\b/i;
const MARCAS =
  /\b(?:servielectro|hikvision|hik-?connect|dahua|hanwha|uniview|ubiquiti|unifi|cisco|mikrotik|tp-?link|zkteco|suprema|honeywell|bosch|notifier|paradox|panduit|belden|nemtek|stafix|genetec|ezviz|imou|motorola|samsung|sony|apple)\b/i;

function nombreEncontrado(texto: string, vetados: { original: string; formas: string[] }[]) {
  const t = normalizar(texto);
  return vetados.find((v) => v.formas.some((f) => t.includes(f)))?.original;
}

/** Rasgos que identifican un sitio. Sirve para lo que entra y para lo que sale. */
function revisarIdentificacion(texto: string, vetados: { original: string; formas: string[] }[]): string | null {
  const nombre = nombreEncontrado(texto, vetados);
  if (nombre) return `nombra a «${nombre}»`;
  if (DIRECCION.some((r) => r.test(texto))) return "trae una dirección";
  if (PLACA.test(texto)) return "trae una placa de vehículo";
  if (COORDENADAS.test(texto)) return "trae coordenadas";
  const conjunto = CONJUNTO_NOMBRADO.map((r) => r.exec(texto)?.[0]).find(Boolean);
  if (conjunto) return `nombra un conjunto o edificio («${conjunto}»)`;
  return null;
}

export interface EntradaPrompt {
  gancho: string;
  laminas: string[];
  llamado: string;
}

/** Antes de llamar a la IA. Devuelve por qué NO se puede generar, o null. */
export function revisarEntrada(e: EntradaPrompt, vetados: { original: string; formas: string[] }[]): string | null {
  const campos: [string, string][] = [
    ["El gancho", e.gancho],
    ...e.laminas.map((t, i): [string, string] => [`La lámina ${i + 1}`, t]),
    ["El llamado a la acción", e.llamado],
  ];
  for (const [donde, texto] of campos) {
    const problema = revisarIdentificacion(texto, vetados);
    if (problema) return `${donde} ${problema}. Eso identifica la instalación de un cliente y no sale del ERP hacia la IA: quítalo y guarda la idea.`;
    if (ELECTRICO.test(texto)) return `${donde} habla de trabajo eléctrico, que ya no es una línea de Servielectro. Ajusta el texto a una línea vigente.`;
  }
  return null;
}

/** Sobre el texto que devolvió la IA, antes de pegarle las restricciones fijas. */
export function revisarSalida(texto: string, vetados: { original: string; formas: string[] }[]): string | null {
  const problema = revisarIdentificacion(texto, vetados);
  if (problema) return problema;
  if (MAPA_DEL_SITIO.test(texto)) return "describe un plano, una vista aérea o puntos ciegos";
  const marca = MARCAS.exec(texto)?.[0];
  if (marca) return `menciona la marca «${marca}»`;
  if (LOGOS.test(texto)) return "menciona logos o marcas";
  return null;
}

// ------------------------------------------------------------------ armar el pedido
/** Carruseles y similares llevan una imagen por lámina; un post o artículo, una sola. */
export function laminasAGenerar(tipo: string, gancho: string, laminas: string[]): string[] {
  const porLamina = ["carrusel", "caso_obra", "video", "historia"].includes(tipo);
  if (porLamina && laminas.length) return laminas.slice(0, 10);
  return [[gancho, ...laminas].filter(Boolean).join(" · ")];
}

export function formatoImagen(tipo: string, canales: string[]): string {
  if (tipo === "historia") return "9:16";
  if (tipo === "articulo") return "16:9";
  if (tipo === "video") return canales.includes("youtube") || canales.includes("linkedin") ? "16:9" : "9:16";
  return "4:5";
}

export const ESQUEMA_PROMPTS = {
  type: "object",
  properties: {
    piezas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          lamina: { type: "integer" },
          es: { type: "string" },
          en: { type: "string" },
        },
        required: ["lamina", "es", "en"],
      },
    },
  },
  required: ["piezas"],
};

export const INSTRUCCIONES_PROMPTS = `You write image-generation prompts for the social media of a Colombian security-systems integrator. Each image is a background card: the company adds its own text on top later.

For each numbered slide return:
- "en": the prompt in English, 40 to 90 words, describing one concrete photographic scene: subject, setting, light, lens, mood, and a clean area of the frame reserved for text overlay.
- "es": a faithful Spanish version of the same prompt, so a Spanish speaker can read exactly what will be sent.

Base each scene on what that slide says and on the business line given. Make the scenes of one set look like one series (same light and palette). Use the visual direction given for the business line.

Every scene must be fictional, generic and impossible to place: tight framing on the equipment or on hands at work, shallow depth of field, anonymous neutral backgrounds.
Never describe: a client, a named building or complex, an address, a street, a city landmark, a recognizable facade or entrance, a whole perimeter, where equipment is positioned on a site, plans or coverage diagrams, aerial views, vehicle registration details, brands, real people or anyone's face.

Describe only what IS in the image. Do NOT write what must be absent and do not mention logos, text, brands or plates at all: a fixed list of restrictions is appended automatically after your text. Do not state an aspect ratio; it is added automatically too.`;

export function textoDelPedido(p: {
  linea: (typeof LINEAS_NEGOCIO)[number];
  tipo: string;
  gancho: string;
  llamado: string;
  laminas: string[];
}): string {
  return [
    `Business line: ${p.linea.label}.`,
    `Visual direction: ${p.linea.visual}`,
    `Content type: ${p.tipo}.`,
    p.gancho && `Hook (message, in Spanish; do not render it): ${p.gancho}`,
    p.llamado && `Call to action (do not render it): ${p.llamado}`,
    `Return exactly ${p.laminas.length} item(s), numbered from 1:`,
    ...p.laminas.map((t, i) => `Slide ${i + 1}: ${t}`),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Se pegan por código: el modelo no las puede omitir ni reescribir. */
export function conRestricciones(texto: string, idioma: "es" | "en", formato: string): string {
  const fijo =
    idioma === "en"
      ? `Aspect ratio ${formato}. Generic fictional scene. No text, letters or numbers anywhere in the image. No logos, brand names or trademarks on equipment, uniforms or vehicles. No real or recognizable people; no visible faces. Any vehicle plate must be completely blank. No recognizable building, facade, street, address or landmark. No plans, maps or overall views of a site or perimeter.`
      : `Formato ${formato}. Escena genérica y ficticia. Sin texto, letras ni números en ninguna parte de la imagen. Sin logos, marcas ni nombres comerciales en equipos, uniformes o vehículos. Sin personas reales o reconocibles; sin rostros visibles. Toda placa de vehículo completamente en blanco. Sin edificios, fachadas, calles, direcciones ni lugares reconocibles. Sin planos, mapas ni vistas generales de un sitio o perímetro.`;
  return `${texto.trim()}\n\n${fijo}`;
}

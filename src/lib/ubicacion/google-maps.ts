// Ubicación del sitio pegando un enlace de Google Maps (docs/2workers-ubicacion-google-maps-y-
// clientes.md). Pura: sin red, para poder probarla con URLs reales.
//
// La diferencia que importa, y que evita mandar un técnico a quince cuadras:
//   - "lugar":  !3d<lat>!4d<lng> → el lugar MARCADO. Exacto.
//   - "punto":  ?q=<lat>,<lng>, query=, ll=, /search/<lat>,<lng> → un punto buscado. Exacto.
//   - "centro": solo @<lat>,<lng>,<zoom>z → el CENTRO DE LA VISTA, no un punto marcado. Sirve
//               si se amplió al máximo sobre el sitio; con zoom bajo puede estar lejos.
// Si no hay nada de eso, no se inventa: error.

export type ResultadoMaps =
  | {
      ok: true;
      tipo: "lugar" | "punto" | "centro";
      lat: number;
      lng: number;
      zoom: number | null;
      /** Nombre del lugar si la URL lo trae (/place/<nombre>/). Sugerencia, no dirección confirmada. */
      nombre: string | null;
      /** Aviso para mostrar junto al punto (centro de la vista, zoom bajo, fuera de Colombia). */
      aviso: string | null;
    }
  | { ok: false; error: string };

const ZOOM_MINIMO_CONFIABLE = 17;
const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";

/** Hosts de Google Maps aceptados (también para resolver enlaces cortos en el servidor). */
export function esHostDeGoogleMaps(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "maps.app.goo.gl" ||
    h === "goo.gl" ||
    h === "maps.google.com" ||
    /^(www\.)?google\.com(\.[a-z]{2})?$/.test(h) ||
    /^maps\.google\.com(\.[a-z]{2})?$/.test(h) ||
    /^(www\.)?google\.[a-z]{2}$/.test(h)
  );
}

export function esEnlaceCorto(url: URL): boolean {
  return url.hostname === "maps.app.goo.gl" || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps"));
}

function valido(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function fueraDeColombia(lat: number, lng: number) {
  return lat < -5 || lat > 14 || lng < -82 || lng > -66;
}

export function interpretarUrlMaps(texto: string): ResultadoMaps {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return { ok: false, error: "Eso no es un enlace. Copia la dirección completa desde Google Maps." };
  }
  if (url.protocol !== "https:" || !esHostDeGoogleMaps(url.hostname)) {
    return { ok: false, error: "El enlace tiene que ser de Google Maps." };
  }
  if (esEnlaceCorto(url)) {
    return { ok: false, error: "Es un enlace corto: hay que abrirlo primero (se hace en el servidor)." };
  }
  const todo = decodeURIComponent(url.href);
  const nombreLugar = /\/place\/([^/@]+)/.exec(url.pathname)?.[1];
  const nombre =
    nombreLugar && !new RegExp(`^${NUM},${NUM}$`).test(decodeURIComponent(nombreLugar))
      ? decodeURIComponent(nombreLugar).replace(/\+/g, " ").trim()
      : null;

  const armar = (tipo: "lugar" | "punto" | "centro", lat: number, lng: number, zoom: number | null): ResultadoMaps => {
    if (!valido(lat, lng)) return { ok: false, error: "Las coordenadas del enlace no son válidas." };
    const avisos: string[] = [];
    if (tipo === "centro") {
      avisos.push("Es el centro del mapa, no un punto marcado: verifica que el sitio quedó en el centro.");
      if (zoom === null || zoom < ZOOM_MINIMO_CONFIABLE) {
        avisos.push(
          `Con ese acercamiento${zoom !== null ? ` (${zoom}z)` : ""} el punto puede quedar lejos del sitio: amplía al máximo sobre el sitio y copia el enlace otra vez, o marca el lugar.`,
        );
      }
    }
    if (fueraDeColombia(lat, lng)) avisos.push("El punto queda fuera de Colombia: revisa el enlace.");
    return { ok: true, tipo, lat, lng, zoom, nombre, aviso: avisos.length ? avisos.join(" ") : null };
  };

  // 1) El lugar marcado (lo más exacto). Si hay varios, el último es el lugar elegido.
  const marcas = [...todo.matchAll(new RegExp(`!3d${NUM}!4d${NUM}`, "g"))];
  if (marcas.length > 0) {
    const m = marcas[marcas.length - 1];
    return armar("lugar", Number(m[1]), Number(m[2]), null);
  }

  // 2) Un punto buscado: ?q=lat,lng / query= / ll= / destination=, o /search/lat,lng
  for (const clave of ["q", "query", "ll", "destination"]) {
    const v = url.searchParams.get(clave);
    const m = v ? new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`).exec(v) : null;
    if (m) return armar("punto", Number(m[1]), Number(m[2]), null);
  }
  const busqueda = new RegExp(`/(?:search|place)/${NUM},\\+?${NUM}`).exec(todo);
  if (busqueda) return armar("punto", Number(busqueda[1]), Number(busqueda[2]), null);

  // 3) Solo el centro de la vista: @lat,lng,<zoom>z (o <metros>m en la vista de satélite).
  const centro = new RegExp(`@${NUM},${NUM}(?:,(\\d+(?:\\.\\d+)?)([zm]))?`).exec(todo);
  if (centro) {
    const zoom = centro[4] === "z" ? Number(centro[3]) : null;
    return armar("centro", Number(centro[1]), Number(centro[2]), zoom);
  }

  return {
    ok: false,
    error: "El enlace no trae coordenadas. En Google Maps marca el sitio (o amplía al máximo sobre él) y copia el enlace de nuevo.",
  };
}

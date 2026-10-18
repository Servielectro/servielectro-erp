// Service worker del ERP: SOLO hace que la app del técnico (/tecnico) abra sin señal.
// El resto del ERP sigue igual (siempre de la red).
//
//   - /tecnico (navegación): primero la red, con 4 s de espera (en un sótano la red
//     "existe" pero no contesta); si no llega, la última copia guardada.
//   - /_next/static/* pedido desde /tecnico: archivos con nombre único por versión, se
//     guardan la primera vez y se sirven de la copia.
//   - Nada de datos: los datos del técnico viven en IndexedDB, no acá.

const CACHE = "se-tecnico-v1";
const PAGINA = "/tecnico";
const MAX_ARCHIVOS = 200;
const ESPERA_RED_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith("se-tecnico-") && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function conTiempo(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function recortar(cache) {
  const claves = await cache.keys();
  const sobran = claves.length - MAX_ARCHIVOS;
  for (let i = 0; i < sobran; i++) await cache.delete(claves[i]);
}

async function paginaTecnico(request) {
  const cache = await caches.open(CACHE);
  try {
    const respuesta = await conTiempo(fetch(request), ESPERA_RED_MS);
    // Solo se guarda la página real (no la redirección al login de alguien sin sesión).
    if (respuesta.ok && !respuesta.redirected && new URL(respuesta.url).pathname === PAGINA) {
      await cache.put(PAGINA, respuesta.clone());
    }
    return respuesta;
  } catch {
    const copia = await cache.match(PAGINA);
    if (copia) return copia;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>" +
        "<body style='font-family:sans-serif;padding:24px'><h1>Sin conexión</h1>" +
        "<p>Abre la app del técnico una vez con señal para que quede guardada en este celular.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function archivoEstatico(event) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(event.request);
  if (copia) return copia;
  const respuesta = await fetch(event.request);
  if (respuesta.ok) {
    // Solo los que pide la app del técnico: el resto del ERP no llena el celular.
    const cliente = event.clientId ? await self.clients.get(event.clientId) : null;
    const desdeTecnico = !cliente || new URL(cliente.url).pathname.startsWith(PAGINA);
    if (desdeTecnico) {
      await cache.put(event.request, respuesta.clone());
      recortar(cache);
    }
  }
  return respuesta;
}

// La primera vez que se abre /tecnico, sus archivos se bajaron ANTES de que este
// service worker existiera: la página le manda la lista y se guardan acá.
self.addEventListener("message", (event) => {
  const datos = event.data || {};
  if (datos.tipo !== "guardar-archivos" || !Array.isArray(datos.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const u of datos.urls) {
        try {
          const url = new URL(u, self.location.origin);
          if (url.origin !== self.location.origin) continue;
          if (!url.pathname.startsWith("/_next/static/") && url.pathname !== PAGINA) continue;
          const clave = url.pathname === PAGINA ? PAGINA : url.href;
          if (await cache.match(clave)) continue;
          const r = await fetch(url.href, { credentials: "same-origin" });
          if (r.ok && !r.redirected) await cache.put(clave, r);
        } catch {
          // sin red en este momento: se reintenta la próxima vez que se abra con señal
        }
      }
      recortar(cache);
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === PAGINA) {
    event.respondWith(paginaTecnico(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(archivoEstatico(event));
  }
});

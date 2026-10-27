// Service worker del ERP: SOLO hace que las pantallas de campo abran sin señal: la app del
// técnico (/tecnico), el llenado de formatos de SG-SST (/sgsst/campo) y el reporte de un acto
// o condición insegura (/reportar).
// El resto del ERP sigue igual (siempre de la red).
//
//   - /tecnico (navegación): primero la red, con 4 s de espera (en un sótano la red
//     "existe" pero no contesta); si no llega, la última copia guardada.
//   - /_next/static/* y /_next/image (el logo del encabezado) pedidos desde /tecnico: se
//     guardan la primera vez y se sirven de la copia.
//   - Nada de datos: los datos del técnico viven en IndexedDB, no acá.

const CACHE = "se-tecnico-v1"; // no cambiar a la ligera: cambiarlo borra la copia guardada de /tecnico
const estatico = (pathname) => pathname.startsWith("/_next/static/") || pathname.startsWith("/_next/image");
const PAGINAS = ["/tecnico", "/sgsst/campo", "/reportar"];
const esPagina = (pathname) => PAGINAS.includes(pathname);
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

async function paginaDeCampo(request) {
  const cache = await caches.open(CACHE);
  const pagina = new URL(request.url).pathname;
  try {
    const respuesta = await conTiempo(fetch(request), ESPERA_RED_MS);
    // Solo se guarda la página real (no la redirección al login de alguien sin sesión).
    if (respuesta.ok && !respuesta.redirected && new URL(respuesta.url).pathname === pagina) {
      await cache.put(pagina, respuesta.clone());
    }
    return respuesta;
  } catch {
    const copia = await cache.match(pagina);
    if (copia) return copia;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>" +
        "<body style='font-family:sans-serif;padding:24px'><h1>Sin conexión</h1>" +
        "<p>Abre esta pantalla una vez con señal para que quede guardada en este celular.</p>",
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
    const desdeTecnico = !cliente || PAGINAS.some((p) => new URL(cliente.url).pathname.startsWith(p));
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
          if (!estatico(url.pathname) && !esPagina(url.pathname)) continue;
          const clave = esPagina(url.pathname) ? url.pathname : url.href;
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

  if (request.mode === "navigate" && esPagina(url.pathname)) {
    event.respondWith(paginaDeCampo(request));
    return;
  }
  if (estatico(url.pathname)) {
    event.respondWith(archivoEstatico(event));
  }
});

// ---------------------------------------------------------------- Aviso al celular (Web Push)
// Lo manda la Edge Function "enviar-push" con el mismo título y cuerpo de la notificación (sin
// montos: esto sale en la pantalla de bloqueo). Al tocarlo, abre la pantalla de la notificación.
self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { titulo: event.data ? event.data.text() : "Servielectro ERP" };
  }
  const titulo = datos.titulo || "Servielectro ERP";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.cuerpo || "",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: datos.id || undefined,
      requireInteraction: !!datos.urgente,
      data: { ruta: datos.ruta || "/notificaciones" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.ruta) || "/notificaciones", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && "focus" in v) {
          await v.focus();
          if ("navigate" in v) return v.navigate(destino);
          return;
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});

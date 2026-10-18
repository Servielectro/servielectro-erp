import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Cotizaciones y catálogo pasaron a vivir bajo /comercial (ERP modular, 2026-09-25).
  // Redirects reales en vez de páginas puente, para no perder ningún link ni marcador
  // viejo. `permanent: false` (307) a propósito: es una reorganización interna, no
  // queremos que un navegador cachee la redirección para siempre por si vuelve a mover.
  // El service worker de la app del técnico (public/sw.js): nunca en caché, para que
  // cada versión nueva llegue al celular apenas tenga señal.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/cotizaciones",
        destination: "/comercial/cotizaciones",
        permanent: false,
      },
      {
        source: "/cotizaciones/nueva",
        destination: "/comercial/cotizaciones/nueva",
        permanent: false,
      },
      {
        source: "/cotizaciones/:id/imprimir",
        destination: "/comercial/cotizaciones/:id/imprimir",
        permanent: false,
      },
      {
        source: "/cotizaciones/:id",
        destination: "/comercial/cotizaciones/:id",
        permanent: false,
      },
      {
        source: "/catalogo",
        destination: "/comercial/catalogo",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

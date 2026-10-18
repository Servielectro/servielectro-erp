// Foto, GPS y fecha en el celular del técnico.

import type { Ubicacion } from "./db";

const LADO_MAYOR = 1280;
const CALIDAD = 0.7;

/**
 * Comprime la foto APENAS se toma: lado mayor 1280 px, JPEG 70 % (~150–250 KB). El
 * original (3–5 MB) no se guarda nunca: 100 fotos esperando señal ocupan ~20 MB, no
 * medio giga. Re-codificar en canvas además quita los metadatos EXIF.
 * Una foto por vez: en un celular de gama media, decodificar varias de 12 MP a la vez
 * se queda sin memoria.
 */
export async function comprimirFoto(archivo: Blob): Promise<Blob> {
  const imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  try {
    const escala = Math.min(1, LADO_MAYOR / Math.max(imagen.width, imagen.height));
    const ancho = Math.round(imagen.width * escala);
    const alto = Math.round(imagen.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El celular no permitió procesar la foto.");
    ctx.drawImage(imagen, 0, 0, ancho, alto);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", CALIDAD));
    canvas.width = canvas.height = 0; // libera la memoria del canvas ya
    if (!blob) throw new Error("No se pudo comprimir la foto.");
    return blob;
  } finally {
    imagen.close();
  }
}

export async function sha256(blob: Blob | string): Promise<string> {
  const datos = typeof blob === "string" ? new TextEncoder().encode(blob) : await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ubicación al marcar entrada o salida. Nunca seguimiento continuo. Si el técnico
 * niega el permiso, queda registrado "denegado" (para Jhojan es información).
 */
export function obtenerUbicacion(): Promise<Ubicacion> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ estado: "no_disponible", lat: null, lng: null, precisionM: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          estado: "concedido",
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          precisionM: Math.round(pos.coords.accuracy * 10) / 10,
        }),
      (err) =>
        resolve({
          estado: err.code === err.PERMISSION_DENIED ? "denegado" : "sin_senal",
          lat: null,
          lng: null,
          precisionM: null,
        }),
      // En un sótano el GPS puede no llegar: 20 s y se registra "sin señal".
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  });
}

export function hoyBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export const ETIQUETA_GPS: Record<Ubicacion["estado"], string> = {
  concedido: "GPS registrado",
  denegado: "GPS negado por el técnico",
  sin_senal: "Sin señal de GPS",
  no_disponible: "El celular no tiene GPS disponible",
};

// Utilidades para mostrar un formato como DOCUMENTO (vista previa / PDF), no como formulario:
// fechas y números en letras, cédulas con puntos, pesos, y el alcance de texto reconstruido con
// sus encabezados y viñetas. Sin "use client" ni "server-only": funciones puras.

const UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

/** 0 a 999 999, en letras (para días y años; "uno" y no "un"). */
export function numeroEnLetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 30) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d];
  }
  if (n === 100) return "cien";
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const r = n % 100;
    return r ? `${CENTENAS[c]} ${numeroEnLetras(r)}` : CENTENAS[c];
  }
  const miles = Math.floor(n / 1000);
  const r = n % 1000;
  const m = miles === 1 ? "mil" : `${numeroEnLetras(miles).replace(/uno$/, "un")} mil`;
  return r ? `${m} ${numeroEnLetras(r)}` : m;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const partes = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? { a: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};

/** "veintisiete (27) días del mes de octubre de dos mil veintiséis (2026)". */
export function fechaEnLetras(iso: string): string {
  const p = partes(iso);
  if (!p) return iso;
  // "veintiún días", "treinta y un días" (apócope delante del sustantivo).
  const dia = p.d === 1 ? "primer (1.er) día" : `${numeroEnLetras(p.d).replace(/veintiuno$/, "veintiún").replace(/ y uno$/, " y un")} (${p.d}) días`;
  return `${dia} del mes de ${MESES[p.m - 1]} de ${numeroEnLetras(p.a)} (${p.a})`;
}

/** "27 de octubre de 2026". */
export function fechaLarga(iso: string | null | undefined): string | null {
  const p = iso ? partes(iso) : null;
  return p ? `${p.d} de ${MESES[p.m - 1]} de ${p.a}` : null;
}

/** "27/10/2026". */
export function fechaDMA(iso: string | null | undefined): string | null {
  const p = iso ? partes(iso) : null;
  return p ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.a}` : null;
}

/** "1.013.610.482" (solo si son puros dígitos; si no, como viene). */
export function cedulaConPuntos(c: string | null | undefined): string | null {
  const t = (c ?? "").trim();
  if (!t) return null;
  const d = t.replace(/[.\s]/g, "");
  return /^\d+$/.test(d) ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : t;
}

/** "$8.485.267". */
export function pesos(v: unknown): string | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || String(v ?? "").trim() === "") return null;
  return `$${Math.round(n).toLocaleString("es-CO").replace(/,/g, ".")}`;
}

/** Texto o null si está vacío (para pintar la línea de llenar a mano). */
export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t : null;
}

export interface BloqueAlcance {
  encabezado: string | null;
  items: string[];
}
export interface Alcance {
  /** Párrafos antes del primer encabezado (el texto general del alcance). */
  intro: string[];
  bloques: BloqueAlcance[];
}

const VINETA = /^\s*(?:[•·▪◦‣∙*-]|\d+[.)])\s+/;

/**
 * Reconstruye el alcance guardado (saltos de línea y viñetas •) en encabezados y listas.
 * Regla: una línea sin viñeta seguida de viñetas es un encabezado; una línea sin viñeta que no
 * abre lista es un párrafo; antes del primer encabezado, los párrafos son la introducción. Una
 * línea sin viñeta justo después de una viñeta y antes de otra viñeta cuenta como encabezado
 * nuevo (así viene el texto del contrato).
 */
export function parsearAlcance(t: string | null | undefined): Alcance {
  const lineas = (t ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const r: Alcance = { intro: [], bloques: [] };
  let actual: BloqueAlcance | null = null;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (VINETA.test(l)) {
      const item = l.replace(VINETA, "");
      if (!actual) {
        actual = { encabezado: null, items: [] };
        r.bloques.push(actual);
      }
      actual.items.push(item);
      continue;
    }
    const siguienteEsVineta = i + 1 < lineas.length && VINETA.test(lineas[i + 1]);
    if (siguienteEsVineta) {
      actual = { encabezado: l.replace(/:\s*$/, ""), items: [] };
      r.bloques.push(actual);
    } else if (!r.bloques.length) {
      r.intro.push(l);
    } else {
      // Un párrafo suelto después de las listas: va como bloque sin viñetas.
      actual = { encabezado: l, items: [] };
      r.bloques.push(actual);
      actual = null;
    }
  }
  return r;
}

/** Lista de nombres desde un texto (renglones, comas o punto y coma). */
export function nombresDe(t: string | null | undefined): string[] {
  return (t ?? "")
    .split(/[\n;,]+/)
    .map((x) => x.replace(VINETA, "").trim())
    .filter(Boolean);
}

/** "Android · Chrome" a partir del user agent guardado con la firma. */
export function dispositivoCorto(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const so = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iPhone/iPad" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : null;
  const nav = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  return [so, nav].filter(Boolean).join(" · ") || "Navegador web";
}

/**
 * Cédula de quien firma un documento: 6 a 10 dígitos (se aceptan puntos y espacios al escribirla).
 * Devuelve el problema en palabras, o null si está bien. En un documento legal no entra basura.
 */
export function problemaCedula(c: string): string | null {
  const t = c.trim();
  if (!t) return "Escribe el número de cédula de quien firma.";
  const d = t.replace(/[.\s]/g, "");
  if (!/^\d+$/.test(d)) return "La cédula solo lleva números.";
  if (d.length < 6 || d.length > 10) return `La cédula tiene ${d.length} dígitos: debe tener entre 6 y 10. Revísala.`;
  return null;
}

/** La cédula como se guarda: solo los dígitos. */
export const soloDigitos = (c: string) => c.replace(/\D/g, "");

/** Nombre y apellido de la PERSONA que firma (dos palabras como mínimo). */
export function problemaNombre(n: string): string | null {
  const palabras = n.trim().split(/\s+/).filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 2);
  if (!n.trim()) return "Escribe el nombre y apellido de quien firma.";
  if (palabras.length < 2) return "Escribe el nombre Y el apellido de la persona que firma.";
  return null;
}

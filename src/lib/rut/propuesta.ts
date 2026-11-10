// Lo que el RUT propone para la ficha del cliente. Todo es PROPUESTA: la pantalla lo muestra
// marcado y la persona confirma antes de guardar.

import type { ResultadoExtraccionRut } from "@/lib/documentos/extraer-rut";
import type { Confianza } from "@/lib/documentos/rut-schema";
import { bonito, resolverDane, type Municipio, type Responsabilidad } from "./catalogos";

export interface SugerenciaBool {
  valor: boolean;
  /** Por qué se sugiere: "por el código 48 (Impuesto sobre las ventas - IVA) del RUT". */
  porque: string;
  /** true si no lo dijo ningún código: es el caso negativo que se asume (regla de Jhojan, nov 2026). */
  porDefecto?: boolean;
}

export type CampoFiscal = "sugiere_responsable_iva" | "sugiere_declarante_renta";

const QUE: Record<CampoFiscal, { tema: string; no: string }> = {
  sugiere_responsable_iva: { tema: "IVA", no: "no responsable" },
  sugiere_declarante_renta: { tema: "renta", no: "no declarante" },
};

/**
 * LA regla de IVA y renta a partir de los códigos de la casilla 53 (la única copia: la usan la
 * lectura del RUT, la ficha del cliente y el RUT de la cotización). Lo que dice cada código vive en
 * el catálogo `responsabilidades_fiscales` (columnas sugiere_*), no aquí:
 *   1. Un código que dice «no» (49, 53) manda sobre todo: un SIMPLE con 49 no es responsable.
 *   2. Si no, un código que dice «sí» (IVA: 47, 48; renta: 04, 05) → sí.
 *   3. Si no hay ninguno y `porDefecto` → «no», diciendo que es por defecto.
 * Es PROPUESTA: la pantalla la muestra con su `porque` y la persona puede cambiarla antes de guardar.
 * null solo si el catálogo no cargó (sin él no se sabe qué códigos cuentan) o sin `porDefecto`.
 */
export function sugerenciaFiscal(
  codigosRut: string[],
  catalogo: Responsabilidad[],
  campo: CampoFiscal,
  { porDefecto }: { porDefecto: boolean },
): SugerenciaBool | null {
  const cuentan = catalogo.filter((x) => x.sistema === "rut" && x[campo] !== null);
  if (!cuentan.length) return null;
  const codigos = new Set(codigosRut.map((c) => c.trim()).map((c) => (/^\d$/.test(c) ? `0${c}` : c)));
  const lista = (xs: Responsabilidad[]) => xs.map((m) => `${m.codigo} (${m.nombre})`).join(", ");
  const presentes = cuentan.filter((x) => codigos.has(x.codigo));
  const no = presentes.filter((x) => x[campo] === false);
  const si = presentes.filter((x) => x[campo] === true);
  if (no.length) {
    return {
      valor: false,
      porque: `por el código ${lista(no)} del RUT${si.length ? `, que manda sobre ${si.map((m) => m.codigo).join(", ")}` : ""}`,
    };
  }
  if (si.length) return { valor: true, porque: `por el código ${lista(si)} del RUT` };
  if (!porDefecto) return null;
  // Orden del texto: primero los que dicen «sí», de mayor a menor (48, 47, 49, 53 / 05, 04).
  const nombrados = [...cuentan].sort((a, b) => Number(b[campo]) - Number(a[campo]) || (a[campo] ? b.codigo.localeCompare(a.codigo) : a.codigo.localeCompare(b.codigo))).map((x) => x.codigo);
  const enumerados = nombrados.length > 1 ? `${nombrados.slice(0, -1).join(", ")} ni ${nombrados.at(-1)}` : nombrados[0];
  return { valor: false, porDefecto: true, porque: `el RUT no trae código de ${QUE[campo].tema} (${enumerados}): se asume ${QUE[campo].no}` };
}

export interface PropuestaRut {
  nombre: string;
  tipo_documento: "31";
  tipo_persona: "natural" | "juridica" | null;
  nit: string;
  dv: string;
  direccion: string;
  municipio: string;
  departamento: string;
  municipio_dane: string | null;
  /** Por qué no se resolvió el DANE (si no se resolvió). */
  dane_aviso: string | null;
  email: string;
  telefono: string;
  contacto: string;
  responsabilidades_rut: string[];
  responsable_iva: SugerenciaBool | null;
  declarante_renta: SugerenciaBool | null;
  /** Campos que la IA leyó con poca confianza o no pudo leer: revisarlos. */
  revisar: string[];
  nit_coincide: boolean | null;
}

const NOMBRES: Record<string, string> = {
  nit: "NIT",
  dv: "DV",
  razon_social: "nombre o razón social",
  direccion: "dirección",
  municipio: "municipio",
  departamento: "departamento",
  correo: "correo",
  telefono: "teléfono",
  representante_legal: "representante legal",
};

export function armarPropuesta(r: ResultadoExtraccionRut, municipios: Municipio[], catalogo: Responsabilidad[]): PropuestaRut {
  const e = r.extraccion;
  const revisar: string[] = [];
  const v = (clave: keyof typeof NOMBRES, campo: { valor: string | null; confianza: Confianza }) => {
    if (campo.confianza === "no_legible") {
      revisar.push(`${NOMBRES[clave]} (no legible)`);
      return "";
    }
    if (campo.confianza === "baja") revisar.push(`${NOMBRES[clave]} (poca confianza)`);
    return (campo.valor ?? "").trim();
  };
  const municipio = v("municipio", e.municipio);
  const departamento = v("departamento", e.departamento);
  const dane = municipios.length ? resolverDane(municipios, municipio, departamento) : null;
  // Todos los códigos, con dos dígitos ("7" → "07"); lo que no esté en el catálogo también se guarda.
  const codigos = [...new Set(e.responsabilidades.codigos.map((c) => c.trim()).filter(Boolean).map((c) => (/^\d$/.test(c) ? `0${c}` : c)))];

  // Si la casilla 53 no se pudo leer, el «por defecto» sale igual (regla de Jhojan), pero se avisa.
  const casillaDudosa = e.responsabilidades.confianza === "no_legible" || e.responsabilidades.confianza === "baja";
  if (casillaDudosa) revisar.push(`responsabilidades de la casilla 53 (${e.responsabilidades.confianza === "baja" ? "poca confianza" : "no legible"})`);
  const sugerir = (campo: CampoFiscal) => {
    const s = sugerenciaFiscal(codigos, catalogo, campo, { porDefecto: true });
    return s && casillaDudosa && s.porDefecto ? { ...s, porque: `${s.porque} (ojo: la casilla 53 no se leyó bien, revísala en el RUT)` } : s;
  };

  return {
    nombre: v("razon_social", e.razon_social),
    tipo_documento: "31",
    tipo_persona: e.tipo_contribuyente === "NATURAL" ? "natural" : e.tipo_contribuyente === "JURIDICA" ? "juridica" : null,
    nit: v("nit", e.nit).replace(/\D/g, ""),
    dv: v("dv", e.dv).replace(/\D/g, "").slice(0, 1),
    direccion: v("direccion", e.direccion),
    municipio: dane ? bonito(dane.municipio) : municipio,
    departamento: dane ? bonito(dane.departamento) : departamento,
    municipio_dane: dane?.codigo ?? null,
    dane_aviso: dane ? null : municipio ? `No se encontró un único municipio “${municipio}”${departamento ? ` en ${departamento}` : ""}: elígelo de la lista.` : null,
    email: v("correo", e.correo),
    telefono: v("telefono", e.telefono),
    contacto: v("representante_legal", e.representante_legal),
    responsabilidades_rut: codigos,
    responsable_iva: sugerir("sugiere_responsable_iva"),
    declarante_renta: sugerir("sugiere_declarante_renta"),
    revisar,
    nit_coincide: r.nitValidado.coincide,
  };
}

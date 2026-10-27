// Lo que el RUT propone para la ficha del cliente. Todo es PROPUESTA: la pantalla lo muestra
// marcado y la persona confirma antes de guardar.

import type { ResultadoExtraccionRut } from "@/lib/documentos/extraer-rut";
import type { Confianza } from "@/lib/documentos/rut-schema";
import { bonito, resolverDane, type Municipio, type Responsabilidad } from "./catalogos";

export interface SugerenciaBool {
  valor: boolean;
  /** Por qué se sugiere: "lo dice la casilla 53 (código 48 — Impuesto sobre las ventas - IVA)". */
  porque: string;
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

  const sugerir = (campo: "sugiere_responsable_iva" | "sugiere_declarante_renta"): SugerenciaBool | null => {
    const marcas = codigos
      .map((c) => catalogo.find((x) => x.sistema === "rut" && x.codigo === c))
      .filter((x): x is Responsabilidad => !!x && x[campo] !== null);
    if (!marcas.length) return null;
    // Si dos códigos dicen cosas distintas, no se sugiere nada: que lo decida la persona.
    if (new Set(marcas.map((m) => m[campo])).size > 1) return null;
    return { valor: marcas[0][campo] as boolean, porque: `por el código ${marcas.map((m) => `${m.codigo} (${m.nombre})`).join(", ")} del RUT` };
  };
  let responsable_iva = sugerir("sugiere_responsable_iva");
  if (!responsable_iva && e.responsabilidades.responsable_iva !== null) {
    responsable_iva = { valor: e.responsabilidades.responsable_iva, porque: "según la lectura de la casilla 53 del RUT" };
  }

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
    responsable_iva,
    declarante_renta: sugerir("sugiere_declarante_renta"),
    revisar,
    nit_coincide: r.nitValidado.coincide,
  };
}

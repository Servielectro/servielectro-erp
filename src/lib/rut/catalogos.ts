"use client";

// Tablas de referencia que la pantalla necesita (migraciones 79 y 80): municipios con su código
// DANE y el catálogo de responsabilidades fiscales. Se bajan una vez por pestaña.

import { createClient } from "@/lib/supabase/client";

export interface Municipio {
  codigo: string;
  departamento_codigo: string;
  departamento: string;
  municipio: string;
}

export interface Responsabilidad {
  sistema: "rut" | "fe";
  codigo: string;
  nombre: string;
  afecta_facturacion: boolean;
  activa: boolean;
  sugiere_responsable_iva: boolean | null;
  sugiere_declarante_renta: boolean | null;
}

let municipios: Promise<Municipio[]> | null = null;
let responsabilidades: Promise<Responsabilidad[]> | null = null;

export function cargarMunicipios(): Promise<Municipio[]> {
  municipios ??= (async () => {
    const { data, error } = await createClient()
      .from("municipios_dane")
      .select("codigo, departamento_codigo, departamento, municipio")
      .order("departamento")
      .order("municipio")
      .limit(2000);
    if (error) {
      municipios = null;
      throw new Error(error.message);
    }
    return (data ?? []) as Municipio[];
  })();
  return municipios;
}

export function cargarResponsabilidades(): Promise<Responsabilidad[]> {
  responsabilidades ??= (async () => {
    const { data, error } = await createClient()
      .from("responsabilidades_fiscales")
      .select("sistema, codigo, nombre, afecta_facturacion, activa, sugiere_responsable_iva, sugiere_declarante_renta")
      .order("codigo");
    if (error) {
      responsabilidades = null;
      throw new Error(error.message);
    }
    return (data ?? []) as Responsabilidad[];
  })();
  return responsabilidades;
}

/** "BOGOTÁ, D.C." / "Bogotá D.C." / "bogota dc" → "bogota dc". */
export function normalizar(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\bd\s+c\b/g, "dc")
    .replace(/\s+/g, " ")
    .trim();
}

/** "BOGOTÁ, D.C." → "Bogotá, D.C."; "SANTA ROSA DE CABAL" → "Santa Rosa de Cabal". */
export function bonito(t: string): string {
  const menores = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);
  return t
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && menores.has(p) ? p : p.replace(/^(\p{L})/u, (c) => c.toUpperCase())))
    .join(" ")
    .replace(/D\.c\./i, "D.C.");
}

/**
 * El código DANE de un municipio por su nombre (y departamento, si se sabe). Un solo resultado o
 * ninguno: si el nombre es ambiguo (hay varios "San Luis") y no hay departamento, no adivina.
 */
export function resolverDane(lista: Municipio[], municipio: string | null | undefined, departamento?: string | null): Municipio | null {
  const m = normalizar(municipio);
  if (!m) return null;
  const d = normalizar(departamento);
  // "Bogotá" a secas también es Bogotá D.C.
  const iguales = lista.filter((x) => {
    const n = normalizar(x.municipio);
    return n === m || n === `${m} dc` || n.replace(/ dc$/, "") === m;
  });
  if (iguales.length === 1) return iguales[0];
  if (iguales.length > 1 && d) {
    const enDepto = iguales.filter((x) => normalizar(x.departamento) === d || normalizar(x.departamento).startsWith(d) || d.startsWith(normalizar(x.departamento)));
    if (enDepto.length === 1) return enDepto[0];
  }
  return null;
}

/** "código 55 — Informante de Beneficiarios Finales" / "código 99 — sin descripción". */
export function describirResponsabilidad(codigo: string, catalogo: Responsabilidad[], sistema: "rut" | "fe" = "rut"): string {
  const r = catalogo.find((x) => x.sistema === sistema && x.codigo === codigo);
  return r ? `${codigo} — ${r.nombre}` : `código ${codigo} — sin descripción`;
}

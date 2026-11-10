// Pasa los RUT ya leídos (tabla documentos) por la regla de IVA y renta de src/lib/rut/propuesta.ts
// y muestra qué propondría hoy, al lado de lo que tiene guardado el cliente. SOLO LEE: no cambia nada.
//
//   npx tsx --tsconfig ./tsconfig.json scripts/probar-propuesta-rut.mts
//
// La clave de servicio se lee SOLO de SUPABASE_SECRET_KEY en la terminal (CLAUDE.md: nunca en archivos).
// La URL sale de .env.local si no está en la terminal.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { armarPropuesta } from "@/lib/rut/propuesta";
import type { Responsabilidad } from "@/lib/rut/catalogos";
import type { RutExtraido } from "@/lib/documentos/rut-schema";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  readFileSync(".env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
const clave = process.env.SUPABASE_SECRET_KEY;
if (!url || !clave) {
  console.error("Falta SUPABASE_SECRET_KEY en la terminal (o la URL en .env.local).");
  process.exit(1);
}
const db = createClient(url, clave, { auth: { persistSession: false } });

const { data: catalogo, error: eCat } = await db
  .from("responsabilidades_fiscales")
  .select("sistema, codigo, nombre, afecta_facturacion, activa, sugiere_responsable_iva, sugiere_declarante_renta");
if (eCat) throw eCat;
const cat = catalogo as Responsabilidad[];
console.log("Catálogo (rut):", cat.filter((c) => c.sistema === "rut" && (c.sugiere_responsable_iva !== null || c.sugiere_declarante_renta !== null)).map((c) => `${c.codigo} iva=${c.sugiere_responsable_iva} renta=${c.sugiere_declarante_renta}`).join(" | "));

const { data: docs, error } = await db
  .from("documentos")
  .select("id, cliente_id, nombre_archivo, estado, extraccion_json, clientes(nombre, responsable_iva, declarante_renta)")
  .eq("tipo_documento", "RUT")
  .not("extraccion_json", "is", null);
if (error) throw error;
console.log(`\n${docs.length} RUT leídos en documentos.\n`);

const sn = (v: boolean | null | undefined) => (v === true ? "SÍ" : v === false ? "NO" : "—");
for (const d of docs) {
  const e = d.extraccion_json as RutExtraido;
  if (!e?.responsabilidades) {
    console.log(`• ${d.nombre_archivo}: la extracción no trae casilla 53; se salta.\n`);
    continue;
  }
  const p = armarPropuesta({ extraccion: e, nitValidado: { coincide: null, dvCalculado: null }, costoEstimadoUsd: 0, tokensEntrada: 0, tokensSalida: 0, proveedor: "OpenAI" }, [], cat);
  const c = d.clientes as unknown as { nombre: string; responsable_iva: boolean | null; declarante_renta: boolean | null } | null;
  console.log(`• ${d.nombre_archivo} (${d.estado}) — cliente: ${c?.nombre ?? "(sin cliente)"}`);
  console.log(`  Códigos casilla 53: ${p.responsabilidades_rut.join(", ") || "(ninguno)"}  [confianza ${e.responsabilidades.confianza}; la IA dijo responsable_iva=${e.responsabilidades.responsable_iva}]`);
  console.log(`  IVA   → ${sn(p.responsable_iva?.valor)}: ${p.responsable_iva?.porque ?? "(sin propuesta)"}   | guardado hoy: ${sn(c?.responsable_iva)}`);
  console.log(`  Renta → ${sn(p.declarante_renta?.valor)}: ${p.declarante_renta?.porque ?? "(sin propuesta)"}   | guardado hoy: ${sn(c?.declarante_renta)}`);
  if (p.revisar.length) console.log(`  Revisar: ${p.revisar.join(", ")}`);
  console.log();
}

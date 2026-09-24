#!/usr/bin/env node
// Genera el SQL para actualizar SOLO la columna `descripcion` de items_catalogo,
// haciendo match por `codigo`. No inserta ni borra ítems — la carga inicial de
// los 815 ítems ya se hizo directo en la base (ver docs/ERP-Servielectro-Modulo1-Proyectos.md §15).
//
// Uso:
//   node scripts/generar-sql-descripciones.mjs "catalogo/CSE-026-151 ... .xlsm"
//   (si no se pasa ruta, busca el primer .xlsx/.xlsm dentro de catalogo/)
//
// No se conecta a la base de datos — solo lee el Excel y escribe un archivo .sql
// en scripts/output/ para correrlo a mano (o pasárselo a quien tenga acceso MCP
// a Supabase), siguiendo el mismo flujo que se usó para todas las migraciones.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOGO_DIR = join(__dirname, "..", "catalogo");
const OUTPUT_DIR = join(__dirname, "output");
const HOJA_ESPERADA = "CuadroItems";

function encontrarArchivo() {
  const argPath = process.argv[2];
  if (argPath) return argPath;

  const candidatos = readdirSync(CATALOGO_DIR).filter((f) =>
    /\.(xlsx|xlsm)$/i.test(f),
  );
  if (candidatos.length === 0) {
    throw new Error(
      `No hay ningún .xlsx/.xlsm en ${CATALOGO_DIR}. Pasá la ruta como argumento o dejá el archivo ahí.`,
    );
  }
  if (candidatos.length > 1) {
    console.warn(
      `Hay ${candidatos.length} archivos en catalogo/, usando el primero: ${candidatos[0]}`,
    );
  }
  return join(CATALOGO_DIR, candidatos[0]);
}

function detectarColumnas(headerRow) {
  const normalizado = headerRow.map((h) =>
    String(h ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase(),
  );

  const idxCodigo = normalizado.findIndex((h) => h === "item" || /codigo/.test(h));
  const idxDescripcion = normalizado.findIndex((h) => /descripcion/.test(h));

  return { idxCodigo, idxDescripcion };
}

function escaparSql(valor) {
  return valor.replace(/'/g, "''");
}

function main() {
  const rutaArchivo = encontrarArchivo();
  console.log(`Leyendo: ${rutaArchivo}`);

  const buffer = readFileSync(rutaArchivo);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  if (!workbook.SheetNames.includes(HOJA_ESPERADA)) {
    throw new Error(
      `No se encontró la hoja "${HOJA_ESPERADA}". Hojas disponibles: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const hoja = workbook.Sheets[HOJA_ESPERADA];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });

  if (filas.length === 0) {
    throw new Error("La hoja está vacía.");
  }

  const headerRow = filas[0];
  const { idxCodigo, idxDescripcion } = detectarColumnas(headerRow);

  console.log("Encabezados detectados:", headerRow);
  console.log(
    `-> columna código: índice ${idxCodigo} (${headerRow[idxCodigo] ?? "NO ENCONTRADA"})`,
  );
  console.log(
    `-> columna descripción: índice ${idxDescripcion} (${headerRow[idxDescripcion] ?? "NO ENCONTRADA"})`,
  );

  if (idxCodigo === -1 || idxDescripcion === -1) {
    throw new Error(
      "No se pudieron detectar las columnas de código y/o descripción por nombre. " +
        "Revisá los encabezados de arriba y ajustá detectarColumnas() en este script antes de confiar en el resultado.",
    );
  }

  const filasDatos = filas.slice(1);
  const pares = [];
  let vacias = 0;

  for (const fila of filasDatos) {
    const codigo = String(fila[idxCodigo] ?? "").trim();
    const descripcion = String(fila[idxDescripcion] ?? "").trim();
    if (!codigo || !descripcion) {
      vacias++;
      continue;
    }
    pares.push({ codigo, descripcion });
  }

  console.log(`\nFilas totales (sin encabezado): ${filasDatos.length}`);
  console.log(`Filas con código y descripción usables: ${pares.length}`);
  console.log(`Filas descartadas (código o descripción vacíos): ${vacias}`);

  if (pares.length === 0) {
    throw new Error("No quedó ninguna fila usable — no se genera ningún SQL.");
  }

  const valores = pares
    .map((p) => `  ('${escaparSql(p.codigo)}', '${escaparSql(p.descripcion)}')`)
    .join(",\n");

  const sql = `-- Generado por scripts/generar-sql-descripciones.mjs — actualiza SOLO descripcion,
-- por codigo. No inserta ni borra ítems. Revisar el conteo de filas de la consola
-- antes de correr esto contra la base real.
update items_catalogo as ic
set descripcion = v.descripcion
from (values
${valores}
) as v(codigo, descripcion)
where ic.codigo = v.codigo
  and ic.descripcion is distinct from v.descripcion;
`;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const rutaSalida = join(OUTPUT_DIR, "actualizar-descripciones.sql");
  writeFileSync(rutaSalida, sql, "utf8");

  console.log(`\nSQL generado en: ${rutaSalida}`);
  console.log(
    "Revisalo, y corré ese archivo contra la base (SQL Editor de Supabase o el MCP).",
  );
}

main();

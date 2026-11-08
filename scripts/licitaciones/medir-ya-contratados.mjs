// Mide cuántos procesos del radar ya traen documentos de ejecución en SECOP (dmgg-8hin), aunque
// p6dx los muestre «Abierto / No adjudicado». Solo lectura. Se corre tras un barrido:
//   node scripts/licitaciones/medir-ya-contratados.mjs
// Con SUPABASE_ACCESS_TOKEN. Consulta la API pública de Datos Abiertos (metadatos, no archivos).
//
// Señal FUERTE: el documento trae número de contrato, o su nombre es acta de inicio, aceptación de
//   la oferta, orden de compra, un CO1.PCCNTR firmado o «contrato» sin ser borrador.
// Señal DÉBIL: designación de supervisor, «contrato» en un nombre ambiguo. Se cuentan aparte.
// NO cuenta: minuta / modelo / proyecto / borrador de contrato (son precontractuales) ni el acta de
//   cierre (cierre de recepción de ofertas, que ocurre antes de adjudicar).

const PROYECTO = "ehbgasnmsbqxruvjavis";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error("Falta SUPABASE_ACCESS_TOKEN.");

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return JSON.parse(t);
}
async function socrata(dataset, params) {
  const u = new URL(`https://www.datos.gov.co/resource/${dataset}.json`);
  u.search = new URLSearchParams(params).toString();
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${dataset}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
const norm = (t) => ` ${(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

function senal(d) {
  const n = norm(d.nombre_archivo);
  if (/ (minuta|modelo|proyecto|borrador|formato) (del? )?(contrato) /.test(n)) return null;
  if ((d.n_mero_de_contrato ?? "").trim()) return "fuerte";
  if (/ (acta de inicio|acta inicio|aceptacion de (la )?oferta|carta de aceptacion|orden de compra|oc|pccntr) /.test(n)) return "fuerte";
  if (/ contrato /.test(n)) return /(firmado| de compra | no | \d)/.test(n) ? "fuerte" : "debil";
  if (/ (designacion|asignacion) (de )?supervisor /.test(n)) return "debil";
  return null;
}

const filas = await sql(`select id_del_proceso, entidad, modalidad, relevante, requiere_rup, cierra_en,
    (select secop ->> 'id_del_portafolio' from licitaciones l where l.id = v.id) portafolio
  from v_licitaciones_radar v where origen <> 'manual'`);

// Portafolio de las filas que el último barrido no volvió a leer.
const faltan = filas.filter((f) => !f.portafolio);
for (let i = 0; i < faltan.length; i += 100) {
  const lote = faltan.slice(i, i + 100);
  const r = await socrata("p6dx-8zbt", { $select: "id_del_proceso,id_del_portafolio",
    $where: `id_del_proceso in (${lote.map((f) => `'${f.id_del_proceso}'`).join(",")})`, $limit: "1000" });
  for (const x of r) { const f = lote.find((y) => y.id_del_proceso === x.id_del_proceso); if (f) f.portafolio = x.id_del_portafolio; }
}

const porProceso = new Map();
const conPort = filas.filter((f) => f.portafolio);
for (let i = 0; i < conPort.length; i += 50) {
  const lote = conPort.slice(i, i + 50);
  const docs = await socrata("dmgg-8hin", { $select: "proceso,nombre_archivo,n_mero_de_contrato",
    $where: `proceso in (${lote.map((f) => `'${f.portafolio}'`).join(",")})`, $limit: "50000" });
  for (const d of docs) porProceso.set(d.proceso, [...(porProceso.get(d.proceso) ?? []), d]);
}

const clasificar = (f) => {
  const docs = porProceso.get(f.portafolio) ?? [];
  const s = docs.map(senal);
  return { n: docs.length, cat: docs.length === 0 ? "sin_documentos" : s.includes("fuerte") ? "fuerte" : s.includes("debil") ? "debil" : "sin_senal", docs, s };
};
for (const f of filas) f.m = clasificar(f);

const esRE = (f) => /regimen especial/.test(norm(f.modalidad));
function tabla(nombre, xs) {
  const c = (k) => xs.filter((f) => f.m.cat === k).length;
  const conDocs = xs.length - c("sin_documentos");
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "—");
  return { grupo: nombre, procesos: xs.length, sin_documentos: c("sin_documentos"), con_documentos: conDocs, ya_contratado_fuerte: c("fuerte"),
    solo_senal_debil: c("debil"), sin_senal: c("sin_senal"), "fuerte/con_docs": pct(c("fuerte"), conDocs), "fuerte/total": pct(c("fuerte"), xs.length) };
}
console.table([
  tabla("Régimen especial · todos", filas.filter(esRE)),
  tabla("Régimen especial · relevantes", filas.filter((f) => esRE(f) && f.relevante)),
  tabla("Mínima cuantía · todos", filas.filter((f) => /minima cuantia/.test(norm(f.modalidad)))),
  tabla("Otras modalidades · todos", filas.filter((f) => !esRE(f) && !/minima cuantia/.test(norm(f.modalidad)))),
  tabla("TODOS los relevantes", filas.filter((f) => f.relevante)),
]);
console.log("\nRégimen especial con fecha de cierre:", filas.filter((f) => esRE(f) && f.cierra_en).length, "de", filas.filter(esRE).length);
const cruz = {};
for (const f of filas.filter(esRE)) { const k = `${f.cierra_en ? "con cierre" : "sin cierre"} · ${f.m.cat}`; cruz[k] = (cruz[k] ?? 0) + 1; }
console.log("Régimen especial, fecha de cierre contra señal:", cruz);

console.log("\nNombres con señal, para revisar a ojo (régimen especial relevante):");
for (const f of filas.filter((x) => esRE(x) && x.relevante && (x.m.cat === "fuerte" || x.m.cat === "debil"))) {
  const nombres = f.m.docs.filter((d, i) => f.m.s[i]).map((d) => `${f.m.s[f.m.docs.indexOf(d)]}:${d.nombre_archivo}`);
  console.log(` ${f.id_del_proceso} ${(f.entidad ?? "").slice(0, 34).padEnd(34)} ${[...new Set(nombres)].slice(0, 4).join(" | ").slice(0, 130)}`);
}
console.log("\nCon la palabra contrato y descartados como borrador:");
for (const n of new Set([...porProceso.values()].flat().filter((d) => / contrato /.test(norm(d.nombre_archivo)) && senal(d) === null).map((d) => d.nombre_archivo))) console.log("  ", n);

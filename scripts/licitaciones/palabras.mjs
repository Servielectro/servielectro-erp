// Palabras de actividad POR LÍNEA: probarlas contra SECOP real antes de cargarlas, y cargarlas.
//
// Por qué: ~99,9 % de los procesos llegan sin UNSPSC, así que una línea sin palabras da CERO para
// siempre. Hasta la 143 las 14 palabras eran de seguridad_electronica; redes, monitoreo y cercas
// solo tenían códigos. (electrico se apagó el 2026-11-07: «Solo seguridad electrónica».)
//
//   node scripts/licitaciones/palabras.mjs probar scripts/licitaciones/palabras.csv [dias=30]
//       Sin token. Baja de Datos Abiertos los procesos abiertos de los últimos N días y dice, por
//       palabra: cuántos calzan, cuántos en nuestras ciudades, cuántos en modalidad sin RUP, y
//       ejemplos. Así se ve el ruido («cerca» calza «cercanía») antes de que llegue a un aviso.
//   node scripts/licitaciones/palabras.mjs cargar scripts/licitaciones/palabras.csv
//       Con SUPABASE_ACCESS_TOKEN. Inserta las que falten (no duplica), y recalcula la relevancia
//       de lo abierto. La línea tiene que existir: un error de tipeo rebota, no crea una línea nueva.
//
// El CSV: una fila «linea,palabra». Las líneas que empiezan con # se ignoran.
// La regla de calce es la misma de fn_licitacion_palabra_calza (143): minúsculas, sin tildes ni
// signos; la frase tiene que EMPEZAR una palabra del nombre o la descripción; las palabras del medio
// admiten plural (s/es) y la última calza por prefijo. Solo cuenta en procesos SIN código UNSPSC.
// Las 21 palabras confirmadas el 2026-11-07 ya las carga la 143; «cargar» es para las que sigan.

import { readFileSync } from "node:fs";

const PROYECTO = "ehbgasnmsbqxruvjavis";
const LINEAS = ["seguridad_electronica", "redes", "monitoreo", "cercas"];

// Las ubicaciones confirmadas por Jhojan el 2026-11-07 (las mismas que carga la 143; globales, para
// todas las líneas). Solo para «probar»: «cargar» no las usa, la base aplica las suyas.
const DEPTOS = ["bogota", "cundinamarca", "tolima"];
const CIUDADES = ["medellin", "cali", "barranquilla", "bucaramanga", "cartagena", "santa marta", "armenia"];

const norm = (t) =>
  (t ?? "").toLowerCase()
    .replace(/[áàäâ]/g, "a").replace(/[éèëê]/g, "e").replace(/[íìïî]/g, "i").replace(/[óòöô]/g, "o").replace(/[úùüû]/g, "u")
    .replace(/ñ/g, "n").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ").trim();

// Igual que fn_licitacion_palabra_calza (143): la frase empieza una palabra del texto, las palabras
// del medio admiten plural (s/es) y la última calza por prefijo.
const calza = (textoNorm, palabra) => {
  const w = norm(palabra);
  return w.length >= 3 && new RegExp(" " + w.replace(/ /g, "(s|es)? ")).test(` ${norm(textoNorm)} `);
};

function leerCsv(ruta) {
  const filas = [];
  for (const [i, crudo] of readFileSync(ruta, "utf8").split(/\r?\n/).entries()) {
    const l = crudo.trim();
    if (!l || l.startsWith("#") || /^linea\s*,/i.test(l)) continue;
    const coma = l.indexOf(",");
    const linea = l.slice(0, coma).trim(), palabra = l.slice(coma + 1).trim().replace(/^"|"$/g, "");
    if (coma < 0 || !linea || !palabra) throw new Error(`Línea ${i + 1} del CSV mal formada: «${crudo}»`);
    if (norm(palabra).length < 3) throw new Error(`Línea ${i + 1}: «${palabra}» tiene menos de 3 letras: la base la ignoraría.`);
    filas.push({ linea, palabra });
  }
  if (!filas.length) throw new Error("El CSV no trae palabras.");
  return filas;
}

function enZona(p) {
  const depto = norm(p.departamento_entidad), ciudad = norm(p.ciudad_entidad), entidad = ` ${norm(p.entidad)} `;
  const sinCiudad = !ciudad || ciudad === "no definido" || ciudad === "no aplica";
  const calzaCiudad = (c) => ciudad === c || (sinCiudad && entidad.includes(` ${c} `));
  return DEPTOS.some((d) => depto.includes(d)) || CIUDADES.some(calzaCiudad);
}

async function bajarSecop(dias) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const ahora = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 19);   // hora de Colombia
  const where = `fecha_de_publicacion_del >= '${desde}' AND estado_de_apertura_del_proceso = 'Abierto'`
    + ` AND estado_del_procedimiento in ('Publicado','Abierto')`
    + ` AND (fecha_de_recepcion_de IS NULL OR fecha_de_recepcion_de >= '${ahora}')`;
  const campos = "id_del_proceso,entidad,departamento_entidad,ciudad_entidad,nombre_del_procedimiento,"
    + "descripci_n_del_procedimiento,modalidad_de_contratacion,codigo_principal_de_categoria,categorias_adicionales";
  const todas = [];
  for (let off = 0; ; off += 50000) {
    const u = new URL("https://www.datos.gov.co/resource/p6dx-8zbt.json");
    u.search = new URLSearchParams({ $select: campos, $where: where, $order: "id_del_proceso", $limit: "50000", $offset: String(off) });
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Datos Abiertos respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const pag = await r.json();
    todas.push(...pag);
    if (pag.length < 50000) break;
  }
  return todas;
}

async function sql(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Falta SUPABASE_ACCESS_TOKEN en la terminal.");
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${texto}`);
  return JSON.parse(texto);
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const [, , paso, ruta = "scripts/licitaciones/palabras.csv", diasArg] = process.argv;

if (paso === "probar") {
  const filas = leerCsv(ruta);
  for (const f of filas) if (!LINEAS.includes(f.linea)) console.log(`Ojo: «${f.linea}» no es una de las líneas conocidas (${LINEAS.join(", ")}). Al cargar rebotaría.`);
  const dias = Number(diasArg) > 0 ? Number(diasArg) : 30;
  const procesos = await bajarSecop(dias);
  const sinCodigo = procesos.filter((p) => !/\d{8}/.test(`${p.codigo_principal_de_categoria ?? ""} ${p.categorias_adicionales ?? ""}`));
  console.log(`${procesos.length} procesos abiertos publicados en los últimos ${dias} días; ${sinCodigo.length} sin UNSPSC (donde cuentan las palabras).\n`);
  const textos = sinCodigo.map((p) => ({ p, t: ` ${norm(`${p.nombre_del_procedimiento ?? ""} ${p.descripci_n_del_procedimiento ?? ""}`)} ` }));
  const tabla = [];
  for (const f of filas) {
    const calzan = textos.filter((x) => calza(x.t, f.palabra)).map((x) => x.p);
    const zona = calzan.filter((p) => enZona(p));
    const sinRup = zona.filter((p) => /minima cuantia|regimen especial/.test(norm(p.modalidad_de_contratacion)));
    tabla.push({ linea: f.linea, palabra: f.palabra, calzan: calzan.length, en_su_zona: zona.length, zona_y_sin_rup: sinRup.length });
    console.log(`── ${f.linea} · «${f.palabra}»: ${calzan.length} calzan, ${zona.length} en su zona, ${sinRup.length} además sin RUP`);
    for (const p of (sinRup.length ? sinRup : zona.length ? zona : calzan).slice(0, 3)) {
      console.log(`     ${(p.ciudad_entidad ?? "").padEnd(12).slice(0, 12)} ${(p.modalidad_de_contratacion ?? "").slice(0, 22).padEnd(22)} ${(p.descripci_n_del_procedimiento ?? p.nombre_del_procedimiento ?? "").replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  console.log();
  console.table(tabla);
  const porLinea = {};
  for (const x of textos) {
    for (const l of LINEAS) {
      if (filas.some((f) => f.linea === l && calza(x.t, f.palabra)) && enZona(x.p)) porLinea[l] = (porLinea[l] ?? 0) + 1;
    }
  }
  console.log("Procesos distintos en zona, por línea (con estas palabras):", porLinea);
} else if (paso === "cargar") {
  const filas = leerCsv(ruta);
  const existentes = (await sql(`select distinct linea from licitacion_criterios where tipo in ('categoria','palabra') and linea is not null`)).map((r) => r.linea);
  const malas = [...new Set(filas.map((f) => f.linea).filter((l) => !existentes.includes(l)))];
  if (malas.length) throw new Error(`Líneas que no existen en la base: ${malas.join(", ")}. Existen: ${existentes.join(", ")}. No se cargó nada.`);
  const valores = filas.map((f) => `(${lit(f.linea)}, ${lit(f.palabra)})`).join(",\n  ");
  // Una sola sentencia: o entran todas las que faltan, o ninguna.
  const r = await sql(`with nuevas(linea, valor) as (values
  ${valores}),
  ins as (
    insert into licitacion_criterios (tipo, nombre, valor, linea, nota, creado_por, activo)
    select distinct on (n.linea, fn_licitacion_norm(n.valor)) 'palabra', n.valor, n.valor, n.linea,
           'Cargada con scripts/licitaciones/palabras.mjs el ' || current_date,
           -- nombre y creado_por son NOT NULL (drift); por la API auth.uid() es null
           (select c.creado_por from licitacion_criterios c order by c.creado_en limit 1), true
    from nuevas n
    -- solo se salta la que ya está en SU línea; en otra línea el trigger rebota con nombre
    where not exists (select 1 from licitacion_criterios c where c.tipo = 'palabra' and c.linea = n.linea
                      and fn_licitacion_norm(c.valor) = fn_licitacion_norm(n.valor))
    returning linea, valor)
  select (select count(*) from nuevas) en_el_csv, (select count(*) from ins) cargadas,
         (select string_agg(linea || ': ' || valor, ' | ') from ins) detalle`);
  console.table(r);
  const rec = await sql(`select fn_licitaciones_recalcular() as recalculadas`);
  console.log("Relevancia recalculada en lo abierto:", rec[0]);
  console.table(await sql(`select linea, tipo, count(*) n from licitacion_criterios where activo and tipo in ('categoria','palabra') group by 1, 2 order by 1, 2`));
} else {
  console.log("Uso: node scripts/licitaciones/palabras.mjs probar|cargar [archivo.csv] [dias]");
}

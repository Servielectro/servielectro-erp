// Aplica y prueba la 143 contra producción, leyendo los archivos del disco byte por byte (nadie
// copia ni pega SQL). Solo la 143: `supabase db push` arrastraría también la 144 (cron, que va
// apagado hasta ver qué trae el primer barrido a mano) y las 145/146 de Drive.
//
//   node scripts/licitaciones/aplicar.mjs migracion [143|147|148] → aplica esa migración en una transacción
//   node scripts/licitaciones/aplicar.mjs verificar [143|147|148] → su verificación (se revierte sola)
//   node scripts/licitaciones/aplicar.mjs barrido [dias] → dispara barrer-secop una vez (por pg_net,
//                                                          con la clave de Vault: nunca pasa por acá)
//   node scripts/licitaciones/aplicar.mjs ver-barrido   → el último barrido y la respuesta HTTP
//
// Acceso: Management API con SUPABASE_ACCESS_TOKEN en la terminal (no se escribe en ningún archivo).

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const PROYECTO = "ehbgasnmsbqxruvjavis";
const RAIZ = new URL("../../", import.meta.url);
// Las migraciones de licitaciones que este script sabe aplicar (una a la vez, nunca db push).
const MIGRACIONES = {
  143: "supabase/migrations/20261203000143_licitaciones_radar_y_motor.sql",
  147: "supabase/migrations/20261203000147_licitaciones_ficha_y_puerta.sql",
  148: "supabase/migrations/20261203000148_licitaciones_archivos_storage.sql",
};
const VERIFICACIONES = {
  143: "supabase/verificaciones/20261203000143_verificar.sql",
  147: "supabase/verificaciones/20261203000147_verificar.sql",
  148: "supabase/verificaciones/20261203000148_verificar.sql",
};

async function sql(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Falta SUPABASE_ACCESS_TOKEN en la terminal.");
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const texto = await r.text();
  return { ok: r.ok, status: r.status, texto };
}

function leer(ruta) {
  const bytes = readFileSync(new URL(ruta, RAIZ));
  console.log(`${ruta}: ${bytes.length} bytes, sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
  return bytes.toString("utf8");
}

const [, , paso, arg] = process.argv;
// migracion / verificar llevan el número: «migracion 147». Sin número, la 143 (como antes).
const num = (paso === "migracion" || paso === "verificar") ? (arg ?? "143") : null;
if (num && !MIGRACIONES[num]) throw new Error(`No conozco la migración ${num}. Conozco: ${Object.keys(MIGRACIONES).join(", ")}.`);
const MIGRACION = num && MIGRACIONES[num], VERIFICACION = num && VERIFICACIONES[num];

if (paso === "migracion") {
  const marca = { 143: "public.fn_licitaciones_ingerir(uuid,jsonb)", 147: "public.fn_licitacion_decidir(uuid,text,text)", 148: "public.fn_licitacion_decidir(uuid,text,text)" }[num];
  const ya = await sql(`select to_regprocedure('${marca}') is not null as aplicada`);
  if (!ya.ok) throw new Error(ya.texto);
  if (JSON.parse(ya.texto)[0]?.aplicada) console.log(`Aviso: la ${num} ya parece aplicada; es idempotente, se vuelve a pasar.`);
  // begin/commit explícitos: si algo falla a la mitad, no queda nada a medias.
  const r = await sql(`begin;\n${leer(MIGRACION)}\ncommit;`);
  console.log(r.ok ? "APLICADA." : `NO SE APLICÓ (${r.status}):\n${r.texto}`);
  // ¿Lleva la base el historial de migraciones? Solo se informa; no se escribe.
  const h = await sql(`select version from supabase_migrations.schema_migrations where version in ('20261203000142','20261203000143') order by 1`);
  console.log("historial supabase_migrations:", h.ok ? h.texto : `(no disponible: ${h.status})`);
} else if (paso === "verificar") {
  const r = await sql(leer(VERIFICACION));
  // Termina en error a propósito: el informe viene en el mensaje.
  const m = r.texto.match(new RegExp(`INFORME ${num}[\\s\\S]*?se deshizo\\.\\)`));
  console.log(m ? m[0].replace(/\\n/g, "\n") : `Salida inesperada (${r.status}):\n${r.texto}`);
} else if (paso === "barrido") {
  const dias = Number(arg) > 0 ? Number(arg) : 5;
  const r = await sql(`select net.http_post(
      url := 'https://${PROYECTO}.supabase.co/functions/v1/barrer-secop',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-push-token', (select decrypted_secret from vault.decrypted_secrets where name = 'push_token_cron')),
      body := jsonb_build_object('dias', ${dias},
        'app_token', (select decrypted_secret from vault.decrypted_secrets where name = 'socrata_app_token')),
      timeout_milliseconds := 150000) as solicitud`);
  console.log(r.ok ? `Disparado (${dias} días): ${r.texto}. En 1-2 minutos: node scripts/licitaciones/aplicar.mjs ver-barrido` : r.texto);
} else if (paso === "ver-barrido") {
  for (const q of [
    `select id, iniciado_en, terminado_en, leidos, con_actividad, relevantes, nuevos, sin_rup, con_token, error from licitacion_barridos order by iniciado_en desc limit 3`,
    `select id, status_code, left(content, 600) as respuesta, error_msg, created from net._http_response order by created desc limit 3`,
    `select actividad_por, requiere_rup, relevante, count(*) n from v_licitaciones_radar where origen <> 'manual' group by 1, 2, 3 order by 1, 2, 3`,
    `select array_to_string(lineas_que_calzaron, '+') lineas, array_to_string(criterios_faltantes, '+') faltan, count(*) n
       from v_licitaciones_radar where origen <> 'manual' group by 1, 2 order by 3 desc`,
    // muestra: 10 relevantes (las sin RUP primero), con lo que hay que ver para juzgar si sirve
    `select left(entidad, 40) entidad, left(objeto, 90) objeto, left(modalidad, 30) modalidad,
            coalesce(nullif(ciudad, 'No Definido'), '(' || departamento || ')') ciudad,
            array_to_string(lineas_que_calzaron, '+') linea, actividad_por por, afinidad, requiere_rup rup, cierra_en
       from v_licitaciones_radar where origen <> 'manual' and relevante
       order by requiere_rup nulls last, random() limit 10`,
    // y las que quedaron afuera solo por la ubicación (para ver qué ciudades piden abrirse)
    `select coalesce(nullif(ciudad, 'No Definido'), '(' || departamento || ')') ciudad, count(*) n
       from v_licitaciones_radar where origen <> 'manual' and not relevante and 'ubicacion' = any (criterios_faltantes)
       group by 1 order by 2 desc limit 15`,
    `select count(*) avisos, count(distinct destinatario_id) personas from notificaciones where tipo = 'licitacion_sin_rup'`,
  ]) {
    const r = await sql(q);
    if (r.ok) console.table(JSON.parse(r.texto)); else console.log(r.texto);
  }
} else {
  console.log("Uso: node scripts/licitaciones/aplicar.mjs migracion | verificar | barrido [dias] | ver-barrido");
}

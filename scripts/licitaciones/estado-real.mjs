// Estado real del módulo de licitaciones en producción, ANTES de aplicar la 143. Solo lectura.
//
//   node scripts/licitaciones/estado-real.mjs
//
// licitaciones, licitacion_criterios y licitacion_barridos existen en la base pero en ningún
// archivo del repo (drift). La 143 verifica sola lo que asume y se detiene si algo no coincide;
// esto sirve para ver el cuadro completo de una vez y ajustar nombres si hace falta.
//
// Acceso: Management API de Supabase con un token personal en SUPABASE_ACCESS_TOKEN de la
// terminal (no se escribe en ningún archivo, ver CLAUDE.md). De Vault solo se leen NOMBRES.

const PROYECTO = "ehbgasnmsbqxruvjavis";
const TABLAS = "('licitaciones','licitacion_criterios','licitacion_barridos','licitacion_documentos','licitacion_requisitos')";

const CONSULTAS = {
  columnas: `select table_name, column_name, udt_name, is_nullable, column_default, is_generated
             from information_schema.columns where table_schema='public' and table_name in ${TABLAS}
             order by table_name, ordinal_position`,
  restricciones: `select conrelid::regclass::text tabla, conname, pg_get_constraintdef(oid) def
                  from pg_constraint where conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname in ${TABLAS}) order by 1, 2`,
  indices: `select tablename, indexname, indexdef from pg_indexes where schemaname='public' and tablename in ${TABLAS} order by 1, 2`,
  triggers: `select event_object_table tabla, trigger_name, action_timing, string_agg(event_manipulation, ',') eventos
             from information_schema.triggers where event_object_schema='public' and event_object_table in ${TABLAS}
             group by 1, 2, 3 order by 1, 2`,
  politicas: `select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies
              where schemaname='public' and tablename in ${TABLAS} order by 1, 2`,
  vistas: `select viewname, definition from pg_views where schemaname='public' and viewname like '%licitac%'`,
  criterios_por_tipo: `select tipo, linea, activo, count(*) n, (array_agg(valor order by valor))[1:6] muestra
                       from licitacion_criterios group by 1, 2, 3 order by 1, 2, 3`,
  licitaciones: `select count(*) filas, count(*) filter (where id_del_proceso = 'PN-ESPOL-MIC-020-2026') policia from licitaciones`,
  barridos: `select count(*) filas from licitacion_barridos`,
  secciones: `select seccion_id, nombre, href from modulo_secciones where modulo_id='licitaciones' order by orden`,
  quien_tiene_el_modulo: `select r.nombre rol, pr.nivel, (select count(*) from perfiles p where p.rol_id = r.id) perfiles
                          from permisos_rol pr join roles r on r.id = pr.rol_id where pr.modulo_id='licitaciones' order by 1`,
  notificacion_tipos_check: `select conname, pg_get_constraintdef(oid) def from pg_constraint
                             where conrelid='public.notificacion_tipos'::regclass and contype='c'`,
  vault_nombres: `select name from vault.secrets order by name`,
  cron: `select jobname, schedule, active from cron.job order by jobname`,
  extensiones: `select extname, extversion from pg_extension where extname in ('pg_cron','pg_net','unaccent') order by 1`,
  funciones_previas: `select p.oid::regprocedure::text firma, p.prosecdef security_definer from pg_proc p
                      join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname='public' and (p.proname like '%licitac%' or p.proname in ('fn_notificar','fn_notif_con_permiso','fn_permiso_seccion','fn_tiene_permiso_seccion'))
                      order by 1`,
};

async function sql(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Falta SUPABASE_ACCESS_TOKEN en la terminal (token personal de supabase.com/dashboard/account/tokens).");
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),   // todas son SELECT
  });
  const texto = await r.text();
  if (!r.ok) return { error: `${r.status}: ${texto.slice(0, 300)}` };
  return JSON.parse(texto);
}

for (const [nombre, consulta] of Object.entries(CONSULTAS)) {
  console.log(`\n=== ${nombre}`);
  const filas = await sql(consulta);
  if (Array.isArray(filas)) console.table(filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "string" && v.length > 140 ? v.slice(0, 140) + "…" : v]))));
  else console.log(filas);
}

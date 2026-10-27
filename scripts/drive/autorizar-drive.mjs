// Autorizador de Google Drive para el respaldo del ERP. Se corre UNA vez en el PC de la oficina:
//
//     npm run autorizar-drive        ("corre el autorizador de Drive")
//
// Qué hace:
//   1. Lee el cliente OAuth ("App de escritorio") que se descargó de Google Cloud, en
//      C:\Proyectos\.secretos\google-oauth-cliente.json.
//   2. Abre el navegador para que Jhojan autorice con servielectrobogota@gmail.com. Pide SOLO el
//      permiso drive.file: la app ve únicamente los archivos que ella misma crea, nada más del Drive.
//   3. Recibe el código en este PC (servidor local en 127.0.0.1, solo mientras dura) y lo cambia
//      por el refresh token.
//   4. Comprueba la cuenta. Si es otra (por ejemplo la del n8n), lo dice, revoca el permiso y no
//      guarda nada.
//   5. Crea (o reutiliza) en Drive la carpeta "Respaldo ERP Servielectro".
//   6. Escribe C:\Proyectos\.secretos\drive.env (fuera del repositorio) con lo que necesita la
//      función respaldar-drive. Ese archivo NO se commitea ni se manda por chat.
//
// Sin dependencias: solo Node 18+.

import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { exec } from "node:child_process";
import { createInterface } from "node:readline/promises";

const SECRETOS = "C:\\Proyectos\\.secretos";
const CLIENTE = `${SECRETOS}\\google-oauth-cliente.json`;
const SALIDA = `${SECRETOS}\\drive.env`;
const CUENTA = "servielectrobogota@gmail.com";
const CARPETA = "Respaldo ERP Servielectro";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const linea = (t = "") => console.log(t);
const alto = (t) => console.log(`\n!!! ${t}\n`);

function salir(mensaje) {
  alto(mensaje);
  process.exit(1);
}

// ------------------------------------------------------------------ 1) el cliente OAuth
linea("Autorizador de Google Drive para el respaldo del ERP Servielectro");
linea("=".repeat(66));
if (!existsSync(CLIENTE)) {
  salir(`No encuentro ${CLIENTE}.

Antes de correr esto, en https://console.cloud.google.com (con ${CUENTA}):
  1. API y servicios → Biblioteca → habilita "Google Drive API".
  2. Pantalla de consentimiento de OAuth → tipo "Externo", con el permiso .../auth/drive.file
     y NADA más. Después, "Publicar app" (pasar a Producción). Si se queda en "Prueba", el
     permiso se VENCE a los 7 días y el respaldo se cae solo.
  3. Credenciales → Crear credenciales → ID de cliente de OAuth → "App de escritorio".
  4. Descarga el JSON y guárdalo como:
       ${CLIENTE}
Y vuelve a correr: npm run autorizar-drive`);
}
let cliente;
try {
  const j = JSON.parse(readFileSync(CLIENTE, "utf8"));
  cliente = j.installed ?? j.web;
  if (!cliente?.client_id || !cliente?.client_secret) throw new Error("sin client_id/client_secret");
  if (!j.installed) alto('El cliente no es de tipo "App de escritorio". Funciona igual si tiene http://127.0.0.1 permitido, pero lo recomendado es crear uno de escritorio.');
} catch (e) {
  salir(`${CLIENTE} no es el JSON del cliente OAuth (${e.message}).`);
}

// ------------------------------------------------------------------ 2) y 3) autorizar en el navegador
const verificador = randomBytes(48).toString("base64url");
const reto = createHash("sha256").update(verificador).digest("base64url");
const estado = randomBytes(16).toString("hex");

const { codigo, redirect } = await new Promise((resolver, rechazar) => {
  const servidor = createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/") {
      res.writeHead(404).end();
      return;
    }
    const error = u.searchParams.get("error");
    const code = u.searchParams.get("code");
    const ok = !error && code && u.searchParams.get("state") === estado;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<html><body style="font-family:sans-serif;padding:2rem"><h2>${ok ? "Listo: ya puede cerrar esta pestaña y volver a la terminal." : "No se autorizó. Vuelva a la terminal."}</h2></body></html>`);
    servidor.close();
    if (!ok) rechazar(new Error(error ? `Google respondió: ${error}` : "La respuesta no corresponde a esta autorización (state)."));
    else resolver({ codigo: code, redirect: `http://127.0.0.1:${servidor.address().port}/` });
  });
  servidor.listen(0, "127.0.0.1", () => {
    const puerto = servidor.address().port;
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.search = new URLSearchParams({
      client_id: cliente.client_id,
      redirect_uri: `http://127.0.0.1:${puerto}/`,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      login_hint: CUENTA,
      code_challenge: reto,
      code_challenge_method: "S256",
      state: estado,
    }).toString();
    linea(`\nSe va a abrir el navegador. Entra con: ${CUENTA}`);
    linea("(Si Google muestra la otra cuenta, elige \"Usar otra cuenta\".)");
    linea("Si Google avisa que la app no está verificada: es la app del ERP; toca \"Configuración avanzada\" → \"Ir a …\".");
    linea(`\nSi el navegador no se abre, copia esta dirección:\n${auth}\n`);
    exec(`start "" "${auth}"`, { shell: "cmd.exe" });
  });
  setTimeout(() => {
    servidor.close();
    rechazar(new Error("Pasaron 10 minutos sin respuesta del navegador."));
  }, 10 * 60_000).unref();
}).catch((e) => salir(e.message));

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code: codigo,
    client_id: cliente.client_id,
    client_secret: cliente.client_secret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    code_verifier: verificador,
  }),
});
const token = await tokenRes.json();
if (!tokenRes.ok) salir(`Google no entregó el permiso: ${token.error} ${token.error_description ?? ""}`);
if (!token.refresh_token) {
  salir(`Google no entregó el refresh token (pasa cuando ya había un permiso anterior).
Quita el acceso de la app en https://myaccount.google.com/permissions (con ${CUENTA}) y vuelve a correr esto.`);
}
const concedidos = String(token.scope ?? "").split(" ");
if (concedidos.some((s) => s && s !== SCOPE)) {
  alto(`Google concedió permisos de más (${token.scope}). Revisa la pantalla de consentimiento: solo debe pedir drive.file.`);
}

const g = (url, init = {}) => fetch(url, { ...init, headers: { Authorization: `Bearer ${token.access_token}`, ...(init.headers ?? {}) } });
const revocar = () => fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.refresh_token)}`, { method: "POST" });

// ------------------------------------------------------------------ 4) ¿es la cuenta correcta?
const about = await (await g("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)")).json();
const correo = about?.user?.emailAddress ?? "(desconocida)";
if (correo.toLowerCase() !== CUENTA) {
  await revocar();
  salir(`Autorizaste con ${correo}, NO con ${CUENTA}.
Los respaldos quedarían en el Drive equivocado (y sin los 5 TB). Revoqué ese permiso y no guardé nada.
Vuelve a correr "npm run autorizar-drive" y elige ${CUENTA}.`);
}
linea(`Cuenta correcta: ${correo} (${about.user.displayName ?? ""}).`);

// ------------------------------------------------------------------ 5) la carpeta
const q = `name = '${CARPETA}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
const lista = await (await g(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`)).json();
let carpetaId = lista.files?.[0]?.id;
if (carpetaId) {
  linea(`La carpeta "${CARPETA}" ya existía (la creó esta app antes): se reutiliza.`);
} else {
  const r = await g("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: CARPETA, mimeType: "application/vnd.google-apps.folder" }),
  });
  const j = await r.json();
  if (!r.ok) salir(`No se pudo crear la carpeta en Drive: ${JSON.stringify(j.error ?? j)}`);
  carpetaId = j.id;
  linea(`Carpeta creada en Drive: "${CARPETA}".`);
}

// ------------------------------------------------------------------ 6) el archivo de secretos
if (existsSync(SALIDA)) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = (await rl.question(`\nYa existe ${SALIDA}. ¿Reemplazarlo? (s/N) `)).trim().toLowerCase();
  rl.close();
  if (r !== "s") {
    await revocar();
    salir("No se reemplazó. Revoqué el permiso nuevo; el anterior sigue como estaba.");
  }
}
mkdirSync(SECRETOS, { recursive: true });
writeFileSync(
  SALIDA,
  [
    `# Respaldo del ERP en Google Drive (${CUENTA}). Generado ${new Date().toISOString()}.`,
    "# SECRETO: no se commitea, no se manda por chat. Se carga con: npx supabase secrets set --env-file <este archivo>",
    `DRIVE_CLIENT_ID=${cliente.client_id}`,
    `DRIVE_CLIENT_SECRET=${cliente.client_secret}`,
    `DRIVE_REFRESH_TOKEN=${token.refresh_token}`,
    `DRIVE_FOLDER_ID=${carpetaId}`,
    "",
  ].join("\n"),
  { encoding: "utf8" },
);

linea(`\nListo. Quedó en ${SALIDA}.`);
linea(`
Siguientes pasos (docs/respaldo-drive.md):
  1. En Google Cloud, la pantalla de consentimiento tiene que estar PUBLICADA ("En producción").
     Si dice "Prueba", el permiso que acabas de dar vence en 7 días.
  2. Cargar los secretos en Supabase:
       npx supabase secrets set --env-file "${SALIDA}" --project-ref <ref del proyecto>
  3. Publicar la función:
       npx supabase functions deploy respaldar-drive --project-ref <ref del proyecto>
  4. Crear el cron en Supabase (Integrations → Cron), como el de enviar-push.`);
